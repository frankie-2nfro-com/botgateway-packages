// FamilyHealthRecords (DOCUMENTATIONS/app_familyhealthrecord_requirements.txt part B): a family's health documents and
// the values in them, per member, on the owner's computer. The owner's bot reads each document (host.ai);
// the assistant may read the members the owner allows (tools). A personal archive - not medical advice.

const CATEGORIES = ["bloodTest", "doctorReport", "prescription", "imaging", "bloodPressure", "weight", "glucose", "vaccination", "food", "other"];
const KINDS = ["lab", "blood_pressure", "pulse", "weight", "height", "glucose", "temperature", "medication", "visit", "vaccination", "imaging", "food", "note"];
const RELATIONS = ["self", "partner", "child", "parent", "other"];
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
// Below this the AI's reading is "needs check" (the owner confirms or corrects it).
const SURE = 0.6;
// A run with no answer after this long (the gateway restarted, the bot was away) can be tried again.
const STALE_MS = 30 * 60 * 1000;
const NOT_ADVICE = "A personal archive of what the documents say - not medical advice.";

const now = () => new Date().toISOString();
const q = (sql, p = []) => host.db.query(sql, p);
const one = (sql, p = []) => host.db.query(sql, p)[0] || null;
const run = (sql, p = []) => host.db.exec(sql, p);
const fail = (msg) => { const e = new Error(msg); e.plain = true; return e; };
const text = (v, max = 500) => String(v ?? "").trim().slice(0, max);

// --- data --------------------------------------------------------------------------------------------------

export function onInstall() {
  host.db.script(`
    CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, relation TEXT NOT NULL DEFAULT 'other',
      birth_year INTEGER, color TEXT NOT NULL DEFAULT '#2f6fdf', ai TEXT NOT NULL DEFAULT 'read', archived INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      file TEXT NOT NULL, original_name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, fingerprint TEXT NOT NULL,
      category TEXT, doc_date TEXT, clinic TEXT, doctor TEXT, summary TEXT, confidence REAL,
      status TEXT NOT NULL, reason TEXT, run TEXT, run_at TEXT, source TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS documents_member ON documents (member_id, doc_date);
    CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, observed_at TEXT,
      value REAL, value_text TEXT, unit TEXT, ref_low REAL, ref_high REAL, flag TEXT, extras TEXT, source TEXT NOT NULL,
      confidence REAL, created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_member ON records (member_id, kind, observed_at);
    PRAGMA user_version = 1;
  `);
}

export function onUpdate() {
  onInstall();
}

function member(id) {
  const m = one("SELECT * FROM members WHERE id = ?", [Number(id)]);
  if (!m) throw fail("no such member");
  return m;
}

const memberView = (m) => ({ id: m.id, name: m.name, relation: m.relation, birth_year: m.birth_year, color: m.color, ai: m.ai, archived: !!m.archived,
  documents: one("SELECT count(*) AS n FROM documents WHERE member_id = ?", [m.id]).n,
  records: one("SELECT count(*) AS n FROM records WHERE member_id = ?", [m.id]).n });

function saveMember(b) {
  const name = text(b.name, 60);
  if (!name) throw fail("a member needs a name");
  const relation = RELATIONS.includes(b.relation) ? b.relation : "other";
  const year = Number(b.birth_year) || null;
  if (year && (year < 1900 || year > new Date().getFullYear())) throw fail("birth year: 1900 - this year");
  const color = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#2f6fdf";
  const ai = b.ai === "off" ? "off" : "read";
  const same = one("SELECT id FROM members WHERE lower(name) = lower(?) AND id != ?", [name, Number(b.id) || 0]);
  if (same) throw fail(`there is already a member called ${name}`);
  if (b.id) {
    member(b.id);
    run("UPDATE members SET name = ?, relation = ?, birth_year = ?, color = ?, ai = ?, archived = ? WHERE id = ?",
      [name, relation, year, color, ai, b.archived ? 1 : 0, Number(b.id)]);
    return memberView(member(b.id));
  }
  const r = run("INSERT INTO members (name, relation, birth_year, color, ai, created) VALUES (?, ?, ?, ?, ?, ?)", [name, relation, year, color, ai, now()]);
  return memberView(member(r.last_id));
}

