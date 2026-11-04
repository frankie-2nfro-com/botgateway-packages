// FamilyHealthRecords (DOCUMENTATIONS/app_familyhealthrecord_requirements.txt parts B and C): a family's health inputs per
// member, on the owner's computer, after Aera - five main areas with sub-categories; photos, files, mood, sleep and text
// records; the owner's bot turns each input into sub-categories, records, area remarks and the member's rolling memory
// (host.ai, one run at a time per member); the assistant may read the members the owner allows (tools). Not medical advice.

import { AREAS, CATEGORIES, CATEGORY_KEYS, KINDS, MOODS, SLEEP, CONDITIONS, areaOf } from "./catalog.js";
import { SCHEMA, buildTask, PROMPT_VERSION } from "./prompts.js";

const RELATIONS = ["self", "partner", "child", "parent", "other"];
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
const INPUTS = ["file", "text", "mood", "sleep", "height", "weight"];
// Below this the AI's reading is "needs check" (the owner confirms or corrects it).
const SURE = 0.6;
// A run with no answer after this long (the gateway restarted, the bot was away) is failed; the next input goes on.
const STALE_MS = 30 * 60 * 1000;
const MEMORY_MAX = 1200, MEMORY_VERSIONS = 10;
// For the assistant (tools): the remarks hold suggestions an AI wrote - not a doctor's.
const NOT_ADVICE = "ai_advice in the remarks is health advice written by an AI, not by a doctor: say so, and suggest checking with a doctor before acting on it.";

const now = () => new Date().toISOString();
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const q = (sql, p = []) => host.db.query(sql, p);
const one = (sql, p = []) => host.db.query(sql, p)[0] || null;
const run = (sql, p = []) => host.db.exec(sql, p);
const fail = (msg) => { const e = new Error(msg); e.plain = true; return e; };
const text = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 25) : null);
const json = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// --- data --------------------------------------------------------------------------------------------------

