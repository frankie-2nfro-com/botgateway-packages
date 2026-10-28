// App kit - server part (runs in the gateway's sandbox; app_sandbox_requirements.txt 4).
// Collections of items in the application's own SQLite database, their files, generic operations for the
// page and the client's LLM, and AI actions. An application copies kit/ into its package and builds on
// it (or doesn't use it at all - the gateway doesn't know the kit).
//
//   import { createApp } from "../kit/server.js";
//   export const { handle, callTool, onAiResult, onInstall, onUpdate } = createApp({ name, collections, actions, look });
//
// Collection: { name, title, item, view: "list" | "cards" | "files", cover, label: "<field naming an item>",
//               public: ["read","add","change","delete"], fields: [...],
//               scale: { base: "<number field>", table: "<table field>" }  (its number column follows the base)
//               look: "<choice field>"  (class look-<value> on an item's page) }
// Field: { name, title, type, required, choices, unit (number), ref, columns, numbered }
// Field types: text, longtext, number, bool, choice (choices), json, list (numbered), image, images, file,
//   ref / refs (ref = "<collection>"), table (columns: [{ name, title, type: "text" | "number" | "image" }], numbered)
// Action: { name, title, on, include: ["<collection pointing here>"], public, schema,
//           task(item, related) -> text, apply(answer, ctx) -> nothing (ctx: item, related, update, copyFile) }
//
// API (the page, under api/): GET meta, POST call {op, arguments}, POST action {action, item},
// GET runs?collection=&item=, GET files/<name>. Visitors (request.who == "visitor") get only what the
// collection's `public` / the action's `public` allow; the owner everything.