// A member deleted: its documents' files too (the database rows go with ON DELETE CASCADE).
function deleteMember(id, confirm) {
  const m = member(id);
  if (text(confirm) !== m.name) throw fail(`type the member's name (${m.name}) to delete it with all its documents`);
  for (const d of q("SELECT file FROM documents WHERE member_id = ?", [m.id])) host.files.remove(d.file);
  run("DELETE FROM members WHERE id = ?", [m.id]);
  return { deleted: m.name };
}

const docView = (d) => d && ({ id: d.id, member_id: d.member_id, name: d.original_name, media_type: d.media_type, size: d.size,
  category: d.category, date: d.doc_date, clinic: d.clinic, doctor: d.doctor, summary: d.summary, confidence: d.confidence,
  status: stale(d) ? "failed" : d.status, reason: stale(d) ? "no answer from the assistant (the gateway restarted or the bot was away) - try again" : d.reason,
  source: d.source, created: d.created, records: one("SELECT count(*) AS n FROM records WHERE document_id = ?", [d.id]).n });
const stale = (d) => d.status === "reading" && Date.now() - Date.parse(d.run_at || d.updated) > STALE_MS;

const recordView = (r) => ({ id: r.id, member_id: r.member_id, document_id: r.document_id, kind: r.kind, title: r.title, observed_at: r.observed_at,
  value: r.value, value_text: r.value_text, unit: r.unit, ref_low: r.ref_low, ref_high: r.ref_high, flag: r.flag,
  extras: r.extras ? JSON.parse(r.extras) : null, source: r.source, confidence: r.confidence });

// --- documents: kept, then read by the owner's bot ---------------------------------------------------------

function fingerprint(data) {
  return host.crypto.hmac("familyhealthrecords", data, { data_encoding: "base64" }).hex;
}

// {member_id, name, media_type, data (base64), source, force} -> the document (reading). A file already kept
// for the member (same bytes) is refused unless `force`.
function addDocument(b) {
  const m = member(b.member_id);
  const type = String(b.media_type || "").toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw fail(`${text(b.name, 80)}: PDF, JPEG, PNG, WebP or GIF only (a HEIC photo: the page converts it, or save it as JPEG)`);
  const data = String(b.data || "").replace(/^data:[^,]*,/, "");
  if (!data) throw fail("the file is empty");
  const fp = fingerprint(data);
  const dup = one("SELECT original_name, created FROM documents WHERE member_id = ? AND fingerprint = ?", [m.id, fp]);
  if (dup && !b.force) throw fail(`DUPLICATE: ${m.name} already has this file (${dup.original_name}, added ${dup.created.slice(0, 10)})`);
  const t = now();
  const r = run(`INSERT INTO documents (member_id, file, original_name, media_type, size, fingerprint, status, source, created, updated)
    VALUES (?, '', ?, ?, 0, ?, 'uploaded', ?, ?, ?)`, [m.id, text(b.name, 200) || `document.${ext}`, type, fp, b.source === "inbox" ? "inbox" : "page", t, t]);
  const file = `doc-${r.last_id}.${ext}`;
  try {
    const info = host.files.write(file, data, "base64");
    run("UPDATE documents SET file = ?, size = ? WHERE id = ?", [file, info.size, r.last_id]);
  } catch (e) {
    run("DELETE FROM documents WHERE id = ?", [r.last_id]);
    throw e;
  }
  read(r.last_id);
  return docView(one("SELECT * FROM documents WHERE id = ?", [r.last_id]));
}

