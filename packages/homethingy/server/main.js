// Home Thingy (DOCUMENTATIONS/app_homethingy_requirements.txt): what a household owns, where it is (places within
// places), its receipts, warranty cards and manuals - on the owner's computer only. Photos and files are read by the
// owner's bot (host.ai, one item at a time) into the item's fields, never over what the owner typed; search and
// filters on the page; "Ask" answers a question from the list; read-only tools for the assistant, without the items
// and places the owner hides from it.

import { CATEGORIES, CATEGORY_KEYS, KINDS, KIND_KEYS, STATUSES, STATUS_KEYS, ROOMS } from "./catalog.js";
import { SCHEMA, ASK_SCHEMA, PROMPT_VERSION, readTask, askTask } from "./prompts.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
// Below this the reading is "please check".
const SURE = 0.6;
// A run with no answer after this long (the gateway restarted, the bot was away) is failed; the next item goes on.
const STALE_MS = 30 * 60 * 1000;
const ASK_STALE_MS = 10 * 60 * 1000;
// Files sent with one reading (receipts and warranty cards first), and added in one upload.
const READ_FILES = 8, UPLOAD_FILES = 12;
// "Ends soon": the warranty ends within this many days.
const SOON_DAYS = 60;
// What the owner and the bot may fill; the owner's own (typed or changed) are never overwritten by a reading.
const FIELDS = ["name", "category", "brand", "model", "serial", "quantity", "purchase_date", "price", "currency", "shop", "order_no",
  "warranty_months", "warranty_until", "place_id", "spot", "tags", "notes"];
const ASSISTANT = "Home Thingy is the owner's private household inventory. Items and places the owner hid from you are left out.";

const now = () => new Date().toISOString();
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const q = (sql, p = []) => host.db.query(sql, p);
const one = (sql, p = []) => host.db.query(sql, p)[0] || null;
const run = (sql, p = []) => host.db.exec(sql, p);
const fail = (msg) => { const e = new Error(msg); e.plain = true; return e; };
const text = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const json = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const dayOf = (v) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : null; };
const plain = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
const meta = (k, d = null) => one("SELECT value FROM meta WHERE key = ?", [k])?.value ?? d;
const setMeta = (k, v) => run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, String(v)]);
// The page's language (it says on every load): the bot writes its notes in it.
const lang = () => (meta("lang") === "en" ? "en" : "zh");

// --- data --------------------------------------------------------------------------------------------------