export function onInstall() {
  host.db.script(`
    CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, relation TEXT NOT NULL DEFAULT 'other',
      birth_year INTEGER, color TEXT NOT NULL DEFAULT '#0ea58f', ai TEXT NOT NULL DEFAULT 'read', archived INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
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
  `);
  const v = one("PRAGMA user_version")?.user_version || 0;
  if (v < 2) {
    // 0.2.0 (part C): main area + sub-categories per input, inputs without a file, the member's memory, area remarks.
    host.db.transaction(() => {
      const cols = (t) => q(`PRAGMA table_info(${t})`).map((c) => c.name);
      const add = (t, c, def) => { if (!cols(t).includes(c)) run(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
      add("members", "conditions", "TEXT");
      add("members", "memory", "TEXT");
      add("documents", "input", "TEXT NOT NULL DEFAULT 'file'");
      add("documents", "main_key", "TEXT");
      add("documents", "category_key", "TEXT");
      add("documents", "also_keys", "TEXT");
      add("documents", "note", "TEXT");
      add("documents", "remarks", "TEXT");
      add("documents", "warnings", "TEXT");
      add("documents", "prompt_version", "TEXT");
      add("records", "category_key", "TEXT");
      host.db.script(`
        CREATE TABLE IF NOT EXISTS memory_versions (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          text TEXT NOT NULL, document_id INTEGER, why TEXT NOT NULL, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS remarks (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE, main_key TEXT NOT NULL, day TEXT NOT NULL, text TEXT NOT NULL, created TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS remarks_member ON remarks (member_id, day);
        CREATE INDEX IF NOT EXISTS records_document ON records (document_id);
      `);
      // 0.1.0 names -> Aera's (no other change to what was kept).
      for (const [a, b] of [["lab", "lab_result"], ["blood_pressure", "vital_bp"], ["weight", "vital_weight"], ["height", "vital_height"],
        ["glucose", "vital_glucose"], ["pulse", "note"], ["temperature", "note"]]) run("UPDATE records SET kind = ? WHERE kind = ?", [b, a]);
      run("UPDATE documents SET category_key = category WHERE category_key IS NULL AND category IS NOT NULL");
      run("UPDATE documents SET category_key = 'other' WHERE category_key IS NOT NULL AND category_key NOT IN (" + CATEGORY_KEYS.map(() => "?").join(",") + ")", CATEGORY_KEYS);
      for (const c of CATEGORIES) run("UPDATE documents SET main_key = ? WHERE category_key = ? AND main_key IS NULL", [c.area, c.key]);
      run("UPDATE members SET conditions = '[]' WHERE conditions IS NULL");
      for (const [k, c] of [["vital_bp", "bloodPressure"], ["vital_weight", "weight"], ["vital_height", "height"], ["vital_glucose", "glucose"], ["lab_result", "bloodTest"],
        ["medication", "prescription"], ["visit", "doctorReport"], ["vaccination", "vaccination"], ["imaging", "imaging"], ["food", "food"], ["note", "other"]]) {
        run("UPDATE records SET category_key = ? WHERE kind = ? AND category_key IS NULL", [c, k]);
      }
      // A value entered by hand in 0.1.0 had no document: it gets one (a text input), so the areas and the timeline show it.
      for (const r of q("SELECT * FROM records WHERE document_id IS NULL")) {
        const id = insertDoc({ id: r.member_id }, { input: "text", name: r.title, date: String(r.observed_at || r.created).slice(0, 10), source: "manual_text",
          main_key: areaOf(r.category_key), category_key: r.category_key, summary: `${r.title} ${short(r)}`, note: { text: `${r.title} ${short(r)}` } });
        run("UPDATE documents SET status = 'ready' WHERE id = ?", [id]);
        run("UPDATE records SET document_id = ? WHERE id = ?", [id, r.id]);
      }
      run("PRAGMA user_version = 2");
    });
  }
  if ((one("PRAGMA user_version")?.user_version || 0) < 3) {
    // 0.2.2: the AI's advice kept beside each area remark.
    host.db.transaction(() => {
      if (!q("PRAGMA table_info(remarks)").some((c) => c.name === "advice")) run("ALTER TABLE remarks ADD COLUMN advice TEXT");
      run("PRAGMA user_version = 3");
    });
  }
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
  conditions: json(m.conditions, []), memory: m.memory || "",
  documents: one("SELECT count(*) AS n FROM documents WHERE member_id = ?", [m.id]).n,
  records: one("SELECT count(*) AS n FROM records WHERE member_id = ?", [m.id]).n });

function saveMember(b) {
  const name = text(b.name, 60);
  if (!name) throw fail("a member needs a name");
  const relation = RELATIONS.includes(b.relation) ? b.relation : "other";
  const year = Number(b.birth_year) || null;
  if (year && (year < 1900 || year > new Date().getFullYear())) throw fail("birth year: 1900 - this year");
  const color = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#0ea58f";
  const ai = b.ai === "off" ? "off" : "read";
  const same = one("SELECT id FROM members WHERE lower(name) = lower(?) AND id != ?", [name, Number(b.id) || 0]);
  if (same) throw fail(`there is already a member called ${name}`);
  if (b.id) {
    member(b.id);
    run("UPDATE members SET name = ?, relation = ?, birth_year = ?, color = ?, ai = ?, archived = ? WHERE id = ?",
      [name, relation, year, color, ai, b.archived ? 1 : 0, Number(b.id)]);
    return memberView(member(b.id));
  }
  const r = run("INSERT INTO members (name, relation, birth_year, color, ai, conditions, created) VALUES (?, ?, ?, ?, ?, '[]', ?)", [name, relation, year, color, ai, now()]);
  return memberView(member(r.last_id));
}

// Memory A: the chronic conditions only the owner sets ([{key?, zh, en?}]; a preset key takes the preset's names).
function saveConditions(id, list) {
  const m = member(id), out = [], seen = new Set();
  for (const c of Array.isArray(list) ? list : []) {
    const p = CONDITIONS.find((x) => x[0] === c?.key);
    const zh = p ? p[2] : text(c?.zh, 120), en = p ? p[1] : text(c?.en, 120) || null;
    if (!zh || seen.has(zh.toLowerCase())) continue;
    seen.add(zh.toLowerCase());
    out.push({ key: p ? p[0] : null, zh, en });
  }
  run("UPDATE members SET conditions = ? WHERE id = ?", [JSON.stringify(out.slice(0, 30)), m.id]);
  return memberView(member(m.id));
}

// Memory B: every change kept as a version (the newest MEMORY_VERSIONS), so a bad rewrite can be undone.
function setMemory(memberId, txt, documentId, why) {
  const t = text(txt, MEMORY_MAX);
  run("UPDATE members SET memory = ? WHERE id = ?", [t, memberId]);
  run("INSERT INTO memory_versions (member_id, text, document_id, why, created) VALUES (?, ?, ?, ?, ?)", [memberId, t, documentId, why, now()]);
  run(`DELETE FROM memory_versions WHERE member_id = ? AND id NOT IN (SELECT id FROM memory_versions WHERE member_id = ? ORDER BY id DESC LIMIT ${MEMORY_VERSIONS})`, [memberId, memberId]);
}

// A member deleted: its files too (the database rows go with ON DELETE CASCADE).
function deleteMember(id, confirm) {
  const m = member(id);
  if (text(confirm) !== m.name) throw fail(`type the member's name (${m.name}) to delete it with all its records`);
  for (const d of q("SELECT file FROM documents WHERE member_id = ? AND file != ''", [m.id])) host.files.remove(d.file);
  run("DELETE FROM members WHERE id = ?", [m.id]);
  return { deleted: m.name };
}

const stale = (d) => d.status === "reading" && Date.now() - Date.parse(d.run_at || d.updated) > STALE_MS;
const docView = (d) => d && ({ id: d.id, member_id: d.member_id, input: d.input, name: d.original_name, media_type: d.media_type, size: d.size,
  main_key: d.main_key, category_key: d.category_key, also_keys: json(d.also_keys, []), date: d.doc_date, clinic: d.clinic, doctor: d.doctor,
  summary: d.summary, note: json(d.note), confidence: d.confidence, warnings: json(d.warnings, []), remarks: d.remarks,
  status: d.status, reason: d.reason, source: d.source, created: d.created });

const recordView = (r) => ({ id: r.id, member_id: r.member_id, document_id: r.document_id, kind: r.kind, category_key: r.category_key, title: r.title,
  observed_at: r.observed_at, value: r.value, value_text: r.value_text, unit: r.unit, ref_low: r.ref_low, ref_high: r.ref_high, flag: r.flag,
  extras: json(r.extras), source: r.source, confidence: r.confidence });

const getDoc = (id) => {
  const d = one("SELECT * FROM documents WHERE id = ?", [Number(id)]);
  if (!d) throw fail("no such input");
  return d;
};

// --- inputs: kept, then read by the owner's bot, one at a time per member ------------------------------------

function fingerprint(data) {
  return host.crypto.hmac("familyhealthrecords", data, { data_encoding: "base64" }).hex;
}

function insertDoc(m, f) {
  const t = now();
  const r = run(`INSERT INTO documents (member_id, input, file, original_name, media_type, size, fingerprint, main_key, category_key, doc_date, note, summary,
      status, source, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    [m.id, f.input, f.file || "", f.name, f.media_type || "", f.size || 0, f.fingerprint || "", f.main_key || null, f.category_key || null, f.date,
     f.note ? JSON.stringify(f.note) : null, f.summary || null, f.source, t, t]);
  return r.last_id;
}

// {member_id, name, media_type, data (base64), source, force, date?} -> the input (queued). A file already kept for the
// member (same bytes) is refused unless `force`.
function addFile(b) {
  const m = member(b.member_id);
  const type = String(b.media_type || "").toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw fail(`${text(b.name, 80)}: PDF, JPEG, PNG, WebP or GIF only (a HEIC photo: the page converts it, or save it as JPEG)`);
  const data = String(b.data || "").replace(/^data:[^,]*,/, "");
  if (!data) throw fail("the file is empty");
  const fp = fingerprint(data);
  const dup = one("SELECT original_name, created FROM documents WHERE member_id = ? AND fingerprint = ?", [m.id, fp]);
  if (dup && !b.force) throw fail(`DUPLICATE: ${m.name} already has this file (${dup.original_name}, added ${dup.created.slice(0, 10)})`);
  // The owner's date (e.g. an old document added now) wins over the one the assistant reads; none = the assistant's.
  const owner = ownerDay(b.date);
  const id = insertDoc(m, { input: "file", name: text(b.name, 200) || `document.${ext}`, media_type: type, fingerprint: fp, date: owner || today(),
    note: owner ? { dated: true } : null, source: b.source === "inbox" ? "inbox" : "page" });
  const file = `doc-${id}.${ext}`;
  try {
    const info = host.files.write(file, data, "base64");
    run("UPDATE documents SET file = ?, size = ? WHERE id = ?", [file, info.size, id]);
  } catch (e) {
    run("DELETE FROM documents WHERE id = ?", [id]);
    throw e;
  }
  pump(m.id);
  return docView(getDoc(id));
}

const label = (list, key) => list.find((x) => x[0] === key);
// A day the owner gave: YYYY-MM-DD, not in the future.
function ownerDay(v) {
  const d = day(v)?.slice(0, 10);
  if (!d) return null;
  if (d > today()) throw fail("the date can't be in the future");
  return d;
}

// {member_id, input: text|mood|sleep|height|weight, date, text | from,to | quality | value, note} -> the input (queued).
// Mood, sleep, height and weight are recorded at once by the program (the page needs no bot for them, e.g. BMI);
// the bot adds the summary, the area remarks and the memory.
function addEntry(b) {
  const m = member(b.member_id);
  const kind = INPUTS.includes(b.input) && b.input !== "file" ? b.input : null;
  if (!kind) throw fail("unknown input");
  const date = ownerDay(b.date) || today();
  const note = text(b.note, 2000) || null;
  let f, rec = null;
  if (kind === "text") {
    const t = text(b.text, 4000);
    if (!t) throw fail("write something first");
    f = { name: t.slice(0, 60), note: { text: t, dated: true } };
  } else if (kind === "mood") {
    const from = label(MOODS, b.from), to = label(MOODS, b.to);
    if (!to) throw fail("choose a mood");
    f = { name: `${from ? from[2] + " → " : ""}${to[2]}`, note: { from: from?.[0] || null, to: to[0], note, dated: true }, main_key: "mental", category_key: "mood" };
    rec = { kind: "mood", title: "心情", value_text: f.name, extras: { from: from?.[2] || null, to: to[2], note } };
  } else if (kind === "sleep") {
    const s = label(SLEEP, b.quality);
    if (!s) throw fail("choose the sleep quality");
    f = { name: s[2], note: { quality: s[0], note, dated: true }, main_key: "mental", category_key: "sleep" };
    rec = { kind: "sleep", title: "睡眠質素", value_text: s[2], extras: { quality: s[2], note } };
  } else {
    const v = Number(b.value);
    const ok = kind === "height" ? v >= 40 && v <= 260 : v >= 2 && v <= 400;
    if (!ok) throw fail(kind === "height" ? "height: 40 - 260 cm" : "weight: 2 - 400 kg");
    const unit = kind === "height" ? "cm" : "kg", title = kind === "height" ? "身高" : "體重";
    f = { name: `${title} ${Math.round(v * 10) / 10} ${unit}`, note: { value: v, unit, dated: true }, main_key: "body", category_key: kind };
    rec = { kind: `vital_${kind}`, title, value: v, unit };
  }
  const id = insertDoc(m, { ...f, input: kind, date, source: `manual_${kind}`, summary: kind === "text" ? null : f.name });
  if (rec) addRecord(m.id, id, { ...rec, category_key: f.category_key, observed_at: date }, "input");
  pump(m.id);
  return docView(getDoc(id));
}

function addRecord(memberId, documentId, e, source, confidence = null) {
  run(`INSERT INTO records (member_id, document_id, kind, category_key, title, observed_at, value, value_text, unit, ref_low, ref_high, flag, extras, source, confidence, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memberId, documentId, e.kind, e.category_key || null, text(e.title, 200) || e.kind, e.observed_at, num(e.value), text(e.value_text, 500) || null,
     text(e.unit, 40) || null, num(e.ref_low), num(e.ref_high), e.flag || null, e.extras ? JSON.stringify(e.extras).slice(0, 4000) : null, source,
     num(e.confidence) ?? confidence, now()]);
}

// One run at a time per member (C8): the memory is rewritten by each run, so two runs must never overlap. Called after
// every change; a run with no answer for STALE_MS is failed and the next input goes on.
function pump(memberId) {
  const busy = one("SELECT * FROM documents WHERE member_id = ? AND status = 'reading' ORDER BY id LIMIT 1", [memberId]);
  if (busy && !stale(busy)) return;
  if (busy) run("UPDATE documents SET status = 'failed', reason = ?, updated = ? WHERE id = ?",
    ["no answer from the assistant (the gateway restarted or the bot was away) - read it again", now(), busy.id]);
  const next = one("SELECT id FROM documents WHERE member_id = ? AND status = 'queued' ORDER BY id LIMIT 1", [memberId]);
  if (!next) return;
  try { read(next.id); } catch (e) {
    run("UPDATE documents SET status = 'failed', reason = ?, updated = ? WHERE id = ?", [text(e.message), now(), next.id]);
    pump(memberId);
  }
}
const pumpAll = () => { for (const m of q("SELECT DISTINCT member_id FROM documents WHERE status IN ('queued', 'reading')")) pump(m.member_id); };

// The member's health context for the prompt (C4): conditions, memory, the newest records of each kind (each lab title).
function context(m, exceptDoc) {
  const rows = q(`SELECT * FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY kind, CASE WHEN kind = 'lab_result' THEN title ELSE '' END ORDER BY observed_at DESC, id DESC) AS n
      FROM records r WHERE member_id = ? AND (document_id IS NULL OR document_id != ?) AND kind != 'vital_bmi') WHERE n <= CASE WHEN kind = 'lab_result' THEN 1 ELSE 3 END
      ORDER BY observed_at DESC LIMIT 60`, [m.id, exceptDoc]);
  return {
    chronic_conditions: json(m.conditions, []).map((c) => (c.en ? `${c.zh} / ${c.en}` : c.zh)),
    memory: m.memory || "(empty - no prior rolling summary)",
    prior_records: rows.map((r) => `${String(r.observed_at || "").slice(0, 10)} ${r.kind} ${r.title}: ${short(r)}`),
  };
}

function short(r) {
  const x = json(r.extras, {}) || {};
  if (r.kind === "vital_bp") return `${x.systolic ?? r.value ?? "?"}/${x.diastolic ?? "?"} mmHg${x.pulse ? ` pulse ${x.pulse}` : ""}`;
  if (r.kind === "food") return (x.items || []).slice(0, 6).join(", ") || r.title;
  if (r.kind === "exercise") return [x.activity, x.duration_min ? `${x.duration_min} min` : ""].filter(Boolean).join(", ") || r.title;
  if (r.kind === "medication") return [x.drug || r.title, x.dose].filter(Boolean).join(" ");
  if (r.value !== null && r.value !== undefined) return `${r.value}${r.unit ? " " + r.unit : ""}${r.flag && r.flag !== "normal" ? ` (${r.flag})` : ""}`;
  return text(r.value_text || x.text || "", 100) || "(value unclear)";
}

// Starts the bot's reading of an input.
function read(id) {
  const d = getDoc(id);
  const m = member(d.member_id);
  const note = json(d.note, {}) || {};
  const input = { kind: d.input, name: d.original_name, media_type: d.media_type, day: d.doc_date || today(), owner_day: note.dated ? d.doc_date : null,
    remarks: d.remarks, category_hint: note.category_hint || null };
  const data = { member: { name: m.name, birth_year: m.birth_year, relation: m.relation }, health_context: context(m, d.id),
    input: { kind: d.input, date: input.day, remarks: d.remarks || undefined,
      text: d.input === "text" ? note.text : d.input === "height" || d.input === "weight" ? d.original_name : undefined,
      mood: d.input === "mood" ? { from: label(MOODS, note.from)?.[2] || null, to: label(MOODS, note.to)?.[2], note: note.note } : undefined,
      sleep: d.input === "sleep" ? { quality: label(SLEEP, note.quality)?.[2], note: note.note } : undefined } };
  const { run: r } = host.ai.run({ task: buildTask(input, m), schema: SCHEMA, data, files: d.file ? [d.file] : [], tag: { document: d.id } });
  run("UPDATE documents SET status = 'reading', reason = NULL, run = ?, run_at = ?, prompt_version = ?, updated = ? WHERE id = ?", [r, now(), PROMPT_VERSION, now(), d.id]);
}

const structured = (d) => ["mood", "sleep", "height", "weight"].includes(d.input);

export function onAiResult(r) {
  const id = r.tag?.document;
  const d = id && one("SELECT * FROM documents WHERE id = ?", [id]);
  // Deleted meanwhile, or read again since: this answer is not used.
  if (!d || d.run !== r.run) return;
  try {
    if (r.state !== "done") {
      run("UPDATE documents SET status = 'failed', reason = ?, updated = ? WHERE id = ?", [text(r.error || "the assistant could not read it"), now(), d.id]);
      return;
    }
    try { host.db.transaction(() => save(d, r.answer)); } catch (e) {
      run("UPDATE documents SET status = 'failed', reason = ?, updated = ? WHERE id = ?", [text(`the answer could not be kept: ${e.message}`), now(), d.id]);
    }
  } finally {
    pump(d.member_id);
  }
}

function save(d, a) {
  run("DELETE FROM records WHERE document_id = ? AND source = 'ai'", [d.id]);
  run("DELETE FROM remarks WHERE document_id = ?", [d.id]);
  const fixed = structured(d);
  const dated = fixed || !!(json(d.note, {}) || {}).dated;
  // Mood / sleep / height / weight keep the sub-category the program gave them.
  const cat = fixed ? d.category_key : CATEGORY_KEYS.includes(a.category_key) ? a.category_key : "other";
  const main = areaOf(cat);
  const also = fixed ? [] : [...new Set((a.also_category_keys || []).filter((k) => CATEGORY_KEYS.includes(k) && k !== cat))];
  // A day the owner gave (own entries, a dated file) is kept; else the day the assistant read.
  const date = (dated && d.doc_date) || day(a.recorded_at)?.slice(0, 10) || d.doc_date || today();
  const warnings = (a.warnings || []).map((w) => text(w, 200));
  if (!a.is_health_input) {
    run("UPDATE documents SET status = 'needs_check', reason = ?, main_key = ?, category_key = ?, also_keys = '[]', summary = COALESCE(?, summary), confidence = ?, warnings = ?, updated = ? WHERE id = ?",
      [text(a.problem || "not health related, or it could not be read"), main, cat, text(a.summary, 300) || null, num(a.confidence), JSON.stringify(warnings), now(), d.id]);
    return;
  }
  const m = member(d.member_id);
  const known = json(m.conditions, []);
  if (!fixed) {
    for (const e of a.entities) {
      if (e.kind === "vital_bmi") continue;
      const ck = CATEGORY_KEYS.includes(e.category_key) ? e.category_key : cat;
      addRecord(d.member_id, d.id, { ...e, category_key: ck, observed_at: day(e.observed_at) || date }, "ai", num(a.confidence));
    }
  }
  // A newly named chronic condition: a note under 病患／長期病 for the owner to confirm - never written into the conditions.
  for (const c of a.illness_candidates || []) {
    const zh = text(c.label_zh, 120);
    if (!zh || known.some((k) => k.zh === zh || (c.condition_key && k.key === c.condition_key))) continue;
    // Already waiting for the owner (found in another input): not twice.
    if (one(`SELECT id FROM records WHERE member_id = ? AND category_key = 'illnessCondition' AND document_id != ? AND extras LIKE '%"condition_candidate":true%'
        AND (json_extract(extras, '$.zh') = ? OR (? IS NOT NULL AND json_extract(extras, '$.key') = ?))`, [d.member_id, d.id, zh, c.condition_key || null, c.condition_key || null])) continue;
    addRecord(d.member_id, d.id, { kind: "note", category_key: "illnessCondition", title: c.label_en ? `${zh} / ${text(c.label_en, 120)}` : zh, observed_at: date,
      value_text: text(c.evidence, 300) || null, extras: { condition_candidate: true, key: c.condition_key || null, zh, en: text(c.label_en, 120) || null } }, "ai");
  }
  // Area remarks only for the areas this input touched.
  const touched = new Set([main, ...also.map(areaOf), ...q("SELECT DISTINCT category_key FROM records WHERE document_id = ?", [d.id]).map((x) => areaOf(x.category_key))]);
  const advice = a.advice || {};
  for (const k of new Set([...Object.keys(a.domain_remarks || {}), ...Object.keys(advice)])) {
    const v = text(a.domain_remarks?.[k], 600), tip = text(advice[k], 400) || null;
    if (touched.has(k) && (v || tip)) run("INSERT INTO remarks (member_id, document_id, main_key, day, text, advice, created) VALUES (?, ?, ?, ?, ?, ?, ?)", [d.member_id, d.id, k, date, v, tip, now()]);
  }
  if (text(a.situation_update)) setMemory(d.member_id, a.situation_update, d.id, "input");
  const sure = fixed || (a.confidence >= SURE && cat !== "other");
  run(`UPDATE documents SET status = ?, reason = ?, main_key = ?, category_key = ?, also_keys = ?, doc_date = ?, clinic = ?, doctor = ?, summary = ?, confidence = ?,
      warnings = ?, updated = ? WHERE id = ?`,
    [sure ? "ready" : "needs_check", sure ? null : cat === "other" ? "the category is unclear - please check it" : "the assistant is not sure it read it right - please check",
     main, cat, JSON.stringify(also), date, text(a.clinic, 200) || null, text(a.doctor, 200) || null, text(a.summary, 300) || d.summary, num(a.confidence),
     JSON.stringify(warnings), now(), d.id]);
}

function deleteDoc(id) {
  const d = getDoc(id);
  if (d.file) host.files.remove(d.file);
  run("DELETE FROM documents WHERE id = ?", [d.id]);
  pump(d.member_id);
  return { deleted: d.id };
}

// "Read again": with the owner's remarks, another member or a primary sub-category the owner chose.
function readAgain(b) {
  const d = getDoc(b.id);
  if (d.status === "reading" && !stale(d)) throw fail("it is being read now - wait for the answer");
  const to = Number(b.member_id) || d.member_id;
  if (to !== d.member_id) {
    member(to);
    for (const t of ["documents", "records", "remarks"]) run(`UPDATE ${t} SET member_id = ? WHERE ${t === "documents" ? "id" : "document_id"} = ?`, [to, d.id]);
  }
  const note = json(d.note, {}) || {};
  note.category_hint = CATEGORY_KEYS.includes(b.category) && !structured(d) ? b.category : null;
  // A date changed here becomes the owner's date (the program's own records move with it).
  const owner = ownerDay(b.date);
  if (owner && owner !== d.doc_date) {
    note.dated = true;
    run("UPDATE documents SET doc_date = ? WHERE id = ?", [owner, d.id]);
    run("UPDATE records SET observed_at = ? WHERE document_id = ? AND source = 'input'", [owner, d.id]);
  }
  run("UPDATE documents SET status = 'queued', reason = NULL, run = NULL, remarks = ?, note = ?, updated = ? WHERE id = ?", [text(b.remarks, 2000) || null, JSON.stringify(note), now(), d.id]);
  pump(to);
  return docView(getDoc(d.id));
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
    doc = addFile({ member_id: b.member_id, name: f.name, media_type: b.media_type, data, source: "inbox", force: b.force });
  } catch (e) {
    // A duplicate stays in the inbox until the owner decides; anything else unusable is set aside with the reason.
    if (!e.message.startsWith("DUPLICATE") && e.plain) host.inbox.reject(f, e.message);
    throw e;
  }
  host.inbox.done(f);
  return doc;
}