const ENTITY = {
  type: "object", required: ["kind", "title"],
  properties: {
    kind: { type: "string", enum: KINDS },
    title: { type: "string", maxLength: 200 },
    observed_at: { type: ["string", "null"], maxLength: 40 },
    value: { type: ["number", "null"] },
    value_text: { type: ["string", "null"], maxLength: 500 },
    unit: { type: ["string", "null"], maxLength: 40 },
    ref_low: { type: ["number", "null"] },
    ref_high: { type: ["number", "null"] },
    flag: { type: ["string", "null"], enum: ["high", "low", "normal", "abnormal", null] },
    extras: { type: ["object", "null"] },
  },
};
const SCHEMA = {
  type: "object", required: ["is_health_document", "category", "confidence", "entities"],
  properties: {
    is_health_document: { type: "boolean" },
    problem: { type: ["string", "null"], maxLength: 500 },
    category: { type: "string", enum: CATEGORIES },
    document_date: { type: ["string", "null"], maxLength: 10 },
    clinic: { type: ["string", "null"], maxLength: 200 },
    doctor: { type: ["string", "null"], maxLength: 200 },
    summary: { type: ["string", "null"], maxLength: 1000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    entities: { type: "array", maxItems: 200, items: ENTITY },
  },
};

function task(d, m, hint) {
  return `Read this personal health document of ${m.name}${m.birth_year ? ` (born ${m.birth_year})` : ""} and return what it says, as JSON.
- is_health_document: false if it is not a health document, blank or unreadable - then say why in problem and give no entities.
- category: one of ${CATEGORIES.join(", ")}${hint ? ` (the owner says it is: ${hint})` : ""}.
- document_date: the date of the test / visit / measurement as YYYY-MM-DD (not the print date), or null.
- clinic, doctor: as written, or null. summary: one or two plain sentences in the document's own language.
- entities: every value the document states, one per value. kind: ${KINDS.join(", ")}.
  lab: title = the test name as written (e.g. "HbA1c"), value = the number, unit, ref_low / ref_high = the reference range, flag = high / low / normal / abnormal if marked or clear from the range.
  blood_pressure: title "Blood pressure", value = systolic, extras {systolic, diastolic, pulse}. medication: title = the drug, extras {dose, frequency, days}.
  visit / imaging: title = what it was, value_text = the diagnosis or findings as written. Text values (e.g. "negative") go in value_text.
  observed_at: the date (YYYY-MM-DD or full time) of that value, usually the document_date.
- Copy values exactly; never guess a value that is not written. confidence: 0-1, how sure you are that you read it right.
- Never give medical advice.`;
}

// Starts (or restarts) the bot's reading of a document.
function read(id, hint) {
  const d = one("SELECT * FROM documents WHERE id = ?", [id]);
  if (!d) throw fail("no such document");
  const m = member(d.member_id);
  const { run: r } = host.ai.run({ task: task(d, m, hint && CATEGORIES.includes(hint) ? hint : ""), schema: SCHEMA,
    data: { file: d.original_name, member: m.name }, files: [d.file], tag: { document: d.id } });
  run("UPDATE documents SET status = 'reading', reason = NULL, run = ?, run_at = ?, updated = ? WHERE id = ?", [r, now(), now(), d.id]);
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 25) : null);