export function onInstall() {
  host.db.script(`
    CREATE TABLE IF NOT EXISTS places (id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
      icon TEXT, hidden INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', category TEXT,
      place_id INTEGER REFERENCES places(id) ON DELETE SET NULL, spot TEXT, brand TEXT, model TEXT, serial TEXT, quantity INTEGER NOT NULL DEFAULT 1,
      purchase_date TEXT, price REAL, currency TEXT, shop TEXT, order_no TEXT, warranty_months INTEGER, warranty_until TEXT,
      status TEXT NOT NULL DEFAULT 'have', lent_to TEXT, notes TEXT, tags TEXT NOT NULL DEFAULT '[]', hidden INTEGER NOT NULL DEFAULT 0,
      cover_id INTEGER, owner_fields TEXT NOT NULL DEFAULT '[]', summary TEXT, tips TEXT, others TEXT, warnings TEXT, confidence REAL,
      ai_state TEXT NOT NULL DEFAULT 'none', ai_reason TEXT, ai_hint TEXT, ai_run TEXT, ai_run_at TEXT, prompt_version TEXT,
      created TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS items_place ON items (place_id);
    CREATE INDEX IF NOT EXISTS items_state ON items (ai_state);
    CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, file TEXT NOT NULL, thumb TEXT, name TEXT NOT NULL, media_type TEXT NOT NULL,
      size INTEGER NOT NULL, fingerprint TEXT NOT NULL, created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS files_fingerprint ON files (fingerprint);
    CREATE TABLE IF NOT EXISTS item_files (item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'photo', kind_owner INTEGER NOT NULL DEFAULT 0,
      added TEXT NOT NULL, PRIMARY KEY (item_id, file_id));
    CREATE INDEX IF NOT EXISTS item_files_file ON item_files (file_id);
    CREATE TABLE IF NOT EXISTS asks (id INTEGER PRIMARY KEY, question TEXT NOT NULL, answer TEXT, item_ids TEXT, state TEXT NOT NULL,
      reason TEXT, run TEXT, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  if ((one("PRAGMA user_version")?.user_version || 0) < 1) run("PRAGMA user_version = 1");
}

export function onUpdate() {
  onInstall();
}

// --- places ----------------------------------------------------------------------------------------------

const placeMap = () => new Map(q("SELECT * FROM places ORDER BY name COLLATE NOCASE").map((p) => [p.id, p]));
function pathOf(map, id) {
  const out = [], seen = new Set();
  for (let p = map.get(id); p && !seen.has(p.id); p = map.get(p.parent_id)) { seen.add(p.id); out.unshift(p.name); }
  return out;
}
// A place and every place inside it.
function under(map, id) {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of map.values()) if (p.parent_id && out.has(p.parent_id) && !out.has(p.id)) { out.add(p.id); grew = true; }
  }
  return [...out];
}
// The places hidden from the assistant, with everything inside them.
const hiddenPlaces = (map) => new Set([...map.values()].filter((p) => p.hidden).flatMap((p) => under(map, p.id)));

function savePlace(b) {
  const name = text(b.name, 60);
  if (!name) throw fail("a place needs a name");
  const map = placeMap();
  const id = Number(b.id) || 0;
  if (id && !map.has(id)) throw fail("no such place");
  const parent = Number(b.parent_id) || null;
  if (parent && !map.has(parent)) throw fail("no such place to put it in");
  if (id && parent && under(map, id).includes(parent)) throw fail("a place can't be inside itself");
  if ([...map.values()].some((p) => p.id !== id && (p.parent_id || null) === parent && plain(p.name) === plain(name))) throw fail(`there is already a place called ${name} there`);
  const icon = text(b.icon, 8) || null;
  if (id) run("UPDATE places SET name = ?, parent_id = ?, icon = ?, hidden = ? WHERE id = ?", [name, parent, icon, b.hidden ? 1 : 0, id]);
  else return { id: run("INSERT INTO places (name, parent_id, icon, hidden, created) VALUES (?, ?, ?, ?, ?)", [name, parent, icon, b.hidden ? 1 : 0, now()]).last_id };
  return { id };
}

// A place deleted: its items and the places inside it move up to its parent.
function deletePlace(id) {
  const p = one("SELECT * FROM places WHERE id = ?", [Number(id)]);
  if (!p) throw fail("no such place");
  host.db.transaction(() => {
    run("UPDATE items SET place_id = ?, updated = ? WHERE place_id = ?", [p.parent_id, now(), p.id]);
    run("UPDATE places SET parent_id = ? WHERE parent_id = ?", [p.parent_id, p.id]);
    run("DELETE FROM places WHERE id = ?", [p.id]);
  });
  return { deleted: p.id };
}

// The usual rooms, in the page's language; those already there (by name) are left out.
function addRooms(keys) {
  const map = placeMap();
  let n = 0;
  for (const r of ROOMS.filter((x) => (keys || []).includes(x[0]))) {
    const name = lang() === "en" ? r[1] : r[2];
    if ([...map.values()].some((p) => !p.parent_id && (plain(p.name) === plain(r[1]) || plain(p.name) === plain(r[2])))) continue;
    run("INSERT INTO places (name, parent_id, icon, hidden, created) VALUES (?, NULL, ?, 0, ?)", [name, r[3], now()]);
    n++;
  }
  return { added: n };
}

function placesView(map) {
  const counts = new Map(q("SELECT place_id, count(*) AS n FROM items WHERE status != 'gone' AND place_id IS NOT NULL GROUP BY place_id").map((r) => [r.place_id, r.n]));
  return [...map.values()].map((p) => ({ id: p.id, name: p.name, parent_id: p.parent_id, icon: p.icon, hidden: !!p.hidden,
    path: pathOf(map, p.id), items: counts.get(p.id) || 0, all: under(map, p.id).reduce((s, x) => s + (counts.get(x) || 0), 0) }));
}

// --- items -----------------------------------------------------------------------------------------------

function getItem(id) {
  const it = one("SELECT * FROM items WHERE id = ?", [Number(id)]);
  if (!it) throw fail("no such item");
  return it;
}

function addMonths(d, months) {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dd, last));
  return t.toISOString().slice(0, 10);
}
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
// none | active | soon | expired
function warrantyOf(until) {
  if (!until) return "none";
  const left = dayDiff(until, today());
  return left < 0 ? "expired" : left <= SOON_DAYS ? "soon" : "active";
}

// One field as it is kept (a wrong value -> an error for the owner; for the bot's answer `strict` = false drops it).
function clean(k, v, strict) {
  const bad = (msg) => { if (strict) throw fail(msg); return undefined; };
  if (v === null || v === undefined || v === "") return null;
  switch (k) {
    case "name": return text(v, 160) || null;
    case "category": return CATEGORY_KEYS.includes(v) ? v : bad("unknown category");
    case "quantity": { const n = Math.round(Number(v)); return n >= 1 && n <= 9999 ? n : bad("quantity: 1 - 9999"); }
    case "price": { const n = Number(v); return isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : bad("price: a number"); }
    case "currency": { const c = String(v).trim().toUpperCase(); return /^[A-Z]{3}$/.test(c) ? c : bad("currency: three letters, e.g. HKD"); }
    case "purchase_date": { const d = dayOf(v); if (!d) return bad("date: YYYY-MM-DD"); return d > today() ? bad("the purchase date can't be in the future") : d; }
    case "warranty_until": return dayOf(v) || bad("warranty end: YYYY-MM-DD");
    case "warranty_months": { const n = Math.round(Number(v)); return n >= 0 && n <= 600 ? n : bad("warranty: 0 - 600 months"); }
    case "place_id": { const n = Number(v); return one("SELECT id FROM places WHERE id = ?", [n]) ? n : bad("no such place"); }
    case "tags": {
      const list = (Array.isArray(v) ? v : String(v).split(/[,，、]/)).map((t) => text(t, 40)).filter(Boolean);
      return [...new Map(list.map((t) => [t.toLowerCase(), t])).values()].slice(0, 12);
    }
    case "notes": return text(v, 4000) || null;
    default: return text(v, 160) || null;
  }
}
const stored = (k, v) => (k === "tags" ? JSON.stringify(v || []) : v);

// The warranty's end from the purchase day and its months, unless the owner wrote the end themselves.
function settle(id) {
  const it = getItem(id);
  const owner = json(it.owner_fields, []);
  if (it.purchase_date && it.warranty_months && !owner.includes("warranty_until")) {
    const end = addMonths(it.purchase_date, it.warranty_months);
    if (end !== it.warranty_until) run("UPDATE items SET warranty_until = ? WHERE id = ?", [end, it.id]);
  }
}

function insertItem(fields, owner) {
  const t = now();
  const id = run("INSERT INTO items (name, currency, owner_fields, created, updated) VALUES ('', ?, ?, ?, ?)", [meta("currency", "HKD"), JSON.stringify(owner), t, t]).last_id;
  for (const [k, v] of Object.entries(fields)) if (FIELDS.includes(k) && v !== undefined && v !== null) run(`UPDATE items SET ${k} = ? WHERE id = ?`, [stored(k, v), id]);
  settle(id);
  return id;
}

// The owner's changes: {id?, fields: {...}, status?, lent_to?, hidden?}. Every field changed becomes the owner's.
function saveItem(b) {
  const f = b.fields || {};
  const vals = {};
  for (const k of FIELDS) if (k in f) vals[k] = clean(k, f[k], true);
  if ("quantity" in vals && vals.quantity === null) vals.quantity = 1;
  if (!b.id) {
    if (!vals.name) throw fail("an item needs a name");
    const id = insertItem(vals, Object.keys(vals).filter((k) => vals[k] !== null && k !== "notes"));
    applyState(id, b);
    return itemView(getItem(id), true);
  }
  const it = getItem(b.id);
  if ("name" in vals && !vals.name) throw fail("an item needs a name");
  const owner = new Set(json(it.owner_fields, []));
  for (const [k, v] of Object.entries(vals)) {
    const was = k === "tags" ? it.tags : it[k];
    if (String(stored(k, v) ?? "") === String(was ?? "")) continue;
    run(`UPDATE items SET ${k} = ? WHERE id = ?`, [stored(k, v), it.id]);
    if (k !== "notes") owner.add(k);
  }
  run("UPDATE items SET owner_fields = ?, updated = ? WHERE id = ?", [JSON.stringify([...owner]), now(), it.id]);
  settle(it.id);
  applyState(it.id, b);
  return itemView(getItem(it.id), true);
}

function applyState(id, b) {
  if (b.status !== undefined) {
    if (!STATUS_KEYS.includes(b.status)) throw fail("unknown status");
    run("UPDATE items SET status = ?, lent_to = ? WHERE id = ?", [b.status, b.status === "lent" ? text(b.lent_to, 120) || null : null, id]);
  }
  if (b.hidden !== undefined) run("UPDATE items SET hidden = ? WHERE id = ?", [b.hidden ? 1 : 0, id]);
}

// An item deleted: its files too, unless another item shares them (one receipt for several things).
function deleteItem(id) {
  const it = getItem(id);
  const files = q("SELECT file_id FROM item_files WHERE item_id = ?", [it.id]).map((r) => r.file_id);
  run("DELETE FROM items WHERE id = ?", [it.id]);
  for (const f of files) dropFile(f);
  pump();
  return { deleted: it.id };
}

function dropFile(fileId) {
  if (one("SELECT 1 AS x FROM item_files WHERE file_id = ?", [fileId])) return;
  const f = one("SELECT * FROM files WHERE id = ?", [fileId]);
  if (!f) return;
  for (const n of [f.file, f.thumb]) if (n) try { host.files.remove(n); } catch { /* gone already */ }
  run("DELETE FROM files WHERE id = ?", [fileId]);
}

const filesOf = (id) => q(`SELECT f.id, f.file, f.thumb, f.name, f.media_type, f.size, f.created, x.kind, x.kind_owner FROM item_files x JOIN files f ON f.id = x.file_id
    WHERE x.item_id = ? ORDER BY CASE x.kind WHEN 'photo' THEN 0 WHEN 'receipt' THEN 1 WHEN 'warranty' THEN 2 WHEN 'manual' THEN 3 ELSE 4 END, x.added, f.id`, [id]);

const LIST_SQL = `SELECT i.*,
    (SELECT count(*) FROM item_files x WHERE x.item_id = i.id) AS n_files,
    (SELECT count(*) FROM item_files x WHERE x.item_id = i.id AND x.kind IN ('receipt', 'warranty')) AS n_proofs,
    COALESCE((SELECT f.id FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id AND f.id = i.cover_id AND f.media_type LIKE 'image/%'),
      (SELECT f.id FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id AND f.media_type LIKE 'image/%'
        ORDER BY x.kind = 'photo' DESC, x.added, f.id LIMIT 1)) AS cover
  FROM items i`;

function itemView(it, full, map = placeMap()) {
  const v = { id: it.id, name: it.name, category: it.category, place_id: it.place_id, place: it.place_id ? pathOf(map, it.place_id) : [], spot: it.spot,
    brand: it.brand, model: it.model, serial: it.serial, quantity: it.quantity, purchase_date: it.purchase_date, price: it.price, currency: it.currency,
    shop: it.shop, order_no: it.order_no, warranty_months: it.warranty_months, warranty_until: it.warranty_until, warranty: warrantyOf(it.warranty_until),
    status: it.status, lent_to: it.lent_to, notes: it.notes, tags: json(it.tags, []), hidden: !!it.hidden, summary: it.summary,
    ai_state: stale(it) ? "failed" : it.ai_state, ai_reason: stale(it) ? "no answer from the assistant - read it again" : it.ai_reason,
    created: it.created, updated: it.updated };
  if (!full) return { ...v, cover: it.cover ?? null, n_files: it.n_files ?? 0, n_proofs: it.n_proofs ?? 0 };
  const files = filesOf(it.id).map((f) => ({ id: f.id, name: f.name, media_type: f.media_type, size: f.size, kind: f.kind, thumb: !!f.thumb, created: f.created,
    shared: q("SELECT i.id, i.name FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ? AND x.item_id != ?", [f.id, it.id]) }));
  const cover = files.find((f) => f.id === it.cover_id && f.media_type.startsWith("image/")) || files.find((f) => f.kind === "photo" && f.media_type.startsWith("image/"))
    || files.find((f) => f.media_type.startsWith("image/"));
  return { ...v, cover: cover?.id ?? null, files, owner_fields: json(it.owner_fields, []), tips: json(it.tips, []), others: json(it.others, []),
    warnings: json(it.warnings, []), confidence: it.confidence, ai_hint: it.ai_hint, place_hidden: !!(it.place_id && hiddenPlaces(map).has(it.place_id)) };
}

// The list, searched and filtered: {q, place, category, status (default: not gone; "all"), warranty, proof, check, sort}.
function listItems(f, map = placeMap()) {
  const where = [], p = [];
  for (const word of String(f.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
    const like = `%${word.toLowerCase()}%`;
    const places = [...map.values()].filter((x) => x.name.toLowerCase().includes(word.toLowerCase())).flatMap((x) => under(map, x.id));
    const cats = CATEGORIES.filter((c) => c.name.some((n) => n.toLowerCase().includes(word.toLowerCase()))).map((c) => c.key);
    where.push(`(lower(i.name || ' ' || COALESCE(i.brand, '') || ' ' || COALESCE(i.model, '') || ' ' || COALESCE(i.serial, '') || ' ' || COALESCE(i.shop, '') || ' ' ||
      COALESCE(i.order_no, '') || ' ' || COALESCE(i.spot, '') || ' ' || COALESCE(i.notes, '') || ' ' || i.tags || ' ' || COALESCE(i.summary, '') || ' ' ||
      COALESCE(i.lent_to, '')) LIKE ?${places.length ? ` OR i.place_id IN (${places.map(() => "?").join(",")})` : ""}${cats.length ? ` OR i.category IN (${cats.map(() => "?").join(",")})` : ""})`);
    p.push(like, ...places, ...cats);
  }
  if (f.place === "none") where.push("i.place_id IS NULL");
  else if (Number(f.place) && map.has(Number(f.place))) {
    const ids = under(map, Number(f.place));
    where.push(`i.place_id IN (${ids.map(() => "?").join(",")})`); p.push(...ids);
  }
  if (CATEGORY_KEYS.includes(f.category)) { where.push("i.category = ?"); p.push(f.category); }
  if (STATUS_KEYS.includes(f.status)) { where.push("i.status = ?"); p.push(f.status); } else if (f.status !== "all") where.push("i.status != 'gone'");
  const t = today(), soon = new Date(Date.parse(t) + SOON_DAYS * 86400000).toISOString().slice(0, 10);
  if (f.warranty === "none") where.push("i.warranty_until IS NULL");
  else if (f.warranty === "active") { where.push("i.warranty_until >= ?"); p.push(t); }
  else if (f.warranty === "soon") { where.push("i.warranty_until >= ? AND i.warranty_until <= ?"); p.push(t, soon); }
  else if (f.warranty === "expired") { where.push("i.warranty_until < ?"); p.push(t); }
  if (f.proof === "yes") where.push("EXISTS (SELECT 1 FROM item_files x WHERE x.item_id = i.id AND x.kind IN ('receipt', 'warranty'))");
  else if (f.proof === "no") where.push("NOT EXISTS (SELECT 1 FROM item_files x WHERE x.item_id = i.id AND x.kind IN ('receipt', 'warranty'))");
  if (f.check) where.push("i.ai_state IN ('needs_check', 'failed')");
  const order = { name: "i.name COLLATE NOCASE", price: "i.price IS NULL, i.price * i.quantity DESC", warranty: "i.warranty_until IS NULL, i.warranty_until",
    bought: "i.purchase_date IS NULL, i.purchase_date DESC" }[f.sort] || "i.created DESC";
  return q(`${LIST_SQL}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY ${order}, i.id DESC LIMIT ${Math.min(Math.max(Number(f.limit) || 3000, 1), 3000)}`, p);
}

function stats() {
  const t = today(), soon = new Date(Date.parse(t) + SOON_DAYS * 86400000).toISOString().slice(0, 10);
  const n = (sql, p = []) => one(sql, p).n;
  return {
    items: n("SELECT count(*) AS n FROM items WHERE status != 'gone'"),
    value: q("SELECT COALESCE(currency, '') AS currency, sum(price * quantity) AS total FROM items WHERE status != 'gone' AND price IS NOT NULL GROUP BY currency ORDER BY total DESC"),
    warranty: n("SELECT count(*) AS n FROM items WHERE status != 'gone' AND warranty_until >= ?", [t]),
    soon: n("SELECT count(*) AS n FROM items WHERE status != 'gone' AND warranty_until >= ? AND warranty_until <= ?", [t, soon]),
    lent: n("SELECT count(*) AS n FROM items WHERE status = 'lent'"),
    check: n("SELECT count(*) AS n FROM items WHERE ai_state IN ('needs_check', 'failed')"),
    busy: n("SELECT count(*) AS n FROM items WHERE ai_state IN ('queued', 'reading')"),
    no_place: n("SELECT count(*) AS n FROM items WHERE status != 'gone' AND place_id IS NULL"),
  };
}

// --- files: kept, then read by the owner's bot ---------------------------------------------------------------

const fingerprint = (data) => host.crypto.hmac("homethingy", data, { data_encoding: "base64" }).hex;

// {item_id?, files: [{name, media_type, data, thumb?, kind?}], place_id?, name?, hint?, read (default true), force}
// -> the item. Without item_id a new item is made for the files. A file already kept is refused unless `force`.
function upload(b) {
  const list = Array.isArray(b.files) ? b.files : [];
  if (!list.length) throw fail("no file");
  if (list.length > UPLOAD_FILES) throw fail(`at most ${UPLOAD_FILES} files at once`);
  const ready = list.map((f) => {
    const type = String(f.media_type || "").toLowerCase(), ext = TYPES[type];
    const name = text(f.name, 200) || `file.${ext}`;
    if (!ext) throw fail(`${name}: PDF, JPEG, PNG, WebP or GIF only`);
    const data = String(f.data || "").replace(/^data:[^,]*,/, "");
    if (!data) throw fail(`${name}: the file is empty`);
    const fp = fingerprint(data);
    const dup = one("SELECT i.id, i.name FROM files f JOIN item_files x ON x.file_id = f.id JOIN items i ON i.id = x.item_id WHERE f.fingerprint = ? LIMIT 1", [fp]);
    if (dup && !b.force) throw fail(`DUPLICATE: ${name} is already kept with “${dup.name || "#" + dup.id}”`);
    const thumb = /^[A-Za-z0-9+/=]+$/.test(String(f.thumb || "")) ? f.thumb : null;
    return { name, type, ext, data, fp, thumb, kind: KIND_KEYS.includes(f.kind) ? f.kind : null };
  });
  const it = b.item_id ? getItem(b.item_id) : null;
  const written = [];
  let id;
  try {
    host.db.transaction(() => {
      if (it) id = it.id;
      else {
        const fields = { place_id: clean("place_id", b.place_id, false) ?? null, name: clean("name", b.name, false) ?? null };
        id = insertItem(fields, Object.keys(fields).filter((k) => fields[k] !== null));
      }
      for (const f of ready) {
        const fid = run("INSERT INTO files (file, name, media_type, size, fingerprint, created) VALUES ('', ?, ?, 0, ?, ?)", [f.name, f.type, f.fp, now()]).last_id;
        const file = `f-${fid}.${f.ext}`;
        written.push(file);
        const info = host.files.write(file, f.data, "base64");
        let thumb = null;
        if (f.thumb) { thumb = `t-${fid}.jpg`; written.push(thumb); host.files.write(thumb, f.thumb, "base64"); }
        run("UPDATE files SET file = ?, thumb = ?, size = ? WHERE id = ?", [file, thumb, info.size, fid]);
        run("INSERT INTO item_files (item_id, file_id, kind, kind_owner, added) VALUES (?, ?, ?, ?, ?)",
          [id, fid, f.kind || (f.type === "application/pdf" ? "other" : "photo"), f.kind ? 1 : 0, now()]);
      }
      if (text(b.hint)) run("UPDATE items SET ai_hint = ? WHERE id = ?", [text(b.hint, 1000), id]);
      run("UPDATE items SET updated = ? WHERE id = ?", [now(), id]);
    });
  } catch (e) {
    for (const n of written) try { host.files.remove(n); } catch { /* not written */ }
    throw e;
  }
  if (b.read !== false) queue(id);
  return itemView(getItem(id), true);
}

function queue(id) {
  run("UPDATE items SET ai_state = 'queued', ai_reason = NULL, ai_run = NULL, updated = ? WHERE id = ?", [now(), Number(id)]);
  pump();
}

const stale = (it) => it.ai_state === "reading" && Date.now() - Date.parse(it.ai_run_at || it.updated) > STALE_MS;

// One reading at a time (a big batch from the inbox must not flood the bot); called after every change.
function pump() {
  const busy = one("SELECT * FROM items WHERE ai_state = 'reading' ORDER BY ai_run_at LIMIT 1");
  if (busy && !stale(busy)) return;
  if (busy) run("UPDATE items SET ai_state = 'failed', ai_reason = ? WHERE id = ?", ["no answer from the assistant (the gateway restarted or the bot was away) - read it again", busy.id]);
  const next = one("SELECT id FROM items WHERE ai_state = 'queued' ORDER BY updated, id LIMIT 1");
  if (!next) return;
  try { read(next.id); } catch (e) {
    run("UPDATE items SET ai_state = 'failed', ai_reason = ? WHERE id = ?", [text(e.message), next.id]);
    pump();
  }
}

function read(id) {
  const it = getItem(id);
  const files = filesOf(it.id).sort((a, b) => (a.kind === "photo") - (b.kind === "photo")).slice(0, READ_FILES);
  if (!files.length && !it.name && !it.ai_hint) throw fail("nothing to read - add a photo or a file");
  const map = placeMap();
  const item = Object.fromEntries(FIELDS.filter((k) => k !== "notes").map((k) => [k, k === "tags" ? json(it.tags, []) : it[k]]));
  const data = { today: today(), default_currency: meta("currency", "HKD"), item, owner_fields: json(it.owner_fields, []), hint: it.ai_hint || null,
    files: files.map((f, i) => ({ index: i, name: f.name, kind: f.kind_owner ? f.kind : null })),
    places: [...map.values()].map((p) => ({ id: p.id, path: pathOf(map, p.id).join(" › ") })),
    categories: CATEGORIES.map((c) => ({ key: c.key, name: c.name.join(" / ") })) };
  const { run: r } = host.ai.run({ task: readTask(lang(), files.length), schema: SCHEMA, data, files: files.map((f) => f.file), tag: { item: it.id, files: files.map((f) => f.id) } });
  run("UPDATE items SET ai_state = 'reading', ai_reason = NULL, ai_run = ?, ai_run_at = ?, prompt_version = ? WHERE id = ?", [r, now(), PROMPT_VERSION, it.id]);
}

export function onAiResult(r) {
  if (r.tag?.ask) return askAnswered(r);
  const it = r.tag?.item && one("SELECT * FROM items WHERE id = ?", [r.tag.item]);
  // Deleted meanwhile, or read again since: this answer is not used.
  if (!it || it.ai_run !== r.run) return;
  try {
    if (r.state !== "done") {
      run("UPDATE items SET ai_state = 'failed', ai_reason = ? WHERE id = ?", [text(r.error || "the assistant could not read it"), it.id]);
      return;
    }
    try { host.db.transaction(() => save(it, r.answer, r.tag.files || [])); } catch (e) {
      run("UPDATE items SET ai_state = 'failed', ai_reason = ? WHERE id = ?", [text(`the answer could not be kept: ${e.message}`), it.id]);
    }
  } finally {
    try { host.push({ type: "item", id: it.id }); } catch { /* no page open */ }
    pump();
  }
}

function save(it, a, fileIds) {
  const owner = new Set(json(it.owner_fields, []));
  const x = a.item || {};
  if (a.is_item) {
    for (const k of FIELDS) {
      if (k === "notes" || owner.has(k) || !(k in x)) continue;
      const v = clean(k, x[k], false);
      // Nothing (or nothing usable) read: what was there stays.
      if (v === null || v === undefined || (k === "tags" && !v.length)) continue;
      run(`UPDATE items SET ${k} = ? WHERE id = ?`, [stored(k, v), it.id]);
    }
  }
  for (const f of a.files || []) {
    const fid = fileIds[f.index];
    if (fid && KIND_KEYS.includes(f.kind)) run("UPDATE item_files SET kind = ? WHERE item_id = ? AND file_id = ? AND kind_owner = 0", [f.kind, it.id, fid]);
  }
  const others = (a.others || []).map((o) => ({ name: text(o.name, 160), category: clean("category", o.category, false) ?? null, brand: text(o.brand, 100) || null,
    model: text(o.model, 100) || null, quantity: clean("quantity", o.quantity, false) ?? null, price: clean("price", o.price, false) ?? null })).filter((o) => o.name);
  const named = !!(one("SELECT name FROM items WHERE id = ?", [it.id]).name);
  const sure = a.is_item && named && a.confidence >= SURE;
  run(`UPDATE items SET summary = ?, tips = ?, others = ?, warnings = ?, confidence = ?, ai_state = ?, ai_reason = ?, updated = ? WHERE id = ?`,
    [text(a.summary, 400) || it.summary, JSON.stringify((a.tips || []).map((t) => text(t, 400)).filter(Boolean)), JSON.stringify(others),
     JSON.stringify((a.warnings || []).map((w) => text(w, 300)).filter(Boolean)), typeof a.confidence === "number" ? a.confidence : null,
     sure ? "ready" : "needs_check",
     sure ? null : !a.is_item ? text(a.problem) || "the assistant found no item in the files" : !named ? "the assistant could not tell what it is - give it a name" : "the assistant is not sure it read everything right - please check",
     now(), it.id]);
  settle(it.id);
}

// "Read again", with the owner's hint.
function readAgain(b) {
  const it = getItem(b.id);
  if (it.ai_state === "reading" && !stale(it)) throw fail("it is being read now - wait for the answer");
  if (b.hint !== undefined) run("UPDATE items SET ai_hint = ? WHERE id = ?", [text(b.hint, 1000) || null, it.id]);
  queue(it.id);
  return itemView(getItem(it.id), true);
}

// Another thing on this item's receipt (the bot's `others`) -> its own item, with the same receipt and purchase details.
function addOther(b) {
  const it = getItem(b.id);
  const others = json(it.others, []);
  const o = others[Number(b.index)];
  if (!o || o.added) throw fail("it was added already");
  const id = insertItem({ name: o.name, category: o.category, brand: o.brand, model: o.model, quantity: o.quantity || 1, price: o.price, currency: it.currency,
    purchase_date: it.purchase_date, shop: it.shop, order_no: it.order_no, place_id: it.place_id }, []);
  for (const f of q("SELECT file_id FROM item_files WHERE item_id = ? AND kind = 'receipt'", [it.id]))
    run("INSERT OR IGNORE INTO item_files (item_id, file_id, kind, kind_owner, added) VALUES (?, ?, 'receipt', 1, ?)", [id, f.file_id, now()]);
  run("UPDATE items SET summary = ?, ai_state = 'ready' WHERE id = ?", [lang() === "en" ? `${o.name} - on the receipt of “${it.name}”` : `${o.name} - 同「${it.name}」同一張單據`, id]);
  others[Number(b.index)] = { ...o, added: id };
  run("UPDATE items SET others = ? WHERE id = ?", [JSON.stringify(others), it.id]);
  return itemView(getItem(id), true);
}

function fileOf(itemId, fileId) {
  const f = one("SELECT * FROM item_files WHERE item_id = ? AND file_id = ?", [Number(itemId), Number(fileId)]);
  if (!f) throw fail("no such file of this item");
  return f;
}

// --- ask: a question about the things, answered by the owner's bot from the list ------------------------------

// The items the assistant may see (not hidden, not in a hidden place), as short rows.
function visibleItems(map, rows) {
  const hid = hiddenPlaces(map);
  return rows.filter((it) => !it.hidden && !(it.place_id && hid.has(it.place_id)));
}
const brief = (it, map) => ({ id: it.id, name: it.name, category: it.category, place: it.place_id ? pathOf(map, it.place_id).join(" › ") : null, spot: it.spot || undefined,
  brand: it.brand || undefined, model: it.model || undefined, status: it.status, lent_to: it.lent_to || undefined, quantity: it.quantity,
  purchase_date: it.purchase_date || undefined, price: it.price ?? undefined, currency: it.price != null ? it.currency : undefined, shop: it.shop || undefined,
  warranty_until: it.warranty_until || undefined, tags: json(it.tags, []), summary: it.summary || undefined });

function ask(b) {
  const question = text(b.question, 500);
  if (!question) throw fail("type a question first");
  const map = placeMap();
  const items = visibleItems(map, q("SELECT * FROM items ORDER BY status = 'gone', updated DESC LIMIT 1500")).map((it) => brief(it, map));
  const id = run("INSERT INTO asks (question, state, created) VALUES (?, 'asking', ?)", [question, now()]).last_id;
  try {
    const { run: r } = host.ai.run({ task: askTask(lang()), schema: ASK_SCHEMA, tag: { ask: id },
      data: { question, today: today(), items, places: placesView(map).filter((p) => !hiddenPlaces(map).has(p.id)).map((p) => p.path.join(" › ")) } });
    run("UPDATE asks SET run = ? WHERE id = ?", [r, id]);
  } catch (e) {
    run("UPDATE asks SET state = 'failed', reason = ? WHERE id = ?", [text(e.message), id]);
  }
  run("DELETE FROM asks WHERE id NOT IN (SELECT id FROM asks ORDER BY id DESC LIMIT 30)");
  return askView(one("SELECT * FROM asks WHERE id = ?", [id]));
}

function askAnswered(r) {
  const a = one("SELECT * FROM asks WHERE id = ?", [r.tag.ask]);
  if (!a || a.run !== r.run) return;
  if (r.state === "done") run("UPDATE asks SET state = 'done', answer = ?, item_ids = ? WHERE id = ?", [text(r.answer.answer, 2000), JSON.stringify(r.answer.item_ids || []), a.id]);
  else run("UPDATE asks SET state = 'failed', reason = ? WHERE id = ?", [text(r.error || "no answer"), a.id]);
  try { host.push({ type: "ask", id: a.id }); } catch { /* no page open */ }
}

function askView(a) {
  const late = a.state === "asking" && Date.now() - Date.parse(a.created) > ASK_STALE_MS;
  const map = placeMap();
  const ids = json(a.item_ids, []).filter((x) => Number.isInteger(x)).slice(0, 40);
  const items = ids.length ? q(`${LIST_SQL} WHERE i.id IN (${ids.map(() => "?").join(",")})`, ids).map((it) => itemView(it, false, map)) : [];
  return { id: a.id, question: a.question, answer: a.answer, state: late ? "failed" : a.state, reason: late ? "no answer from the assistant" : a.reason, created: a.created,
    items: ids.map((x) => items.find((it) => it.id === x)).filter(Boolean) };
}

// --- inbox: photos the owner put into the inbox folder (a sub-folder named after a place = that place) -------

function inboxList() {
  let files;
  try { files = host.inbox.list(); } catch (e) { return { available: false, reason: e.message, files: [] }; }
  const places = [...placeMap().values()];
  return {
    available: true,
    files: files.map((f) => {
      const p = f.folder && places.find((x) => plain(x.name) === plain(f.folder));
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", heic: "image/heic", heif: "image/heif" }[ext] || "";
      return { ...f, media_type: type, place_id: p ? p.id : null };
    }),
  };
}

// {folder, name, data?, media_type, thumb?, item_id?, place_id?, read, force}: kept as `upload` does (data = the page's
// smaller photo, else the file as it is), then moved to the inbox's done/ (or rejected/ with the reason).
function importFile(b) {
  const f = { folder: String(b.folder || ""), name: String(b.name || "") };
  const data = b.data || host.inbox.read(f);
  const place = b.place_id !== undefined ? b.place_id : inboxList().files.find((x) => x.folder === f.folder && x.name === f.name)?.place_id;
  let it;
  try {
    it = upload({ item_id: b.item_id, place_id: b.item_id ? undefined : place, files: [{ name: f.name, media_type: b.media_type, data, thumb: b.thumb }], read: b.read, force: b.force });
  } catch (e) {
    // A duplicate stays in the inbox until the owner decides; anything else unusable is set aside with the reason.
    if (!e.message.startsWith("DUPLICATE") && e.plain) host.inbox.reject(f, e.message);
    throw e;
  }
  host.inbox.done(f);
  return it;
}

// --- the page (local page only) -----------------------------------------------------------------------------

export function handle(req) {
  if (req.who !== "owner") return { $response: { status: 403, body: "Home Thingy has no website" } };
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
    if (qs.lang === "en" || qs.lang === "zh") { if (meta("lang") !== qs.lang) setMeta("lang", qs.lang); }
    pump();
    return { places: placesView(placeMap()), categories: CATEGORIES, kinds: KINDS, statuses: STATUSES, rooms: ROOMS, stats: stats(),
      currency: meta("currency", "HKD"), soon_days: SOON_DAYS, inbox: inboxList() };
  }
  if (get && path === "items") {
    const map = placeMap();
    return { items: listItems(qs, map).map((it) => itemView(it, false, map)) };
  }
  if (get && path === "item") return itemView(getItem(qs.id), true);
  if (!get && path === "items") return saveItem(b);
  if (!get && path === "items/delete") return deleteItem(b.id);
  if (!get && path === "items/read") return readAgain(b);
  if (!get && path === "items/confirm") {
    const it = getItem(b.id);
    run("UPDATE items SET ai_state = 'ready', ai_reason = NULL, updated = ? WHERE id = ?", [now(), it.id]);
    return itemView(getItem(it.id), true);
  }
  if (!get && path === "items/other") return addOther(b);
  if (!get && path === "upload") return upload(b);
  if (!get && path === "files/kind") {
    if (!KIND_KEYS.includes(b.kind)) throw fail("unknown kind");
    fileOf(b.item_id, b.file_id);
    run("UPDATE item_files SET kind = ?, kind_owner = 1 WHERE item_id = ? AND file_id = ?", [b.kind, Number(b.item_id), Number(b.file_id)]);
    return itemView(getItem(b.item_id), true);
  }
  if (!get && path === "files/cover") {
    fileOf(b.item_id, b.file_id);
    run("UPDATE items SET cover_id = ?, updated = ? WHERE id = ?", [Number(b.file_id), now(), Number(b.item_id)]);
    return itemView(getItem(b.item_id), true);
  }
  if (!get && path === "files/delete") {
    fileOf(b.item_id, b.file_id);
    run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?", [Number(b.item_id), Number(b.file_id)]);
    dropFile(Number(b.file_id));
    return itemView(getItem(b.item_id), true);
  }
  if (get && path === "file") {
    const f = one("SELECT * FROM files WHERE id = ?", [Number(qs.id)]);
    if (!f || !f.file) return { $response: { status: 404, body: "no file" } };
    return { $response: { file: qs.thumb === "1" && f.thumb ? f.thumb : f.file, download: qs.download === "1" } };
  }
  if (!get && path === "places") return savePlace(b);
  if (!get && path === "places/delete") return deletePlace(b.id);
  if (!get && path === "places/rooms") return addRooms(b.rooms);
  if (!get && path === "settings") {
    const c = clean("currency", b.currency, true);
    if (c) setMeta("currency", c);
    return { currency: meta("currency", "HKD") };
  }
  if (!get && path === "ask") return ask(b);
  if (get && path === "asks") return { asks: q("SELECT * FROM asks ORDER BY id DESC LIMIT 20").map(askView) };
  if (!get && path === "asks/delete") { run("DELETE FROM asks WHERE id = ?", [Number(b.id)]); return { deleted: Number(b.id) }; }
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

// --- the assistant's tools (read only; nothing the owner hid) -------------------------------------------------

function placeArg(map, arg) {
  const s = String(arg ?? "").trim();
  if (!s) return null;
  const hid = hiddenPlaces(map);
  const p = [...map.values()].find((x) => !hid.has(x.id) && (String(x.id) === s || plain(x.name) === plain(s) || plain(pathOf(map, x.id).join("›")) === plain(s.replace(/\s*[>›/]\s*/g, "›"))));
  if (!p) throw fail(`no place "${s}" (see home_places)`);
  return p.id;
}

export function callTool(name, args = {}) {
  const map = placeMap();
  if (name === "home_places") {
    const hid = hiddenPlaces(map);
    const counts = new Map(visibleItems(map, q("SELECT id, place_id, hidden FROM items WHERE status != 'gone'")).reduce((m, it) => m.set(it.place_id, (m.get(it.place_id) || 0) + 1), new Map()));
    return { places: [...map.values()].filter((p) => !hid.has(p.id)).map((p) => ({ id: p.id, path: pathOf(map, p.id).join(" › "), items: counts.get(p.id) || 0 })),
      without_place: counts.get(null) || 0, note: ASSISTANT };
  }
  if (name === "home_find") {
    const f = { q: text(args.query, 200), category: args.category, status: args.status || undefined, warranty: args.warranty, place: placeArg(map, args.place) ?? undefined };
    const rows = visibleItems(map, listItems(f, map));
    return { items: rows.slice(0, 100).map((it) => ({ ...brief(it, map), receipt: it.n_proofs > 0, files: it.n_files })), found: rows.length,
      note: `${rows.length > 100 ? "The first 100 only - narrow the search. " : ""}${ASSISTANT} Status "gone" items are left out unless status = "gone" or "all".` };
  }
  if (name === "home_item") {
    const rows = visibleItems(map, q("SELECT * FROM items WHERE id = ?", [Number(args.id)]));
    if (!rows.length) throw fail(`no item ${args.id} (see home_find)`);
    const it = rows[0], files = filesOf(it.id);
    const out = { ...brief(it, map), serial: it.serial || undefined, order_no: it.order_no || undefined, warranty_months: it.warranty_months ?? undefined,
      warranty: warrantyOf(it.warranty_until), notes: it.notes || undefined, tips: json(it.tips, []), files: files.map((f) => ({ name: f.name, kind: f.kind })), note: ASSISTANT };
    if (args.picture) {
      const pic = files.find((f) => f.id === it.cover_id && f.media_type.startsWith("image/")) || files.find((f) => f.media_type.startsWith("image/"));
      if (pic) out.$attachments = [{ name: pic.name, media_type: pic.media_type, data: host.files.read(pic.file) }];
    }
    return out;
  }
  if (name === "home_warranty") {
    const days = Math.min(Math.max(Number(args.days) || SOON_DAYS, 1), 3650);
    const t = today(), end = new Date(Date.parse(t) + days * 86400000).toISOString().slice(0, 10), since = new Date(Date.parse(t) - 30 * 86400000).toISOString().slice(0, 10);
    const rows = visibleItems(map, q("SELECT * FROM items WHERE status != 'gone' AND warranty_until >= ? AND warranty_until <= ? ORDER BY warranty_until", [since, end]));
    return { today: t, items: rows.map((it) => ({ ...brief(it, map), days_left: dayDiff(it.warranty_until, t) })),
      note: `Warranties ending within ${days} days, and those that ended in the last 30 days (days_left < 0). ${ASSISTANT}` };
  }
  throw new Error(`no tool ${name}`);
}
