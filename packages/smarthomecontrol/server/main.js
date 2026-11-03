// SmartHomeControl: its program in the gateway's sandbox (app_smarthomecontrol_requirements.txt). Everything about
// Home Assistant is here; the gateway only lends the owner's Home Assistant (host.local / host.localWs, its
// token added by the gateway) and the push to the open page (host.push).
//
// Live state: one WebSocket to Home Assistant (auth, then subscribe to state_changed); every change updates
// the devices kept in memory and goes to the page. The page loads everything once (GET api/state) and again
// after a "resync".

const HISTORY_KEEP = 2000;
// Rooms and device names are read again after this long (they rarely change).
const META_EVERY_MS = 10 * 60 * 1000;

// --- what each kind of device can do ---------------------------------------------------------------

const num = (v, lo, hi, what) => {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n) || n < lo || n > hi) throw new Error(`${what}: a number from ${lo} to ${hi}`);
  return n;
};
const oneOf = (v, list, what) => {
  if (!Array.isArray(list) || !list.includes(v)) throw new Error(`${what}: one of ${JSON.stringify(list || [])}`);
  return v;
};
const onOff = (domain) => ({ turn_on: () => [domain, "turn_on", {}], turn_off: () => [domain, "turn_off", {}] });

// action -> (value, attributes) => [domain, service, data]. A kind not here is shown read-only.
const ACTIONS = {
  light: {
    ...onOff("light"),
    brightness: (v) => ["light", "turn_on", { brightness_pct: num(v, 0, 100, "brightness") }],
    color_temp: (v, a) => ["light", "turn_on", { color_temp_kelvin: num(v, a.min_color_temp_kelvin ?? 2000, a.max_color_temp_kelvin ?? 6500, "colour temperature") }],
  },
  switch: onOff("switch"),
  input_boolean: onOff("input_boolean"),
  fan: { ...onOff("fan"), speed: (v) => ["fan", "set_percentage", { percentage: num(v, 0, 100, "speed") }] },
  climate: {
    ...onOff("climate"),
    hvac_mode: (v, a) => ["climate", "set_hvac_mode", { hvac_mode: oneOf(v, a.hvac_modes, "mode") }],
    temperature: (v, a) => ["climate", "set_temperature", { temperature: num(v, a.min_temp ?? 7, a.max_temp ?? 35, "temperature") }],
    fan_mode: (v, a) => ["climate", "set_fan_mode", { fan_mode: oneOf(v, a.fan_modes, "fan mode") }],
  },
  cover: {
    open: () => ["cover", "open_cover", {}],
    close: () => ["cover", "close_cover", {}],
    stop: () => ["cover", "stop_cover", {}],
    position: (v) => ["cover", "set_cover_position", { position: num(v, 0, 100, "position") }],
  },
  media_player: {
    ...onOff("media_player"),
    volume: (v) => ["media_player", "volume_set", { volume_level: num(v, 0, 100, "volume") / 100 }],
    play_pause: () => ["media_player", "media_play_pause", {}],
  },
  vacuum: { start: () => ["vacuum", "start", {}], pause: () => ["vacuum", "pause", {}], return_to_base: () => ["vacuum", "return_to_base", {}] },
  humidifier: { ...onOff("humidifier"), humidity: (v, a) => ["humidifier", "set_humidity", { humidity: num(v, a.min_humidity ?? 0, a.max_humidity ?? 100, "humidity") }] },
  lock: { lock: () => ["lock", "lock", {}], unlock: () => ["lock", "unlock", {}] },
  water_heater: {
    temperature: (v, a) => ["water_heater", "set_temperature", { temperature: num(v, a.min_temp ?? 30, a.max_temp ?? 75, "temperature") }],
    mode: (v, a) => ["water_heater", "set_operation_mode", { operation_mode: oneOf(v, a.operation_list, "mode") }],
  },
  select: { option: (v, a) => ["select", "select_option", { option: oneOf(v, a.options, "option") }] },
  number: { set: (v, a) => ["number", "set_value", { value: num(v, a.min ?? 0, a.max ?? 100, "value") }] },
  button: { press: () => ["button", "press", {}] },
  scene: { activate: () => ["scene", "turn_on", {}] },
};
// Cameras and images: their picture through api/snapshot. Events: e.g. a doorbell's ring.
// What a device says it supports (Home Assistant's supported_features bits): an action whose bit is missing is
// not offered (e.g. a monitor that can't be switched on remotely). Kinds / actions not listed are always offered.
const FEATURES = {
  media_player: { play_pause: 1 | 16384, volume: 4, turn_on: 128, turn_off: 256 },
  cover: { open: 1, close: 2, position: 4, stop: 8 },
  fan: { speed: 1, turn_on: 32, turn_off: 16 },
  climate: { temperature: 1, fan_mode: 8, turn_off: 128, turn_on: 256 },
  vacuum: { pause: 4, return_to_base: 16, start: 8192 },
};
function supported(id, attrs) {
  const all = Object.keys(ACTIONS[kindOf(id)] || {});
  const bits = attrs?.supported_features, need = FEATURES[kindOf(id)];
  if (typeof bits !== "number" || !need) return all;
  return all.filter((a) => need[a] === undefined || (bits & need[a]) !== 0);
}