export function onAiResult(r) {
  const id = r.tag?.document;
  const d = id && one("SELECT * FROM documents WHERE id = ?", [id]);
  // Deleted meanwhile, or read again since: this answer is not used.
  if (!d || d.run !== r.run) return;
  if (r.state !== "done") {
    run("UPDATE documents SET status = 'failed', reason = ?, updated = ? WHERE id = ?", [text(r.error || "the assistant could not read it"), now(), d.id]);
    return;
  }
  const a = r.answer;
  const date = day(a.document_date);
  host.db.transaction(() => {
    run("DELETE FROM records WHERE document_id = ? AND source = 'ai'", [d.id]);
    if (!a.is_health_document) {
      run("UPDATE documents SET status = 'needs_check', reason = ?, category = 'other', summary = ?, confidence = ?, updated = ? WHERE id = ?",
        [text(a.problem || "not a health document, or it could not be read"), text(a.summary, 1000) || null, num(a.confidence), now(), d.id]);
      return;
    }
    for (const e of a.entities) {
      run(`INSERT INTO records (member_id, document_id, kind, title, observed_at, value, value_text, unit, ref_low, ref_high, flag, extras, source, confidence, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
        [d.member_id, d.id, e.kind, text(e.title, 200), day(e.observed_at) || date, num(e.value), text(e.value_text, 500) || null, text(e.unit, 40) || null,
         num(e.ref_low), num(e.ref_high), e.flag || null, e.extras ? JSON.stringify(e.extras).slice(0, 4000) : null, num(a.confidence), now()]);
    }
    const sure = a.confidence >= SURE && a.category !== "other";
    run(`UPDATE documents SET status = ?, reason = ?, category = ?, doc_date = ?, clinic = ?, doctor = ?, summary = ?, confidence = ?, updated = ? WHERE id = ?`,
      [sure ? "ready" : "needs_check", sure ? null : a.category === "other" ? "the category is unclear - please check it" : "the assistant is not sure it read it right - please check",
       a.category, date, text(a.clinic, 200) || null, text(a.doctor, 200) || null, text(a.summary, 1000) || null, a.confidence, now(), d.id]);
  });
}

function deleteDocument(id) {
  const d = one("SELECT * FROM documents WHERE id = ?", [Number(id)]);
  if (!d) throw fail("no such document");
  host.files.remove(d.file);
  run("DELETE FROM documents WHERE id = ?", [d.id]);
  return { deleted: d.id };
}

// --- inbox: files the owner put into the inbox folder (a sub-folder named after a member = that member) ----

const plain = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
function inboxList() {
  let files;
  try { files = host.inbox.list(); } catch (e) { return { available: false, reason: e.message, files: [] }; }
  const members = q("SELECT id, name FROM members WHERE archived = 0");
  return {
    available: true,
    files: files.map((f) => {
      const m = f.folder && members.find((x) => plain(x.name) === plain(f.folder));
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", heic: "image/heic", heif: "image/heif" }[ext] || "";
      return { ...f, media_type: type, member_id: m ? m.id : null, member: m ? m.name : null };
    }),
  };
}

// {folder, name, member_id, data?, media_type?}: kept (data = the page's smaller photo, else the file as it is),
// then moved to the inbox's done/ (or rejected/ with the reason).
function importFile(b) {
  const f = { folder: String(b.folder || ""), name: String(b.name || "") };
  const data = b.data || host.inbox.read(f);
  let doc;
  try {
    doc = addDocument({ member_id: b.member_id, name: f.name, media_type: b.media_type, data, source: "inbox", force: b.force });
  } catch (e) {
    // A duplicate stays in the inbox until the owner decides; anything else unusable is set aside with the reason.
    if (!e.message.startsWith("DUPLICATE") && e.plain) host.inbox.reject(f, e.message);
    throw e;
  }
  host.inbox.done(f);
  return doc;
}

// --- the page (local page only) -----------------------------------------------------------------------------

export function handle(req) {
  if (req.who !== "owner") return { $response: { status: 403, body: "FamilyHealthRecords has no website" } };
  try {
    return page(req);
  } catch (e) {
    return { $response: { status: 400, headers: { "content-type": "text/plain; charset=utf-8" }, body: e.message } };
  }
}

function page(req) {
  const path = req.path.replace(/^\/+/, ""), get = req.method === "GET", qs = req.query || {};
  const b = !get && req.body ? JSON.parse(req.body) : {};
  if (get && path === "state") {
    return { members: q("SELECT * FROM members ORDER BY archived, created").map(memberView), categories: CATEGORIES, kinds: KINDS, relations: RELATIONS,
      not_advice: NOT_ADVICE, inbox: inboxList() };
  }
  if (!get && path === "members") return saveMember(b);
  if (!get && path === "members/delete") return deleteMember(b.id, b.confirm);
  if (get && path === "documents") {
    const m = qs.member ? member(qs.member) : null;
    const rows = m ? q("SELECT * FROM documents WHERE member_id = ? ORDER BY COALESCE(doc_date, substr(created, 1, 10)) DESC, id DESC LIMIT 1000", [m.id])
      : q("SELECT * FROM documents ORDER BY id DESC LIMIT 1000");
    return rows.map(docView);
  }
  if (get && path === "document") {
    const d = one("SELECT * FROM documents WHERE id = ?", [Number(qs.id)]);
    if (!d) throw fail("no such document");
    return { ...docView(d), items: q("SELECT * FROM records WHERE document_id = ? ORDER BY id", [d.id]).map(recordView) };
  }
  if (get && path === "file") {
    const d = one("SELECT file, original_name FROM documents WHERE id = ?", [Number(qs.id)]);
    if (!d) return { $response: { status: 404, body: "no such document" } };
    return { $response: { file: d.file, download: qs.download === "1" } };
  }
  if (!get && path === "upload") return addDocument({ ...b, source: "page" });
  if (!get && path === "documents/read") {
    const d = one("SELECT * FROM documents WHERE id = ?", [Number(b.id)]);
    if (!d) throw fail("no such document");
    if (b.member_id && Number(b.member_id) !== d.member_id) {
      member(b.member_id);
      run("UPDATE documents SET member_id = ? WHERE id = ?", [Number(b.member_id), d.id]);
      run("UPDATE records SET member_id = ? WHERE document_id = ?", [Number(b.member_id), d.id]);
    }
    read(d.id, b.category);
    return docView(one("SELECT * FROM documents WHERE id = ?", [d.id]));
  }
  if (!get && path === "documents/confirm") {
    // The owner checked it: the category (and the member) as the owner says, the values kept.
    const d = one("SELECT * FROM documents WHERE id = ?", [Number(b.id)]);
    if (!d) throw fail("no such document");
    const cat = CATEGORIES.includes(b.category) ? b.category : d.category;
    run("UPDATE documents SET status = 'ready', reason = NULL, category = ?, doc_date = COALESCE(?, doc_date), updated = ? WHERE id = ?", [cat, day(b.date), now(), d.id]);
    return docView(one("SELECT * FROM documents WHERE id = ?", [d.id]));
  }
  if (!get && path === "documents/delete") return deleteDocument(b.id);
  if (get && path === "records") {
    const m = member(qs.member);
    const year = /^\d{4}$/.test(qs.year || "") ? qs.year : null;
    return q(`SELECT * FROM records WHERE member_id = ? ${year ? "AND substr(observed_at, 1, 4) = ?" : ""} ORDER BY kind, title, observed_at DESC LIMIT 5000`,
      year ? [m.id, year] : [m.id]).map(recordView);
  }
  if (!get && path === "records") {
    // A value the owner enters by hand (no document).
    const m = member(b.member_id);
    if (!KINDS.includes(b.kind)) throw fail("unknown kind");
    const at = day(b.observed_at) || now().slice(0, 10);
    const r = run(`INSERT INTO records (member_id, kind, title, observed_at, value, value_text, unit, extras, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
      [m.id, b.kind, text(b.title, 200) || b.kind, at, num(Number(b.value)), text(b.value_text, 500) || null, text(b.unit, 40) || null,
       b.extras ? JSON.stringify(b.extras).slice(0, 4000) : null, now()]);
    return recordView(one("SELECT * FROM records WHERE id = ?", [r.last_id]));
  }
  if (!get && path === "records/delete") {
    run("DELETE FROM records WHERE id = ?", [Number(b.id)]);
    return { deleted: Number(b.id) };
  }
  if (get && path === "year") return year(member(qs.member), qs.year);
  if (get && path === "inbox") return inboxList();
  if (get && path === "inbox/file") {
    // The file as it is, for the page to make a photo smaller before it is kept.
    const data = host.inbox.read({ folder: String(qs.folder || ""), name: String(qs.name || "") });
    return { $response: { status: 200, headers: { "content-type": "application/octet-stream", "cache-control": "no-store" }, body: data, encoding: "base64" } };
  }
  if (!get && path === "inbox/import") return importFile(b);
  if (!get && path === "inbox/reject") return { moved: host.inbox.reject({ folder: String(b.folder || ""), name: String(b.name || "") }, text(b.reason) || "turned down by the owner") };
  return { $response: { status: 404, body: "no such page" } };
}

// A member's year: documents by category, the latest of each value, how many were read.
function year(m, y) {
  y = /^\d{4}$/.test(y || "") ? y : String(new Date().getFullYear());
  const docs = q("SELECT category, count(*) AS n FROM documents WHERE member_id = ? AND substr(COALESCE(doc_date, created), 1, 4) = ? GROUP BY category", [m.id, y]);
  const latest = q(`SELECT r.* FROM records r JOIN (SELECT kind, title, max(observed_at) AS at FROM records WHERE member_id = ? AND substr(observed_at, 1, 4) = ? GROUP BY kind, title) l
      ON r.kind = l.kind AND r.title = l.title AND r.observed_at = l.at WHERE r.member_id = ? GROUP BY r.kind, r.title ORDER BY r.kind, r.title`, [m.id, y, m.id]).map(recordView);
  const years = q(`SELECT DISTINCT y FROM (SELECT substr(observed_at, 1, 4) AS y FROM records WHERE member_id = ? AND observed_at IS NOT NULL
      UNION SELECT substr(COALESCE(doc_date, created), 1, 4) FROM documents WHERE member_id = ?) ORDER BY y DESC`, [m.id, m.id]).map((r) => r.y);
  return { member: memberView(m), year: y, years, documents: docs, latest };
}

// --- the assistant's tools (only members the owner lets it read) -------------------------------------------

function visibleMember(arg) {
  const s = String(arg ?? "").trim();
  if (!s) throw fail("member: give a member's name or id (see health_members)");
  const m = /^\d+$/.test(s) ? one("SELECT * FROM members WHERE id = ?", [Number(s)]) : one("SELECT * FROM members WHERE lower(name) = lower(?)", [s]);
  if (!m || m.ai !== "read") throw fail(`no member "${s}" the assistant may read (see health_members)`);
  return m;
}

const brief = (r) => ({ kind: r.kind, title: r.title, date: r.observed_at, value: r.value, value_text: r.value_text, unit: r.unit,
  ref_low: r.ref_low, ref_high: r.ref_high, flag: r.flag, extras: r.extras ? JSON.parse(r.extras) : undefined, source: r.source, document_id: r.document_id });

export function callTool(name, args = {}) {
  if (name === "health_members") {
    const list = q("SELECT * FROM members WHERE ai = 'read' AND archived = 0 ORDER BY created").map((m) => ({ id: m.id, name: m.name, relation: m.relation, birth_year: m.birth_year,
      documents: one("SELECT count(*) AS n FROM documents WHERE member_id = ?", [m.id]).n }));
    return { members: list, note: list.length ? NOT_ADVICE : "No member is shared with the assistant (the owner chooses on the FamilyHealthRecords page)." };
  }
  const m = visibleMember(args.member);
  if (name === "health_records") {
    const where = ["member_id = ?"], p = [m.id];
    if (args.kind) { where.push("kind = ?"); p.push(String(args.kind)); }
    if (args.title) { where.push("lower(title) LIKE ?"); p.push(`%${String(args.title).toLowerCase()}%`); }
    if (day(args.from)) { where.push("observed_at >= ?"); p.push(day(args.from)); }
    if (day(args.to)) { where.push("observed_at <= ?"); p.push(day(args.to) + "~"); }
    const rows = q(`SELECT * FROM records WHERE ${where.join(" AND ")} ORDER BY observed_at DESC LIMIT 300`, p);
    return { member: m.name, records: rows.map(brief), note: `${rows.length === 300 ? "The 300 newest only - narrow with kind / title / from / to. " : ""}${NOT_ADVICE}` };
  }
  if (name === "health_latest") {
    const where = ["r.member_id = ?"], p = [m.id];
    if (args.kind) { where.push("r.kind = ?"); p.push(String(args.kind)); }
    if (args.title) { where.push("lower(r.title) LIKE ?"); p.push(`%${String(args.title).toLowerCase()}%`); }
    const rows = q(`SELECT r.* FROM records r WHERE ${where.join(" AND ")} AND r.observed_at = (SELECT max(observed_at) FROM records x
        WHERE x.member_id = r.member_id AND x.kind = r.kind AND x.title = r.title) ORDER BY r.kind, r.title LIMIT 200`, p);
    return { member: m.name, latest: rows.map(brief), note: NOT_ADVICE };
  }
  if (name === "health_document") {
    const d = one("SELECT * FROM documents WHERE id = ? AND member_id = ?", [Number(args.id), m.id]);
    if (!d) throw fail(`no document ${args.id} of ${m.name}`);
    const out = { member: m.name, ...docView(d), values: q("SELECT * FROM records WHERE document_id = ? ORDER BY id", [d.id]).map(brief), note: NOT_ADVICE };
    if (args.picture && d.media_type.startsWith("image/")) out.$attachments = [{ name: `${m.name}-${d.id}.${TYPES[d.media_type]}`, media_type: d.media_type, data: host.files.read(d.file) }];
    return out;
  }
  if (name === "health_documents") {
    const rows = q("SELECT * FROM documents WHERE member_id = ? ORDER BY COALESCE(doc_date, created) DESC LIMIT 100", [m.id]);
    return { member: m.name, documents: rows.map((d) => ({ id: d.id, name: d.original_name, category: d.category, date: d.doc_date, summary: d.summary, status: docView(d).status })) };
  }
  throw new Error(`no tool ${name}`);
}