// --- views ----------------------------------------------------------------------------------------------------

// A member's inputs touching an area (its primary, an also-key or a record filed there), newest first, with the
// records filed in that area and the area's sub-categories it shows under.
function area(m, key, category) {
  const cats = CATEGORIES.filter((c) => c.area === key).map((c) => c.key);
  if (!cats.length) throw fail("no such area");
  const ph = cats.map(() => "?").join(",");
  const docs = q(`SELECT * FROM documents d WHERE member_id = ? AND (main_key = ?
      OR EXISTS (SELECT 1 FROM records r WHERE r.document_id = d.id AND r.category_key IN (${ph}))
      OR EXISTS (SELECT 1 FROM json_each(COALESCE(d.also_keys, '[]')) j WHERE j.value IN (${ph})))
      ORDER BY COALESCE(doc_date, substr(created, 1, 10)) DESC, id DESC LIMIT 500`, [m.id, key, ...cats, ...cats]);
  const all = docs.map((d) => {
    const recs = q(`SELECT * FROM records WHERE document_id = ? AND category_key IN (${ph}) ORDER BY id`, [d.id, ...cats]).map(recordView);
    const subs = [...new Set([d.main_key === key ? d.category_key : null, ...recs.map((r) => r.category_key), ...json(d.also_keys, [])].filter((k) => k && cats.includes(k)))];
    return { ...docView(d), records: recs, subs };
  });
  const counts = {};
  for (const x of all) for (const s of x.subs) counts[s] = (counts[s] || 0) + 1;
  const remark = one("SELECT * FROM remarks WHERE member_id = ? AND main_key = ? ORDER BY day DESC, id DESC LIMIT 1", [m.id, key]);
  return { area: key, counts, items: category ? all.filter((x) => x.subs.includes(category)) : all,
    remark: remark && { day: remark.day, text: remark.text, advice: remark.advice, document_id: remark.document_id } };
}