const MAX_FILE = 10 * 1024 * 1024;
const now = () => new Date().toISOString();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function createApp(spec) {
  const colls = spec.collections || [];
  const actions = spec.actions || [];
  const coll = (name) => colls.find((c) => c.name === name);
  const table = (c) => `c_${c.name}`;
  let ready = false;

  // ---------- storage: one table per collection, the item as JSON ----------
  function setup() {
    if (ready) return;
    for (const c of colls) {
      if (!/^[a-z][a-z0-9_]*$/.test(c.name)) throw new Error(`collection name '${c.name}': a-z, 0-9, _`);
      host.db.script(`CREATE TABLE IF NOT EXISTS ${table(c)} (id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL, updated TEXT NOT NULL)`);
    }
    host.db.script(`CREATE TABLE IF NOT EXISTS _runs (run TEXT PRIMARY KEY, action TEXT, coll TEXT, item INTEGER, state TEXT, error TEXT, started TEXT, finished TEXT)`);
    ready = true;
  }
  const row = (c, r) => ({ ...JSON.parse(r.data), id: r.id, created: r.created, updated: r.updated });
  function get(c, id) {
    const r = host.db.query(`SELECT * FROM ${table(c)} WHERE id = ?`, [Number(id)])[0];
    return r ? row(c, r) : null;
  }
  function list(c, args = {}) {
    const where = [], params = [];
    if (args.query) { where.push("data LIKE ?"); params.push(`%${String(args.query)}%`); }
    for (const f of c.fields.filter((f) => f.type === "ref" || f.type === "refs")) {
      if (args[f.name] === undefined || args[f.name] === null) continue;
      if (f.type === "ref") where.push(`json_extract(data, '$.${f.name}') = ?`);
      else where.push(`EXISTS (SELECT 1 FROM json_each(data, '$.${f.name}') WHERE value = ?)`);
      params.push(Number(args[f.name]));
    }
    const limit = Math.min(Number(args.limit) || 50, 500), offset = Number(args.offset) || 0;
    const sql = `SELECT * FROM ${table(c)}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY updated DESC LIMIT ${limit} OFFSET ${offset}`;
    return { items: host.db.query(sql, params).map((r) => row(c, r)) };
  }

  // ---------- writing items: values checked per field type ----------
  const safeName = (n) => String(n || "file").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80) || "file";
  function saveUpload(c, id, f, v, suffix = "") {
    const data = String(v.data || "").replace(/^data:[^,]*,/, "");
    if (data.length * 0.75 > MAX_FILE) throw new Error(`${f.name}: the file is larger than 10 MB`);
    const name = `${c.name}-${id}-${f.name}${suffix}-${safeName(v.name)}`.slice(0, 160);
    host.files.write(name, data, "base64");
    return name;
  }
  /** A file value: an upload {name, data}, a kept {file}, or the name of a stored file (e.g. from an AI answer). */
  function fileValue(c, id, f, v, suffix = "") {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string") v = { file: v };
    if (!isObj(v)) throw new Error(`${f.name}: a file`);
    if (v.data !== undefined) return { file: saveUpload(c, id, f, v, suffix) };
    if (v.file && host.files.info(String(v.file))) return { file: String(v.file) };
    throw new Error(`${f.name}: no file '${v.file}'`);
  }
  function value(c, id, f, v) {
    if (v === null || v === undefined) return null;
    switch (f.type) {
      case "number": { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${f.name}: a number`); return n; }
      case "bool": return !!v;
      case "choice": if (!(f.choices || []).includes(v)) throw new Error(`${f.name}: one of ${(f.choices || []).join(", ")}`); return v;
      case "json": return v;
      case "list": if (!Array.isArray(v)) throw new Error(`${f.name}: a list`); return v.map(String).filter((s) => s.trim());
      case "ref": { const t = coll(f.ref), n = Number(v); if (!t || !get(t, n)) throw new Error(`${f.name}: no ${f.ref} ${v}`); return n; }
      case "refs": {
        const t = coll(f.ref); if (!Array.isArray(v)) v = [v];
        const out = [...new Set(v.map(Number))];
        for (const n of out) if (!t || !get(t, n)) throw new Error(`${f.name}: no ${f.ref} ${n}`);
        return out;
      }
      case "image": case "file": return fileValue(c, id, f, v);
      case "images": {
        if (!Array.isArray(v)) throw new Error(`${f.name}: a list of pictures`);
        return v.map((x, i) => fileValue(c, id, f, x, `${i}`)).filter(Boolean);
      }
      case "table": {
        if (!Array.isArray(v)) throw new Error(`${f.name}: a list of rows`);
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
  function write(c, id, args) {
    if (!isObj(args)) throw new Error("arguments: an object");
    const old = id ? get(c, id) : null;
    if (id && !old) throw new Error(`${c.name} ${id} not found`);
    const t = now();
    let newId = id;
    if (!id) newId = host.db.exec(`INSERT INTO ${table(c)} (data, created, updated) VALUES ('{}', ?, ?)`, [t, t]).last_id;
    try {
      const data = old ? { ...old } : {};
      delete data.id; delete data.created; delete data.updated;
      for (const f of c.fields) {
        if (!(f.name in args)) continue;
        const v = value(c, newId, f, args[f.name]);
        if (v === null || (Array.isArray(v) && !v.length)) delete data[f.name]; else data[f.name] = v;
      }
      for (const f of c.fields) if (f.required && (data[f.name] === undefined || data[f.name] === "")) throw new Error(`${f.title || f.name} is needed`);
      host.db.exec(`UPDATE ${table(c)} SET data = ?, updated = ? WHERE id = ?`, [JSON.stringify(data), t, newId]);
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
  function remove(c, id) {
    const it = get(c, id);
    if (!it) throw new Error(`${c.name} ${id} not found`);
    host.db.exec(`DELETE FROM ${table(c)} WHERE id = ?`, [Number(id)]);
    // Its own files go too; a file another item still shows is kept.
    for (const name of filesOf(c, it)) if (name.startsWith(`${c.name}-${it.id}-`)) host.files.remove(name);
    return { deleted: Number(id) };
  }

  // ---------- operations (the page's `call` and the client's tools) ----------
  function op(name, args, who) {
    setup();
    const m = /^([a-z][a-z0-9_]*)_(list|get|add|update|delete)$/.exec(name || "");
    const c = m && coll(m[1]);
    if (!c) {
      const a = actions.find((x) => x.name === name);
      if (a) return startAction(a, Number(args.id ?? args.item), who);
      throw new Error(`no operation '${name}'`);
    }
    const need = { list: "read", get: "read", add: "add", update: "change", delete: "delete" }[m[2]];
    if (who === "visitor" && !(c.public || []).includes(need)) throw new Error("This isn't open to visitors.");
    switch (m[2]) {
      case "list": return list(c, args);
      case "get": { const it = get(c, args.id); if (!it) throw new Error(`${c.name} ${args.id} not found`); return it; }
      case "add": return write(c, null, args);
      case "update": { const { id, ...rest } = args; return write(c, Number(id), rest); }
      case "delete": return remove(c, args.id);
    }
  }

  // ---------- AI actions ----------
  const pointing = (c, other) => other.fields.find((f) => (f.type === "ref" || f.type === "refs") && f.ref === c.name);
  function startAction(a, id, who) {
    setup();
    if (who === "visitor" && !a.public) throw new Error("This isn't open to visitors.");
    const c = coll(a.on), it = get(c, id);
    if (!it) throw new Error(`${c.name} ${id} not found`);
    const related = {}, files = filesOf(c, it);
    for (const name of a.include || []) {
      const o = coll(name), f = pointing(c, o);
      related[name] = list(o, { [f.name]: id, limit: 200 }).items;
      for (const x of related[name]) files.push(...filesOf(o, x));
    }
    const { run } = host.ai.run({ task: a.task(it, related), schema: a.schema, data: { item: it, related }, files: [...new Set(files)].slice(0, 20), tag: { action: a.name, coll: c.name, item: id } });
    host.db.exec("INSERT INTO _runs (run, action, coll, item, state, started) VALUES (?, ?, ?, ?, 'waiting', ?)", [run, a.name, c.name, id, now()]);
    return { run, state: "waiting" };
  }
  function onAiResult(r) {
    setup();
    const tag = r.tag || {};
    const a = actions.find((x) => x.name === tag.action), c = coll(tag.coll);
    const end = (state, error) => host.db.exec("UPDATE _runs SET state = ?, error = ?, finished = ? WHERE run = ?", [state, error || null, now(), r.run]);
    if (!a || !c) return end("failed", "the action is gone");
    if (r.state !== "done") return end("failed", r.error);
    try {
      host.db.transaction(() => {
        const it = get(c, tag.item);
        if (!it) throw new Error("the item was deleted");
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
    return host.db.query("SELECT * FROM _runs WHERE coll = ? AND item = ? ORDER BY started DESC LIMIT 5", [collName, Number(item)]);
  }

  // ---------- the page's API ----------
  function meta(who) {
    const visitor = who === "visitor";
    return {
      name: spec.name || host.app.name, look: spec.look || {}, enabled: true, public: visitor,
      collections: colls.filter((c) => !visitor || (c.public || []).length),
      actions: actions.filter((a) => !visitor || a.public).map((a) => ({ name: a.name, title: a.title, on: a.on, runnable: true })),
    };
  }
  // A plain-text answer with an HTTP status (the gateway's "$response"; anything else is sent as JSON).
  const reply = (status, body) => ({ $response: { status, body, headers: { "content-type": "text/plain; charset=utf-8" } } });
  function handle(req) {
    setup();
    const who = req.who, path = req.path.replace(/^\/+/, "");
    const body = () => { try { return req.body ? JSON.parse(req.body) : {}; } catch { throw new Error("the body must be JSON"); } };
    try {
      if (req.method === "GET" && path === "meta") return meta(who);
      if (req.method === "POST" && path === "call") { const b = body(); return op(b.op, b.arguments || {}, who); }
      if (req.method === "POST" && path === "action") {
        const b = body(), a = actions.find((x) => x.name === b.action);
        if (!a) return reply(404, "no such action");
        return startAction(a, Number(b.item), who);
      }
      if (req.method === "GET" && path === "runs") {
        const c = coll(req.query.collection);
        if (!c || (who === "visitor" && !actions.some((a) => a.on === c.name && a.public))) return reply(403, "This isn't open to visitors.");
        return runs(c.name, req.query.item);
      }
      if (req.method === "GET" && path.startsWith("files/")) {
        const name = decodeURIComponent(path.slice(6));
        const c = coll(name.split("-")[0]);
        if (!c || (who === "visitor" && !(c.public || []).includes("read"))) return reply(404, "no such file");
        return { $response: { file: name } };
      }
      if (spec.handle) { const r = spec.handle(req, { op, get: (n, id) => get(coll(n), id) }); if (r !== undefined) return r; }
      return reply(404, "not found");
    } catch (e) {
      return reply(e.message === "This isn't open to visitors." ? 403 : 400, e.message);
    }
  }

  return {
    handle,
    callTool: (name, args) => op(name, args || {}, "client"),
    onAiResult,
    onInstall: () => setup(),
    onUpdate: () => setup(),
  };
}