const READ_ONLY = ["sensor", "binary_sensor", "weather", "camera", "image", "event"];
const PICTURE = { camera: "/api/camera_proxy/", image: "/api/image_proxy/" };
const SHOWN = new Set([...Object.keys(ACTIONS), ...READ_ONLY]);
// Never switched by the assistant (it may read them at most); the owner can mark more on the page.
const HIGH_RISK = new Set(["lock", "water_heater"]);
// Attributes the page needs (the rest stays in Home Assistant; home_state gives all).
const KEEP = ["unit_of_measurement", "device_class", "brightness", "color_temp_kelvin", "min_color_temp_kelvin", "max_color_temp_kelvin",
  "supported_color_modes", "percentage", "hvac_modes", "hvac_action", "fan_modes", "fan_mode", "temperature", "current_temperature",
  "min_temp", "max_temp", "target_temp_step", "current_position", "volume_level", "media_title", "options", "min", "max", "step",
  "humidity", "current_humidity", "min_humidity", "max_humidity", "operation_list", "operation_mode", "battery_level", "event_type"];

const kindOf = (id) => id.split(".")[0];

// --- Home Assistant over HTTP -----------------------------------------------------------------------

function ha(method, path, body) {
  const r = host.local("home", { method, path, body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "Content-Type": "application/json" } });
  if (r.status === 401) throw new Error("Home Assistant refused the token - set a new one in the application's Config");
  if (r.status === 403) throw new Error("the Home Assistant user of this token may not do that (it needs an administrator for rooms)");
  if (r.status >= 400) throw new Error(`Home Assistant: ${r.status} ${String(r.body).slice(0, 300)}`);
  return r.body;
}

// --- what is kept in memory --------------------------------------------------------------------------

let states = null;      // entity id -> Home Assistant state object
let meta = new Map();   // entity id -> { room, device }
let metaAt = 0;
let metaNote = "";
let ws = null;          // the WebSocket's number (the gateway reconnects it by itself)
let conn = "not connected";
let nextMsg = 1;
let resync = false;

function loadStates() {
  const all = JSON.parse(ha("GET", "/api/states"));
  states = new Map(all.filter((s) => SHOWN.has(kindOf(s.entity_id))).map((s) => [s.entity_id, s]));
}

// Rooms (Home Assistant areas) and device names: one template (needs an administrator's token).
const META_TEMPLATE = `[{% for s in states %}{{ {"e": s.entity_id, "a": area_name(s.entity_id), "d": device_attr(s.entity_id, "name_by_user") or device_attr(s.entity_id, "name")} | tojson }}{{ "," if not loop.last }}{% endfor %}]`;

function loadMeta() {
  metaAt = Date.now();
  try {
    const rows = JSON.parse(ha("POST", "/api/template", { template: META_TEMPLATE }));
    meta = new Map(rows.map((r) => [r.e, { room: r.a || "", device: r.d || "" }]));
    metaNote = "";
  } catch (e) {
    metaNote = `Rooms could not be read (${e.message}) - all devices are under "No room".`;
    console.warn(metaNote);
  }
}