// The days with inputs (newest first) and, for one day, its area remarks and inputs.
function timeline(m, d) {
  const days = q("SELECT doc_date AS day, count(*) AS n FROM documents WHERE member_id = ? AND doc_date IS NOT NULL GROUP BY doc_date ORDER BY doc_date DESC LIMIT 1000", [m.id]);
  const pick = day(d)?.slice(0, 10) || days[0]?.day || null;
  return {
    days, day: pick,
    remarks: pick ? q("SELECT id, main_key, text, advice, document_id FROM remarks WHERE member_id = ? AND day = ? ORDER BY id", [m.id, pick]) : [],
    items: pick ? q("SELECT * FROM documents WHERE member_id = ? AND doc_date = ? ORDER BY id", [m.id, pick]).map(docView) : [],
  };
}

// BMI (C5): the page computes it from the latest height and weight; the weights for its history.
function bmi(m) {
  const latest = (k) => one("SELECT * FROM records WHERE member_id = ? AND kind = ? AND value IS NOT NULL ORDER BY observed_at DESC, id DESC LIMIT 1", [m.id, k]);
  const h = latest("vital_height"), w = latest("vital_weight");
  return { height: h && recordView(h), weight: w && recordView(w),
    weights: q("SELECT * FROM records WHERE member_id = ? AND kind = 'vital_weight' AND value IS NOT NULL ORDER BY observed_at DESC, id DESC LIMIT 30", [m.id]).map(recordView) };
}

