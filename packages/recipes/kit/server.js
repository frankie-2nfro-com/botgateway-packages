// App kit - server part (runs in the gateway's sandbox; app_sandbox_requirements.txt 4).
// Collections of items in the application's own SQLite database, their files, generic operations for the
// page and the client's LLM, and AI actions. An application copies kit/ into its package and builds on
// it (or doesn't use it at all - the gateway doesn't know the kit).
//
//   import { createApp } from "../kit/server.js";
//   export const { handle, callTool, onAiResult, onInstall, onUpdate } = createApp({ name, collections, actions, look, upgrade });
//
// look: { accent, paper, font: "serif" | "sans" | "rounded", icon: an emoji or a picture in web/ (e.g. "icon.png"),
//         cover: a picture in web/ for items without a cover }
// languages: ["en", "zh"] (the page gets a switch), words: { zh: { "<English name>": "<translation>" } } for the
//   app's names, field titles, choices, units and actions (the kit translates its own words).
// upgrade(kit): run once each time the program starts (so also after an install / a new version), for changing
//   old data (kit: items(collection), update(collection, id, changes)); it must be safe to run again.
//
// Collection: { name, title, item, view: "list" | "cards" | "files", cover, label: "<field naming an item>",
//               public: ["read","add","change","delete"], fields: [...],
//               publish: { field: "<choice field>", value: "<its value>" }  (visitors see only the items with
//                 that value, e.g. status = "published"; the owner and the client see all)
//               scale: { base: "<number field>", table: "<table field>" }  (its number column follows the base)
//               look: "<choice field>"  (class look-<value> on an item's page) }
// Collection `dates: true`: the page shows created / updated. Field `auto: true`: kept by the program (not in
// the page's form); `format: "v{n}"`: a number's chip.
// Field: { name, title, type, required, choices, default (a new item's value), unit (number), ref, owned
//          (ref / refs: deleting the last item it points to deletes this one too), columns, numbered }
// Field types: text, longtext, number, bool, choice (choices), json, list (numbered), image, images, file,
//   ref / refs (ref = "<collection>"), table (columns: [{ name, title, type: "text" | "number" | "image" }], numbered)
// Action: { name, title, on, include: ["<collection pointing here>"], public, schema,
//           task(item, related) -> text, apply(answer, ctx) -> nothing (ctx: item, related, update, copyFile),
//           ask: { title, hint }  (the page first asks for optional extra requirements; they are added to the task) }
//
// API (the page, under api/): GET meta, POST call {op, arguments}, POST action {action, item, extra},
// POST cancel {collection, item}, GET runs?collection=&item=, GET files/<name>. While an action's AI run
// waits (at most 15 minutes), its item and the items pointing to it can't be changed or deleted. Visitors (request.who == "visitor") get only what the
// collection's `public` / the action's `public` allow; the owner everything.

const MAX_FILE = 10 * 1024 * 1024;
// An AI run that has not answered in this time is taken as failed (e.g. the gateway restarted meanwhile).
const WAIT_LIMIT_MS = 15 * 60 * 1000;
const now = () => new Date().toISOString();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// The kit's own refusals (shown to visitors as they are); any other error (e.g. from the database) is shown
// to visitors only as "something went wrong", so nothing inside leaks.
const fail = (msg) => Object.assign(new Error(msg), { kit: true });
// A whole number from a request, within [min, max] (default when it isn't one).
const int = (v, def, min, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def; };
// Messages people see, in the page's language (its Accept-Language; the client's LLM always gets English).
const SAY = {
  zh: {
    "{what} {id} not found": "找不到{what} {id}",
    "{what} is needed": "必須填寫{what}",
    "The assistant is working on this {what} - wait until it is done, or cancel it.": "助手正在處理這個{what} - 請等它完成，或者取消。",
    "The assistant is working on that {what} - wait until it is done, or cancel it.": "助手正在處理那個{what} - 請等它完成，或者取消。",
    "This isn't open to visitors.": "這裏不開放給訪客。",
    "The assistant is already working on it.": "助手已經在處理。",
    "The extra requirements are too long (at most {n} characters).": "額外要求太長（最多 {n} 個字）。",
    "{what}: the file is larger than 10 MB": "{what}：檔案大於 10 MB",
    "Something went wrong - please try again.": "出了點問題 - 請再試一次。",
  },
};