// Called by every entry: loads what is missing and keeps the live connection asked for.
function ensure() {
  if (!states || conn !== "live") loadStates();
  if (Date.now() - metaAt > META_EVERY_MS) loadMeta();
  if (ws === null) {
    try {
      ws = host.localWs.open("home", { path: "/api/websocket" });
      conn = "connecting";
    } catch (e) {
      conn = e.message;
    }
  }
}

function send(msg) {
  if (resync) {
    try { host.push({ type: "resync" }); resync = false; } catch { return; }
  }
  try { host.push(msg); } catch { resync = true; }
}

export function onLocal(e) {
  if (e.type === "open") {
    conn = "connecting";
    return;
  }
  if (e.type === "closed") {
    conn = "reconnecting";
    send({ type: "conn", conn });
    return;
  }
  let m;
  try { m = JSON.parse(e.data); } catch { return; }
  if (m.type === "auth_required") {
    host.localWs.send(e.ws, { type: "auth", access_token: "{{secret}}" });
  } else if (m.type === "auth_ok") {
    host.localWs.send(e.ws, { id: nextMsg++, type: "subscribe_events", event_type: "state_changed" });
    conn = "live";
    // Changes made while it was closed: read everything once.
    try { loadStates(); } catch (err) { console.warn(err.message); }
    send({ type: "resync" });
  } else if (m.type === "auth_invalid") {
    conn = "Home Assistant refused the token - set a new one in the application's Config";
    send({ type: "conn", conn });
  } else if (m.type === "event" && m.event?.event_type === "state_changed") {
    const { entity_id: id, new_state: s } = m.event.data || {};
    if (!id || !SHOWN.has(kindOf(id)) || !states) return;
    const before = states.get(id);
    if (s) states.set(id, s); else states.delete(id);
    send({ type: "state", entity: s ? view(id) : { id, gone: true } });
    if (s && before && isRing(s, before)) ring(id);
  }
}

// A doorbell: an event entity of class "doorbell" (or one whose event type says ring / press) that just fired.
function isRing(s, before) {
  if (kindOf(s.entity_id) !== "event" || s.state === before.state || s.state === "unavailable") return false;
  const a = s.attributes || {};
  return a.device_class === "doorbell" || /ring|doorbell|press/i.test(String(a.event_type || ""));
}

// The camera that belongs with it: the same device, else the same room, else none.
function cameraFor(id) {
  const m = meta.get(id) || {};
  const cams = [...states.keys()].filter((e) => kindOf(e) === "camera");
  return cams.find((c) => m.device && meta.get(c)?.device === m.device) || cams.find((c) => m.room && meta.get(c)?.room === m.room) || null;
}

function ring(id) {
  const name = states.get(id)?.attributes?.friendly_name || id;
  remember("doorbell", id, "ring", null, "rang", true);
  send({ type: "ring", id, name, camera: cameraFor(id), at: new Date().toISOString() });
}

// --- the assistant's access and the history (the program's database) --------------------------------

function setup() {
  host.db.script(`
    CREATE TABLE IF NOT EXISTS access (entity_id TEXT PRIMARY KEY, ai TEXT NOT NULL DEFAULT 'off', high_risk INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, at TEXT NOT NULL, who TEXT NOT NULL, entity_id TEXT NOT NULL,
      action TEXT NOT NULL, value TEXT, result TEXT NOT NULL, ok INTEGER NOT NULL);
  `);
}
export function onInstall() { setup(); }
export function onUpdate() { setup(); }

function accessMap() {
  return new Map(host.db.query("SELECT entity_id, ai, high_risk FROM access").map((r) => [r.entity_id, r]));
}
const highRisk = (id, row) => HIGH_RISK.has(kindOf(id)) || !!row?.high_risk;
const aiOf = (id, row) => {
  const ai = row?.ai || "off";
  return ai === "control" && highRisk(id, row) ? "read" : ai;
};