// A member's year: inputs by area, the latest of each measured value.
function year(m, y) {
  y = /^\d{4}$/.test(y || "") ? y : String(new Date().getFullYear());
  const areas = q("SELECT main_key, count(*) AS n FROM documents WHERE member_id = ? AND substr(COALESCE(doc_date, created), 1, 4) = ? GROUP BY main_key", [m.id, y]);
  // A measurement (vital_*) is one line whatever its title; a lab test, a drug ... one line per title.
  const latest = q(`SELECT * FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY kind, CASE WHEN kind LIKE 'vital_%' THEN '' ELSE lower(title) END ORDER BY observed_at DESC, id DESC) AS n
      FROM records r WHERE member_id = ? AND substr(observed_at, 1, 4) = ? AND kind NOT IN ('note', 'food', 'mood', 'sleep', 'visit')) WHERE n = 1 ORDER BY kind, title`, [m.id, y]).map(recordView);
  const years = q("SELECT DISTINCT substr(COALESCE(doc_date, created), 1, 4) AS y FROM documents WHERE member_id = ? ORDER BY y DESC", [m.id]).map((r) => r.y);
  return { year: y, years, areas, latest };
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
    pumpAll();
    return { members: q("SELECT * FROM members ORDER BY archived, created").map(memberView), areas: AREAS, categories: CATEGORIES, relations: RELATIONS,
      moods: MOODS, sleep: SLEEP, conditions: CONDITIONS, inbox: inboxList(),
      busy: q("SELECT member_id, count(*) AS n FROM documents WHERE status IN ('queued', 'reading') GROUP BY member_id") };
  }
  if (!get && path === "members") return saveMember(b);
  if (!get && path === "members/delete") return deleteMember(b.id, b.confirm);
  if (!get && path === "members/conditions") return saveConditions(b.id, b.conditions);
  if (get && path === "memory") {
    const m = member(qs.member);
    return { memory: m.memory || "", versions: q("SELECT id, text, document_id, why, created FROM memory_versions WHERE member_id = ? ORDER BY id DESC", [m.id]),
      candidates: q(`SELECT * FROM records WHERE member_id = ? AND category_key = 'illnessCondition' AND extras LIKE '%"condition_candidate":true%' ORDER BY observed_at DESC`, [m.id]).map(recordView) };
  }
  if (!get && path === "memory/restore") {
    const v = one("SELECT * FROM memory_versions WHERE id = ? AND member_id = ?", [Number(b.version), Number(b.member)]);
    if (!v) throw fail("no such version");
    setMemory(v.member_id, v.text, null, "restored");
    return { memory: v.text };
  }
  if (!get && path === "candidates/confirm") {
    // The owner confirms a condition the assistant found: it joins the chronic conditions; the note stays as the evidence.
    const r = one("SELECT * FROM records WHERE id = ?", [Number(b.id)]);
    if (!r) throw fail("no such record");
    const x = json(r.extras, {}) || {};
    const m = member(r.member_id);
    saveConditions(m.id, [...json(m.conditions, []), { key: x.key, zh: x.zh || r.title, en: x.en }]);
    // The same condition found in other inputs is settled too.
    for (const o of q(`SELECT id, extras FROM records WHERE member_id = ? AND category_key = 'illnessCondition' AND extras LIKE '%"condition_candidate":true%'`, [m.id])) {
      const y = json(o.extras, {}) || {};
      if (o.id === r.id || y.zh === x.zh || (x.key && y.key === x.key)) run("UPDATE records SET extras = ? WHERE id = ?", [JSON.stringify({ ...y, condition_candidate: false, confirmed: true }), o.id]);
    }
    return memberView(member(m.id));
  }
  if (get && path === "area") return area(member(qs.member), String(qs.area || ""), qs.category ? String(qs.category) : null);
  if (get && path === "timeline") return timeline(member(qs.member), qs.day);
  if (get && path === "bmi") return bmi(member(qs.member));
  if (get && path === "year") return year(member(qs.member), qs.year);
  if (get && path === "document") {
    const d = getDoc(qs.id);
    return { ...docView(d), items: q("SELECT * FROM records WHERE document_id = ? ORDER BY id", [d.id]).map(recordView),
      area_remarks: q("SELECT main_key, day, text, advice FROM remarks WHERE document_id = ? ORDER BY id", [d.id]) };
  }
  if (get && path === "file") {
    const d = one("SELECT file FROM documents WHERE id = ?", [Number(qs.id)]);
    if (!d || !d.file) return { $response: { status: 404, body: "no file" } };
    return { $response: { file: d.file, download: qs.download === "1" } };
  }
  if (!get && path === "upload") return addFile({ ...b, source: "page" });
  if (!get && path === "entry") return addEntry(b);
  if (!get && path === "documents/read") return readAgain(b);
  if (!get && path === "documents/confirm") {
    // The owner checked it: the sub-category and the date as the owner says, the records kept.
    const d = getDoc(b.id);
    const cat = CATEGORY_KEYS.includes(b.category) ? b.category : d.category_key;
    run("UPDATE documents SET status = 'ready', reason = NULL, category_key = ?, main_key = ?, doc_date = COALESCE(?, doc_date), updated = ? WHERE id = ?",
      [cat, areaOf(cat), day(b.date)?.slice(0, 10) || null, now(), d.id]);
    return docView(getDoc(d.id));
  }
  if (!get && path === "documents/delete") return deleteDoc(b.id);
  if (!get && path === "records/delete") {
    run("DELETE FROM records WHERE id = ?", [Number(b.id)]);
    return { deleted: Number(b.id) };
  }
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