export function createApp(spec) {
  const colls = spec.collections || [];
  const actions = spec.actions || [];
  const coll = (name) => colls.find((c) => c.name === name);
  const table = (c) => `c_${c.name}`;
  let ready = false;
  let lang = "en";
  const names = () => (spec.words && spec.words[lang]) || {};
  const tn = (s) => names()[s] ?? s;
  const say = (key, vars = {}) => String(((SAY[lang] || {})[key]) ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const itemWord = (c) => tn(c.item || c.name);

  // ---------- storage: one table per collection, the item as JSON ----------
  function setup() {
    if (ready) return;
    for (const c of colls) {
      if (!/^[a-z][a-z0-9_]*$/.test(c.name)) throw fail(`collection name '${c.name}': a-z, 0-9, _`);
      host.db.script(`CREATE TABLE IF NOT EXISTS ${table(c)} (id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL, updated TEXT NOT NULL)`);
    }
    host.db.script(`CREATE TABLE IF NOT EXISTS _runs (run TEXT PRIMARY KEY, action TEXT, coll TEXT, item INTEGER, state TEXT, error TEXT, started TEXT, finished TEXT)`);
    ready = true;
    upgrade();
  }
  const row = (c, r) => ({ ...JSON.parse(r.data), id: r.id, created: r.created, updated: r.updated });
  function get(c, id) {
    const r = host.db.query(`SELECT * FROM ${table(c)} WHERE id = ?`, [Number(id)])[0];
    return r ? row(c, r) : null;
  }
  // Visitors see only published items (the collection's `publish`).
  const shown = (c, it) => !c.publish || (it && it[c.publish.field] === c.publish.value);
  function list(c, args = {}, visitor) {
    const where = [], params = [];
    if (visitor && c.publish) { where.push(`json_extract(data, '$.${c.publish.field}') = ?`); params.push(c.publish.value); }
    if (args.query) { where.push("data LIKE ?"); params.push(`%${String(args.query)}%`); }
    for (const f of c.fields.filter((f) => f.type === "ref" || f.type === "refs")) {
      if (args[f.name] === undefined || args[f.name] === null) continue;
      if (f.type === "ref") where.push(`json_extract(data, '$.${f.name}') = ?`);
      else where.push(`EXISTS (SELECT 1 FROM json_each(data, '$.${f.name}') WHERE value = ?)`);
      params.push(Number(args[f.name]));
    }
    const limit = int(args.limit, 50, 1, 500), offset = int(args.offset, 0, 0, 1e9);
    const sql = `SELECT * FROM ${table(c)}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY updated DESC LIMIT ${limit} OFFSET ${offset}`;
    return { items: host.db.query(sql, params).map((r) => row(c, r)) };
  }

  // ---------- writing items: values checked per field type ----------
  const safeName = (n) => String(n || "file").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80) || "file";
  function saveUpload(c, id, f, v, suffix = "") {
    const data = String(v.data || "").replace(/^data:[^,]*,/, "");
    if (data.length * 0.75 > MAX_FILE) throw fail(say("{what}: the file is larger than 10 MB", { what: tn(f.title || f.name) }));
    const name = `${c.name}-${id}-${f.name}${suffix}-${safeName(v.name)}`.slice(0, 160);
    host.files.write(name, data, "base64");
    return name;
  }
  /** A file value: an upload {name, data}, a kept {file}, or the name of a stored file (e.g. from an AI answer). */
  function fileValue(c, id, f, v, suffix = "") {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string") v = { file: v };
    if (!isObj(v)) throw fail(`${f.name}: a file`);
    if (v.data !== undefined) return { file: saveUpload(c, id, f, v, suffix) };
    if (v.file && host.files.info(String(v.file))) return { file: String(v.file) };
    throw fail(`${f.name}: no file '${v.file}'`);
  }
  function value(c, id, f, v) {
    if (v === null || v === undefined) return null;
    switch (f.type) {
      case "number": { const n = Number(v); if (!Number.isFinite(n)) throw fail(`${f.name}: a number`); return n; }
      case "bool": return !!v;
      case "choice": if (!(f.choices || []).includes(v)) throw fail(`${f.name}: one of ${(f.choices || []).join(", ")}`); return v;
      case "json": return v;
      case "list": if (!Array.isArray(v)) throw fail(`${f.name}: a list`); return v.map(String).filter((s) => s.trim());
      case "ref": { const t = coll(f.ref), n = Number(v); if (!t || !get(t, n)) throw fail(`${f.name}: no ${f.ref} ${v}`); return n; }
      case "refs": {
        const t = coll(f.ref); if (!Array.isArray(v)) v = [v];
        const out = [...new Set(v.map(Number))];
        for (const n of out) if (!t || !get(t, n)) throw fail(`${f.name}: no ${f.ref} ${n}`);
        return out;
      }
      case "image": case "file": return fileValue(c, id, f, v);
      case "images": {
        if (!Array.isArray(v)) throw fail(`${f.name}: a list of pictures`);
        return v.map((x, i) => fileValue(c, id, f, x, `${i}`)).filter(Boolean);
      }
      case "table": {
        if (!Array.isArray(v)) throw fail(`${f.name}: a list of rows`);
        return v.filter(isObj).map((r, i) => {
          const out = {};
          for (const col of f.columns || []) {
            const x = r[col.name];
            if (x === null || x === undefined || x === "") continue;
            if (col.type === "number") { const n = Number(x); if (Number.isFinite(n)) out[col.name] = n; }
            else if (col.type === "image") { const fv = fileValue(c, id, { name: `${f.name}${i}` }, x); if (fv) out[col.name] = fv; }
            else out[col.name] = String(x);
          }
          return out;
        }).filter((r) => Object.keys(r).length);
      }
      default: return String(v);
    }
  }
  /** keepTime: an old item keeps its "updated" time (data upgrades don't reorder the list). */
  function write(c, id, args, keepTime) {
    if (!isObj(args)) throw fail("arguments: an object");
    const old = id ? get(c, id) : null;
    if (id && !old) throw fail(`${c.name} ${id} not found`);
    const t = now();
    let newId = id;
    if (!id) newId = host.db.exec(`INSERT INTO ${table(c)} (data, created, updated) VALUES ('{}', ?, ?)`, [t, t]).last_id;
    try {
      const data = old ? { ...old } : {};
      delete data.id; delete data.created; delete data.updated;
      if (!id) for (const f of c.fields) if (f.default !== undefined && !(f.name in args)) args = { ...args, [f.name]: f.default };
      for (const f of c.fields) {
        if (!(f.name in args)) continue;
        const v = value(c, newId, f, args[f.name]);
        if (v === null || (Array.isArray(v) && !v.length)) delete data[f.name]; else data[f.name] = v;
      }
      for (const f of c.fields) if (f.required && (data[f.name] === undefined || data[f.name] === "")) throw fail(say("{what} is needed", { what: tn(f.title || f.name) }));
      host.db.exec(`UPDATE ${table(c)} SET data = ?, updated = ? WHERE id = ?`, [JSON.stringify(data), keepTime && old ? old.updated : t, newId]);
    } catch (e) {
      if (!id) host.db.exec(`DELETE FROM ${table(c)} WHERE id = ?`, [newId]);
      throw e;
    }
    return get(c, newId);
  }
  function filesOf(c, it) {
    const out = [];
    for (const f of c.fields) {
      const v = it[f.name];
      if ((f.type === "image" || f.type === "file") && v && v.file) out.push(v.file);
      if (f.type === "images" && Array.isArray(v)) out.push(...v.map((x) => x.file));
      if (f.type === "table" && Array.isArray(v)) for (const r of v) for (const col of f.columns || []) if (col.type === "image" && r[col.name]) out.push(r[col.name].file);
    }
    return out.filter(Boolean);
  }
  // What deleting an item does to the items pointing to it: those that belong to it (their ref field has
  // `owned: true`) and point to nothing else go too, with their files; the others only lose the reference.
  function dependants(c, id) {
    const goes = [], loses = [];
    for (const o of colls) {
      for (const f of o.fields.filter((f) => (f.type === "ref" || f.type === "refs") && f.ref === c.name)) {
        for (const x of list(o, { [f.name]: id, limit: 500 }).items) {
          const rest = [x[f.name]].flat().filter((v) => v !== null && v !== undefined && Number(v) !== Number(id));
          (f.owned && !rest.length ? goes : loses).push({ o, f, x, rest });
        }
      }
    }
    return { goes, loses };
  }
  function removeNow(c, id) {
    const it = get(c, id);
    if (!it) return;
    const d = dependants(c, id);
    for (const l of d.loses) write(l.o, l.x.id, { [l.f.name]: l.f.type === "refs" ? l.rest : null });
    for (const g of d.goes) removeNow(g.o, g.x.id);
    host.db.exec(`DELETE FROM ${table(c)} WHERE id = ?`, [Number(id)]);
    // Its own files go too (named after it); files of other items are kept.
    for (const name of filesOf(c, it)) if (name.startsWith(`${c.name}-${it.id}-`)) host.files.remove(name);
  }
  /** preview: only say what would go ({also: [{collection, id}], kept: [...]}). */
  function remove(c, id, preview) {
    if (!get(c, id)) throw fail(`${c.name} ${id} not found`);
    const d = dependants(c, id);
    const ids = (l) => l.map((x) => ({ collection: x.o.name, id: x.x.id }));
    if (preview) return { also: ids(d.goes), kept: ids(d.loses) };
    host.db.transaction(() => removeNow(c, id));
    return { deleted: Number(id), also: ids(d.goes), kept: ids(d.loses) };
  }

  // ---------- locks: an item (and what points to it) can't change while the assistant works on it ----------
  function expire() {
    const before = new Date(Date.now() - WAIT_LIMIT_MS).toISOString();
    host.db.exec("UPDATE _runs SET state = 'failed', error = 'no answer from the assistant in 15 minutes', finished = ? WHERE state = 'waiting' AND started < ?", [now(), before]);
  }
  function busy(collName, id) {
    expire();
    return host.db.query("SELECT run FROM _runs WHERE coll = ? AND item = ? AND state = 'waiting' LIMIT 1", [collName, Number(id)]).length > 0;
  }
  // Refused when the item, or an item it points to (e.g. a material's recipe, before or after), is being worked on.
  function checkFree(c, id, args) {
    if (id && busy(c.name, id)) throw fail(say("The assistant is working on this {what} - wait until it is done, or cancel it.", { what: itemWord(c) }));
    const old = id ? get(c, id) : null;
    for (const f of c.fields.filter((f) => f.type === "ref" || f.type === "refs")) {
      const ids = new Set([old && old[f.name], args && args[f.name]].flat().filter((x) => x !== null && x !== undefined).map(Number));
      for (const t of ids) if (busy(f.ref, t)) throw fail(say("The assistant is working on that {what} - wait until it is done, or cancel it.", { what: itemWord(coll(f.ref)) }));
    }
  }
  function cancel(collName, item, who) {
    setup();
    const c = coll(collName);
    if (!c) throw fail("no such collection");
    if (who === "visitor" && !actions.some((a) => a.on === c.name && a.public)) throw fail(say("This isn't open to visitors."));
    host.db.exec("UPDATE _runs SET state = 'cancelled', finished = ? WHERE coll = ? AND item = ? AND state = 'waiting'", [now(), c.name, Number(item)]);
    return { cancelled: true };
  }

  // ---------- operations (the page's `call` and the client's tools) ----------
  function op(name, args, who) {
    setup();
    const m = /^([a-z][a-z0-9_]*)_(list|get|add|update|delete)$/.exec(name || "");
    const c = m && coll(m[1]);
    if (!c) {
      const a = actions.find((x) => x.name === name);
      if (a) return startAction(a, Number(args.id ?? args.item), who, args.extra);
      throw fail(`no operation '${name}'`);
    }
    const need = { list: "read", get: "read", add: "add", update: "change", delete: "delete" }[m[2]];
    if (who === "visitor" && !(c.public || []).includes(need)) throw fail(say("This isn't open to visitors."));
    const visitor = who === "visitor";
    switch (m[2]) {
      case "list": return list(c, args, visitor);
      case "get": { const it = get(c, args.id); if (!it || (visitor && !shown(c, it))) throw fail(say("{what} {id} not found", { what: itemWord(c), id: args.id })); return it; }
      case "add": checkFree(c, null, args); return write(c, null, args);
      case "update": { const { id, ...rest } = args; checkFree(c, Number(id), rest); return write(c, Number(id), rest); }
      case "delete": checkFree(c, Number(args.id), null); return remove(c, Number(args.id), !!args.preview);
    }
  }

  // ---------- AI actions ----------
  const pointing = (c, other) => other.fields.find((f) => (f.type === "ref" || f.type === "refs") && f.ref === c.name);
  const MAX_EXTRA = 4000;
  function startAction(a, id, who, extra) {
    setup();
    if (who === "visitor" && !a.public) throw fail(say("This isn't open to visitors."));
    const c = coll(a.on), it = get(c, id);
    if (!it) throw fail(say("{what} {id} not found", { what: itemWord(c), id }));
    if (busy(c.name, id)) throw fail(say("The assistant is already working on it."));
    extra = typeof extra === "string" ? extra.trim() : "";
    if (extra.length > MAX_EXTRA) throw fail(say("The extra requirements are too long (at most {n} characters).", { n: MAX_EXTRA }));
    const related = {}, files = filesOf(c, it);
    for (const name of a.include || []) {
      const o = coll(name), f = pointing(c, o);
      related[name] = list(o, { [f.name]: id, limit: 200 }).items;
      for (const x of related[name]) files.push(...filesOf(o, x));
    }
    let task = a.task(it, related);
    if (extra) task += `\n\nExtra requirements from the owner for this time. Follow them; where they differ from the rules above, they win (the answer must still match the schema):\n${extra}`;
    const { run } = host.ai.run({ task, schema: a.schema, data: { item: it, related }, files: [...new Set(files)].slice(0, 20), tag: { action: a.name, coll: c.name, item: id } });
    host.db.exec("INSERT INTO _runs (run, action, coll, item, state, started) VALUES (?, ?, ?, ?, 'waiting', ?)", [run, a.name, c.name, id, now()]);
    return { run, state: "waiting" };
  }
  function onAiResult(r) {
    setup();
    lang = "en"; // saved run errors are translated by the page
    const tag = r.tag || {};
    const a = actions.find((x) => x.name === tag.action), c = coll(tag.coll);
    const end = (state, error) => host.db.exec("UPDATE _runs SET state = ?, error = ?, finished = ? WHERE run = ?", [state, error || null, now(), r.run]);
    // Cancelled (or timed out) meanwhile: the answer is not used.
    const was = host.db.query("SELECT state FROM _runs WHERE run = ?", [r.run])[0];
    if (!was || was.state !== "waiting") return;
    if (!a || !c) return end("failed", "the action is gone");
    if (r.state !== "done") return end("failed", r.error);
    try {
      host.db.transaction(() => {
        const it = get(c, tag.item);
        if (!it) throw fail("the item was deleted");
        const related = {};
        for (const name of a.include || []) related[name] = list(coll(name), { [pointing(c, coll(name)).name]: it.id, limit: 200 }).items;
        a.apply(r.answer, {
          item: it, related,
          update: (args) => write(c, it.id, args),
          updateOther: (name, id, args) => write(coll(name), id, args),
          // A copy of a file under this item's name (so it is shown with it, e.g. on the website).
          copyFile: (from, field) => {
            if (!host.files.info(from)) return null;
            const to = `${c.name}-${it.id}-${field}-${from.replace(/^[a-z0-9_]+-\d+-[a-z0-9_]+-/, "")}`.slice(0, 160);
            if (to !== from) host.files.write(to, host.files.read(from), "base64");
            return { file: to };
          },
        });
      });
      end("done");
    } catch (e) {
      end("failed", `saving the answer: ${e.message}`);
    }
  }
  function runs(collName, item) {
    setup();
    expire();
    return host.db.query("SELECT * FROM _runs WHERE coll = ? AND item = ? ORDER BY started DESC LIMIT 5", [collName, Number(item)]);
  }

  // ---------- the page's API ----------
  function meta(who) {
    const visitor = who === "visitor";
    return {
      name: spec.name || host.app.name, look: spec.look || {}, enabled: true, public: visitor,
      languages: spec.languages || ["en"], words: spec.words || {}, version: host.app.version || "",
      collections: colls.filter((c) => !visitor || (c.public || []).length),
      actions: actions.filter((a) => !visitor || a.public).map((a) => ({ name: a.name, title: a.title, on: a.on, runnable: true, ask: a.ask || null })),
    };
  }
  // A plain-text answer with an HTTP status (the gateway's "$response"; anything else is sent as JSON).
  const reply = (status, body) => ({ $response: { status, body, headers: { "content-type": "text/plain; charset=utf-8" } } });
  function handle(req) {
    setup();
    // The page sends its language (the switch) as Accept-Language.
    const asked = String((req.headers && req.headers["accept-language"]) || "").slice(0, 2).toLowerCase();
    lang = (spec.languages || ["en"]).includes(asked) ? asked : "en";
    const who = req.who, path = req.path.replace(/^\/+/, "");
    const body = () => { try { return req.body ? JSON.parse(req.body) : {}; } catch { throw fail("the body must be JSON"); } };
    try {
      if (req.method === "GET" && path === "meta") return meta(who);
      if (req.method === "POST" && path === "call") { const b = body(); return op(b.op, b.arguments || {}, who); }
      if (req.method === "POST" && path === "action") {
        const b = body(), a = actions.find((x) => x.name === b.action);
        if (!a) return reply(404, "no such action");
        return startAction(a, Number(b.item), who, b.extra);
      }
      if (req.method === "POST" && path === "cancel") { const b = body(); return cancel(b.collection, b.item, who); }
      if (req.method === "GET" && path === "runs") {
        const c = coll(req.query.collection);
        if (!c || (who === "visitor" && !actions.some((a) => a.on === c.name && a.public))) return reply(403, say("This isn't open to visitors."));
        return runs(c.name, req.query.item);
      }
      if (req.method === "GET" && path.startsWith("files/")) {
        const name = decodeURIComponent(path.slice(6));
        const [cn, id] = name.split("-"), c = coll(cn);
        // A file is named after its item (<collection>-<id>-...): visitors get it only while a published item
        // uses it (not an old photo it no longer shows).
        const it = c && get(c, id);
        if (!c || (who === "visitor" && (!(c.public || []).includes("read") || !shown(c, it) || !filesOf(c, it).includes(name)))) return reply(404, "no such file");
        return { $response: { file: name } };
      }
      if (spec.handle) { const r = spec.handle(req, { op, get: (n, id) => get(coll(n), id) }); if (r !== undefined) return r; }
      return reply(404, "not found");
    } catch (e) {
      if (!e.kit) host.log(`request failed: ${e.message}`);
      const msg = e.kit || who !== "visitor" ? e.message : say("Something went wrong - please try again.");
      return reply(e.message === say("This isn't open to visitors.") ? 403 : 400, msg);
    }
  }

  // The app's data upgrade: once each time the program starts (and so after every install / new version).
  function upgrade() {
    if (!spec.upgrade) return;
    const all = (n) => { const c = coll(n); return host.db.query(`SELECT * FROM ${table(c)}`).map((r) => row(c, r)); };
    host.db.transaction(() => spec.upgrade({ items: all, update: (n, id, args) => write(coll(n), id, args, true) }));
  }

  return {
    handle,
    callTool: (name, args) => { lang = "en"; return op(name, args || {}, "client"); },
    onAiResult,
    onInstall: () => setup(),
    onUpdate: () => setup(),
  };
}