function remember(who, id, action, value, result, ok) {
  host.db.exec("INSERT INTO history (at, who, entity_id, action, value, result, ok) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [new Date().toISOString(), who, id, action, value === undefined || value === null ? null : String(value), String(result).slice(0, 500), ok ? 1 : 0]);
  host.db.exec("DELETE FROM history WHERE id <= (SELECT MAX(id) FROM history) - ?", [HISTORY_KEEP]);
}

// --- views ---------------------------------------------------------------------------------------------

function view(id, access = accessMap()) {
  const s = states.get(id);
  const a = s.attributes || {};
  const m = meta.get(id) || {};
  const attrs = {};
  for (const k of KEEP) if (a[k] !== undefined) attrs[k] = a[k];
  const row = access.get(id);
  return {
    id, kind: kindOf(id), name: a.friendly_name || id, state: s.state, attrs, changed: s.last_changed,
    room: m.room || "", device: m.device || "", actions: supported(id, a),
    ai: aiOf(id, row), high_risk: highRisk(id, row),
  };
}

function all() {
  const access = accessMap();
  return [...states.keys()].map((id) => view(id, access));
}

// --- doing something -----------------------------------------------------------------------------------

function run(id, action, value, who) {
  let s = states?.get(id);
  if (!s) {
    s = JSON.parse(ha("GET", `/api/states/${encodeURIComponent(id)}`));
    if (!SHOWN.has(kindOf(id))) throw new Error(`${id}: this kind of device is not shown here`);
  }
  const kind = kindOf(id);
  const table = ACTIONS[kind] || {};
  const can = supported(id, s.attributes);
  const make = can.includes(action) ? table[action] : null;
  if (!make) {
    throw new Error(`${id} can ${can.length ? "do: " + can.join(", ") : "only be read"} (not "${action}")`);
  }
  const [domain, service, data] = make(value, s.attributes || {});
  let result, ok = false;
  try {
    const changed = JSON.parse(ha("POST", `/api/services/${domain}/${service}`, { entity_id: id, ...data }) || "[]");
    const after = Array.isArray(changed) ? changed.find((c) => c.entity_id === id) : null;
    if (after && states) states.set(id, after);
    // Home Assistant's own answer: the state right after (a slow device may change a little later - the page
    // shows that when it comes).
    result = after ? `done - now ${after.state}` : "sent - state not confirmed yet";
    ok = true;
  } catch (e) {
    result = e.message;
  }
  remember(who, id, action, value, result, ok);
  if (!ok) throw new Error(result);
  return { id, action, value: value ?? null, result, state: states?.has(id) ? view(id) : null };
}

// A camera's (or image entity's) picture now: {type, data (base64)}.
function picture(id) {
  const r = host.local("home", { method: "GET", path: PICTURE[kindOf(id)] + encodeURIComponent(id), encoding: "base64" });
  if (r.status !== 200) throw new Error(`no picture from ${id} (Home Assistant: ${r.status})`);
  const type = String(r.headers["content-type"] || "image/jpeg").split(";")[0].trim();
  return { type: type.startsWith("image/") ? type : "image/jpeg", data: r.body };
}

// --- the page (local page only: the program refuses anyone else) --------------------------------------

export function handle(req) {
  if (req.who !== "owner") return { $response: { status: 403, body: "SmartHomeControl has no website" } };
  try {
    return page(req);
  } catch (e) {
    // The reason only (the page shows it), not the program's stack.
    return { $response: { status: 400, headers: { "content-type": "text/plain; charset=utf-8" }, body: e.message } };
  }
}

function page(req) {
  const body = req.body ? JSON.parse(req.body) : {};
  const path = req.path.replace(/^\/+/, "");
  if (req.method === "GET" && path === "state") {
    ensure();
    return { conn, note: metaNote, devices: all() };
  }
  if (req.method === "GET" && path === "snapshot") {
    // A camera's picture now (or an image entity's): passed to the page as it comes from Home Assistant.
    if (!states) ensure();
    const id = String(req.query?.id || "");
    if (!PICTURE[kindOf(id)] || !states?.has(id)) return { $response: { status: 404, body: "no such camera" } };
    let p;
    try { p = picture(id); } catch (e) { return { $response: { status: 502, body: e.message } }; }
    return { $response: { status: 200, headers: { "content-type": p.type, "cache-control": "no-store" }, body: p.data, encoding: "base64" } };
  }
  if (req.method === "POST" && path === "reload") {
    loadStates();
    loadMeta();
    return { conn, note: metaNote, devices: all() };
  }
  if (req.method === "POST" && path === "call") {
    ensure();
    return run(String(body.id || ""), String(body.action || ""), body.value, "owner");
  }
  if (req.method === "POST" && path === "access") {
    const id = String(body.id || "");
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(id)) throw new Error("bad device id");
    const ai = ["off", "read", "control"].includes(body.ai) ? body.ai : "off";
    host.db.exec("INSERT INTO access (entity_id, ai, high_risk) VALUES (?, ?, ?) ON CONFLICT(entity_id) DO UPDATE SET ai = excluded.ai, high_risk = excluded.high_risk",
      [id, ai, body.high_risk ? 1 : 0]);
    return states?.has(id) ? view(id) : { id, ai, high_risk: !!body.high_risk };
  }
  if (req.method === "GET" && path === "history") {
    return host.db.query("SELECT at, who, entity_id, action, value, result, ok FROM history ORDER BY id DESC LIMIT 300");
  }
  return { $response: { status: 404, body: "no such page" } };
}