// --- the assistant's tools (only members the owner lets it read) -------------------------------------------

function visibleMember(arg) {
  const s = String(arg ?? "").trim();
  if (!s) throw fail("member: give a member's name or id (see health_members)");
  const m = /^\d+$/.test(s) ? one("SELECT * FROM members WHERE id = ?", [Number(s)]) : one("SELECT * FROM members WHERE lower(name) = lower(?)", [s]);
  if (!m || m.ai !== "read") throw fail(`no member "${s}" the assistant may read (see health_members)`);
  return m;
}

const brief = (r) => ({ kind: r.kind, category: r.category_key, title: r.title, date: r.observed_at, value: r.value, value_text: r.value_text, unit: r.unit,
  ref_low: r.ref_low, ref_high: r.ref_high, flag: r.flag, extras: json(r.extras) || undefined, source: r.source, document_id: r.document_id });

export function callTool(name, args = {}) {
  if (name === "health_members") {
    const list = q("SELECT * FROM members WHERE ai = 'read' AND archived = 0 ORDER BY created").map((m) => ({ id: m.id, name: m.name, relation: m.relation, birth_year: m.birth_year,
      inputs: one("SELECT count(*) AS n FROM documents WHERE member_id = ?", [m.id]).n }));
    return { members: list, note: list.length ? NOT_ADVICE : "No member is shared with the assistant (the owner chooses on the FamilyHealthRecords page)." };
  }
  const m = visibleMember(args.member);
  if (name === "health_summary") {
    const remarks = q("SELECT main_key AS area, day, text, advice AS ai_advice FROM remarks WHERE member_id = ? ORDER BY day DESC, id DESC LIMIT 30", [m.id]);
    return { member: m.name, chronic_conditions: json(m.conditions, []), memory: m.memory || "", recent_remarks: remarks, note: NOT_ADVICE };
  }
  if (name === "health_records") {
    const where = ["member_id = ?"], p = [m.id];
    if (args.kind) { where.push("kind = ?"); p.push(String(args.kind)); }
    if (args.area) {
      const cats = CATEGORIES.filter((c) => c.area === args.area).map((c) => c.key);
      if (!cats.length) throw fail(`area: one of ${AREAS.map((a) => a.key).join(", ")}`);
      where.push(`category_key IN (${cats.map(() => "?").join(",")})`); p.push(...cats);
    }
    if (args.title) { where.push("lower(title) LIKE ?"); p.push(`%${String(args.title).toLowerCase()}%`); }
    if (day(args.from)) { where.push("observed_at >= ?"); p.push(day(args.from)); }
    if (day(args.to)) { where.push("observed_at <= ?"); p.push(day(args.to) + "~"); }
    const rows = q(`SELECT * FROM records WHERE ${where.join(" AND ")} ORDER BY observed_at DESC LIMIT 300`, p);
    return { member: m.name, records: rows.map(brief), note: `${rows.length === 300 ? "The 300 newest only - narrow with kind / area / title / from / to. " : ""}${NOT_ADVICE}` };
  }
  if (name === "health_latest") {
    const where = ["member_id = ?"], p = [m.id];
    if (args.kind) { where.push("kind = ?"); p.push(String(args.kind)); }
    if (args.title) { where.push("lower(title) LIKE ?"); p.push(`%${String(args.title).toLowerCase()}%`); }
    const rows = q(`SELECT * FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY kind, title ORDER BY observed_at DESC, id DESC) AS n FROM records r WHERE ${where.join(" AND ")})
        WHERE n = 1 ORDER BY kind, title LIMIT 200`, p);
    return { member: m.name, latest: rows.map(brief), note: NOT_ADVICE };
  }
  if (name === "health_document") {
    const d = one("SELECT * FROM documents WHERE id = ? AND member_id = ?", [Number(args.id), m.id]);
    if (!d) throw fail(`no input ${args.id} of ${m.name}`);
    const out = { member: m.name, ...docView(d), values: q("SELECT * FROM records WHERE document_id = ? ORDER BY id", [d.id]).map(brief),
      area_remarks: q("SELECT main_key AS area, day, text, advice AS ai_advice FROM remarks WHERE document_id = ?", [d.id]), note: NOT_ADVICE };
    if (args.picture && d.file && d.media_type.startsWith("image/")) out.$attachments = [{ name: `${m.name}-${d.id}.${TYPES[d.media_type]}`, media_type: d.media_type, data: host.files.read(d.file) }];
    return out;
  }
  if (name === "health_documents") {
    const rows = q("SELECT * FROM documents WHERE member_id = ? ORDER BY COALESCE(doc_date, created) DESC LIMIT 100", [m.id]);
    return { member: m.name, inputs: rows.map((d) => ({ id: d.id, input: d.input, name: d.original_name, area: d.main_key, category: d.category_key, date: d.doc_date,
      summary: d.summary, status: d.status })) };
  }
  throw new Error(`no tool ${name}`);
}