// --- the assistant's tools -------------------------------------------------------------------------------

export function callTool(name, args = {}) {
  ensure();
  const access = accessMap();
  const visible = (id) => aiOf(id, access.get(id)) !== "off";
  if (name === "home_list") {
    const room = String(args.room || "").toLowerCase(), kind = String(args.kind || "").toLowerCase();
    const list = [...states.keys()].filter(visible).map((id) => view(id, access))
      .filter((d) => (!room || d.room.toLowerCase().includes(room)) && (!kind || d.kind === kind))
      .map((d) => ({ id: d.id, name: d.name, room: d.room || "No room", device: d.device, kind: d.kind, state: d.state,
        unit: d.attrs.unit_of_measurement, may_control: d.ai === "control", actions: d.ai === "control" ? d.actions : [] }));
    return { devices: list, note: list.length ? undefined : "No devices are shared with the assistant (the owner chooses them on the SmartHomeControl page)." };
  }
  const id = String(args.id || "");
  if (!states.has(id) || !visible(id)) throw new Error(`no device "${id}" the assistant may see (see home_list)`);
  if (name === "home_state") {
    const s = states.get(id);
    return { ...view(id, access), attributes: s.attributes };
  }
  if (name === "home_snapshot") {
    if (!PICTURE[kindOf(id)]) throw new Error(`${id} is not a camera (see home_list: kind camera)`);
    const p = picture(id);
    const ext = { "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[p.type] || "jpg";
    remember("assistant", id, "snapshot", null, "picture sent", true);
    // The gateway turns $attachments into the answer's files (specification 5.2.1).
    return { id, name: states.get(id).attributes?.friendly_name || id, at: new Date().toISOString(),
      $attachments: [{ name: `${id.replace(/[^a-z0-9_]/gi, "_")}.${ext}`, media_type: p.type, data: p.data }] };
  }
  if (name === "home_set") {
    const row = access.get(id);
    if (aiOf(id, row) !== "control") {
      throw new Error(highRisk(id, row) ? `${id} is a high-risk device: the assistant may not control it` : `the owner lets the assistant only read ${id}`);
    }
    const action = String(args.action || "");
    const s = states.get(id);
    // Heating is high-risk too: the assistant can't switch heating on, nor change it while it heats.
    if (kindOf(id) === "climate" && ((action === "hvac_mode" && /heat/.test(String(args.value))) || (/heat/.test(s.state) && action !== "turn_off" && !(action === "hvac_mode" && args.value === "off")))) {
      throw new Error("heating is high-risk: the assistant may not switch it on or change it (it may switch it off)");
    }
    return run(id, action, args.value, "assistant");
  }
  throw new Error(`no tool ${name}`);
}
