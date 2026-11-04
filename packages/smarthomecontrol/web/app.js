// SmartHomeControl's page: rooms and devices from its program (api/state), live changes from host.push
// (EventSource "events"), commands through api/call. No inline scripts (the gateway's CSP).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KIND_NAMES = { light: "Lights", switch: "Switches", input_boolean: "Toggles", fan: "Fans", climate: "Air-con / heating", cover: "Curtains / covers",
    media_player: "TV / media", vacuum: "Vacuums", humidifier: "Humidifiers", lock: "Locks", water_heater: "Water heaters", select: "Options",
    number: "Numbers", button: "Buttons", scene: "Scenes", sensor: "Sensors", binary_sensor: "Detectors", weather: "Weather",
    camera: "Cameras", image: "Pictures", event: "Events (doorbells, buttons)" };
  // A camera's picture is read again this often while it is on the screen (and the page is open).
  const SNAP_EVERY_MS = 3000;
  const ON = ["on", "open", "opening", "playing", "cleaning", "unlocked", "heat", "cool", "heat_cool", "auto", "dry", "fan_only"];

  let devices = new Map();
  let pending = new Set();

  async function api(path, body) {
    const r = await fetch("api/" + path, body === undefined ? { headers: { "x-botgateway": "1" } }
      : { method: "POST", headers: { "x-botgateway": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error(t || r.statusText);
    return t ? JSON.parse(t) : null;
  }

  function toast(msg, bad) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (bad ? " bad" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add("hidden"), bad ? 6000 : 2500);
  }

  function showConn(c) {
    const el = $("conn");
    el.textContent = c === "live" ? "● live" : c;
    el.className = "conn " + (c === "live" ? "ok" : c === "connecting" || c === "reconnecting" ? "wait" : "bad");
  }

  // --- one part of a device -------------------------------------------------------------------------------------

  const fmt = (d) => {
    const u = d.attrs.unit_of_measurement;
    if (d.kind === "climate") return `${d.state}${d.attrs.current_temperature !== undefined ? ` · ${d.attrs.current_temperature}°` : ""}`;
    if (d.kind === "cover" && d.attrs.current_position !== undefined) return `${d.state} · ${d.attrs.current_position}%`;
    if (d.kind === "light" && d.state === "on" && d.attrs.brightness !== undefined) return `on · ${Math.round(d.attrs.brightness / 2.55)}%`;
    if (d.kind === "event") return isNaN(Date.parse(d.state)) ? d.state : `last: ${new Date(d.state).toLocaleString()}${d.attrs.event_type ? " · " + d.attrs.event_type : ""}`;
    return `${d.state}${u ? " " + u : ""}`;
  };
  // Only what the device supports (its program says which actions: d.actions).
  let can = new Set();
  const btn = (action, label, extra = "") => action.startsWith("temp_") || can.has(action) ? `<button type="button" data-act="${action}" ${extra}>${esc(label)}</button>` : "";
  const slider = (action, v, lo, hi, step = 1) => !can.has(action) ? "" :
    `<input type="range" data-act="${action}" min="${lo}" max="${hi}" step="${step}" value="${esc(v ?? lo)}"><span class="val">${esc(v ?? "")}</span>`;
  const choose = (action, list, v) => !can.has(action) ? "" : `<select data-act="${action}">${(list || []).map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;

  function controls(d) {
    can = new Set(d.actions);
    const a = d.attrs, on = d.state === "on";
    const toggle = can.has("turn_on") ? btn(on ? "turn_off" : "turn_on", on ? "Turn off" : "Turn on", `class="${on ? "primary" : ""}"`) : "";
    switch (d.kind) {
      case "light": {
        const dim = (a.supported_color_modes || []).some((m) => m !== "onoff");
        const ct = (a.supported_color_modes || []).includes("color_temp") && a.min_color_temp_kelvin;
        return toggle + (dim ? `<div class="row">☀ ${slider("brightness", a.brightness !== undefined ? Math.round(a.brightness / 2.55) : 0, 0, 100)}</div>` : "")
          + (ct ? `<div class="row">K ${slider("color_temp", a.color_temp_kelvin ?? a.min_color_temp_kelvin, a.min_color_temp_kelvin, a.max_color_temp_kelvin, 50)}</div>` : "");
      }
      case "fan":
        return toggle + (a.percentage !== undefined ? `<div class="row">⟳ ${slider("speed", a.percentage, 0, 100)}</div>` : "");
      case "climate":
        return `<div class="row">${choose("hvac_mode", a.hvac_modes, d.state)}</div>`
          + (a.temperature !== undefined && a.temperature !== null && can.has("temperature") ? `<div class="row">${btn("temp_down", "−")}<b class="temp">${esc(a.temperature)}°</b>${btn("temp_up", "+")}</div>` : "")
          + (a.fan_modes ? `<div class="row">fan ${choose("fan_mode", a.fan_modes, a.fan_mode)}</div>` : "");
      case "cover":
        return `<div class="row">${btn("open", "Open")}${btn("stop", "Stop")}${btn("close", "Close")}</div>`
          + (a.current_position !== undefined ? `<div class="row">${slider("position", a.current_position, 0, 100)}</div>` : "");
      case "media_player":
        return toggle + (d.state !== "off" ? btn("play_pause", "⏯") : "")
          + (a.volume_level !== undefined ? `<div class="row">🔊 ${slider("volume", Math.round(a.volume_level * 100), 0, 100)}</div>` : "");
      case "vacuum":
        return `<div class="row">${btn("start", "Start")}${btn("pause", "Pause")}${btn("return_to_base", "Dock")}</div>`;
      case "humidifier":
        return toggle + (a.humidity !== undefined ? `<div class="row">💧 ${slider("humidity", a.humidity, a.min_humidity ?? 0, a.max_humidity ?? 100)}</div>` : "");
      case "lock":
        return d.state === "locked" ? btn("unlock", "Unlock…", 'class="danger"') : btn("lock", "Lock", 'class="primary"');
      case "water_heater":
        return a.operation_list ? `<div class="row">${choose("mode", a.operation_list, a.operation_mode)}</div>` : "";
      case "select":
        return choose("option", a.options, d.state);
      case "number":
        return `<div class="row">${slider("set", d.state, a.min ?? 0, a.max ?? 100, a.step ?? 1)}</div>`;
      case "button":
        return btn("press", "Press");
      case "scene":
        return btn("activate", "Activate");
      case "camera":
      case "image":
        return `<img class="snap" data-snap="${esc(d.id)}" alt="${esc(d.name)}" src="${snapUrl(d.id)}" title="click to enlarge">`;
      default:
        return toggle;
    }
  }

  const snapUrl = (id) => `api/snapshot?id=${encodeURIComponent(id)}&t=${Date.now()}`;

  // One entity (what Home Assistant switches or reads) inside a device's panel: its state, controls and the
  // assistant's access.
  function ent(d) {
    // High risk: "may control" stays in the list, greyed, with the reason (it never just disappears).
    const why = HIGH_RISK_KIND(d.kind) ? "never for locks / water heaters" : "untick high risk first";
    const ai = $("showAi").checked ? `<div class="ai">Assistant: <select data-ai="1">
        <option value="off" ${d.ai === "off" ? "selected" : ""}>no access</option>
        <option value="read" ${d.ai === "read" ? "selected" : ""}>may read</option>
        <option value="control" ${d.ai === "control" ? "selected" : ""} ${d.high_risk ? "disabled" : ""}>may control${d.high_risk ? ` (${why})` : ""}</option></select>
        ${HIGH_RISK_KIND(d.kind) ? '<span class="muted">high risk</span>' : `<label class="check"><input type="checkbox" data-risk="1" ${d.high_risk ? "checked" : ""}> high risk</label>`}</div>` : "";
    const busy = pending.has(d.id);
    return `<div class="ent ${ON.includes(d.state) ? "is-on" : ""} ${d.state === "unavailable" ? "off-line" : ""}" id="e-${esc(d.id)}" data-id="${esc(d.id)}">
      <div class="head"><span class="name" title="${esc(d.id)}">${esc(short(d))}</span>${d.ai !== "off" ? `<span class="badge" title="the assistant ${d.ai === "control" ? "may control" : "may read"} it">🤖${d.ai === "control" ? "" : "👁"}</span>` : ""}
        <span class="state">${busy ? "…" : esc(fmt(d))}</span></div>
      ${d.state === "unavailable" ? "" : `<div class="ctl">${controls(d)}</div>`}${ai}</div>`;
  }
  const HIGH_RISK_KIND = (k) => k === "lock" || k === "water_heater";
  // Home Assistant names an entity "<device> <what>": inside the device's panel the device's name is left out.
  const short = (d) => d.device && d.name.startsWith(d.device + " ") ? d.name.slice(d.device.length + 1) : d.name;
  const PICTURE = (k) => k === "camera" || k === "image";

  // --- devices: an entity's device (Home Assistant's device; an entity without one is its own) -------------

  const keyOf = (d) => `${d.room || "No room"}|${d.device || d.id}`;
  function groups() {
    const g = new Map();
    for (const d of devices.values()) {
      const k = keyOf(d);
      if (!g.has(k)) g.set(k, { key: k, room: d.room || "No room", name: d.device || d.name, ents: [] });
      g.get(k).ents.push(d);
    }
    for (const x of g.values()) x.ents.sort((a, b) => a.name.localeCompare(b.name));
    return g;
  }
  // The tile shows its main part: the first that switches something, else the first reading.
  const MAIN = ["light", "climate", "media_player", "cover", "fan", "vacuum", "humidifier", "lock", "water_heater", "switch",
    "input_boolean", "camera", "event", "sensor", "binary_sensor"];
  const rank = (d) => { const i = MAIN.indexOf(d.kind); return i < 0 ? MAIN.length : i; };
  const mainOf = (g) => [...g.ents].sort((a, b) => rank(a) - rank(b))[0];
  const ICON = { light: "💡", switch: "🔌", input_boolean: "🔘", fan: "🌀", climate: "❄️", cover: "🪟", media_player: "📺", vacuum: "🧹",
    humidifier: "💧", lock: "🔒", water_heater: "♨️", select: "☰", number: "🔢", button: "⏺", scene: "🎬", sensor: "📈",
    binary_sensor: "📍", weather: "⛅", camera: "📷", image: "🖼", event: "🔔" };

  function tile(g, withRoom) {
    const m = mainOf(g), off = g.ents.every((d) => d.state === "unavailable"), ai = g.ents.some((d) => d.ai !== "off");
    return `<button type="button" class="tile ${ON.includes(m.state) ? "is-on" : ""} ${off ? "off-line" : ""}" data-key="${esc(g.key)}">
      <span class="ticon">${ICON[m.kind] || "•"}</span>
      <span class="tname">${esc(g.name)}${ai ? ' <span class="badge" title="the assistant may see some of it">🤖</span>' : ""}</span>
      <span class="state">${off ? "unavailable" : esc(fmt(m))}</span>
      <span class="muted tmore">${withRoom ? esc(g.room) + " · " : ""}${g.ents.length} ${g.ents.length === 1 ? "part" : "parts"}</span></button>`;
  }

  // --- the page: pictures on top, a tab per room, the room's devices; a device opens its panel ---------------

  let room = "";
  try { room = localStorage.getItem("shc.room") || ""; } catch { }
  let open = null;

  function render() {
    const all = groups(), q = $("search").value.trim().toLowerCase(), kind = $("kind").value;
    // Pictures: every camera / picture.
    const pics = [...devices.values()].filter((d) => PICTURE(d.kind) && d.state !== "unavailable").sort((a, b) => a.name.localeCompare(b.name));
    $("cams").classList.toggle("hidden", !pics.length);
    if ($("cams").dataset.ids !== pics.map((d) => d.id).join()) {
      $("cams").dataset.ids = pics.map((d) => d.id).join();
      $("cams").innerHTML = pics.map((d) => `<figure class="cam"><img class="snap" data-snap="${esc(d.id)}" alt="${esc(d.name)}" src="${snapUrl(d.id)}" title="click to enlarge">
        <figcaption>${esc(d.name)} <span class="muted">${esc(d.room)}</span></figcaption></figure>`).join("");
    }
    // Rooms.
    const rooms = new Map();
    for (const g of all.values()) rooms.set(g.room, (rooms.get(g.room) || 0) + 1);
    const names = [...rooms.keys()].sort((a, b) => (a === "No room") - (b === "No room") || a.localeCompare(b));
    if (!rooms.has(room)) room = names[0] || "";
    $("roomtabs").innerHTML = names.map((r) => `<button type="button" class="rtab ${r === room && !q ? "on" : ""}" data-room="${esc(r)}">${esc(r)} <span class="muted">${rooms.get(r)}</span></button>`).join("");
    // Its devices (a search looks in every room).
    const list = [...all.values()].filter((g) => (q ? true : g.room === room)
      && (!kind || g.ents.some((d) => d.kind === kind))
      && (!q || g.ents.some((d) => `${d.name} ${d.id} ${d.room} ${d.device}`.toLowerCase().includes(q))))
      .sort((a, b) => a.name.localeCompare(b.name));
    $("rooms").innerHTML = list.length ? `<div class="tiles">${list.map((g) => tile(g, !!q)).join("")}</div>` : '<p class="muted">No devices match.</p>';
    if (open) sheet();
  }

  // A device's panel: its pictures, what it switches, what it reads.
  function sheet() {
    const g = groups().get(open), box = $("sheet");
    if (!g) { closeSheet(); return; }
    const pics = g.ents.filter((d) => PICTURE(d.kind)), rest = g.ents.filter((d) => !PICTURE(d.kind));
    const acts = rest.filter((d) => d.actions.length), data = rest.filter((d) => !d.actions.length);
    const part = (title, ds) => ds.length ? `<h3>${title}</h3><div class="ents">${ds.map(ent).join("")}</div>` : "";
    box.innerHTML = `<div class="sheetbox"><div class="bighead"><b>${esc(g.name)}</b> <span class="muted">${esc(g.room)}</span>
      <button type="button" id="sheetClose">Close</button></div>
      ${part("Pictures", pics)}${part("Controls", acts)}${part("Readings", data)}</div>`;
    box.classList.remove("hidden");
  }
  function closeSheet() { open = null; $("sheet").classList.add("hidden"); $("sheet").innerHTML = ""; }

  function update(d) {
    if (d.gone) { devices.delete(d.id); render(); return; }
    const before = devices.get(d.id);
    devices.set(d.id, d);
    if (!before || keyOf(before) !== keyOf(d) || (PICTURE(d.kind) && (before.state === "unavailable") !== (d.state === "unavailable"))) { render(); return; }
    const t = document.querySelector(`.tile[data-key="${CSS.escape(keyOf(d))}"]`);
    if (t) t.outerHTML = tile(groups().get(keyOf(d)), !!$("search").value.trim());
    const el = document.getElementById("e-" + d.id);
    // Not while the owner is moving one of its controls.
    if (el && !(el.contains(document.activeElement) && document.activeElement.matches("input[type=range]"))) el.outerHTML = ent(d);
  }

  async function load(path = "state") {
    try {
      const s = path === "state" ? await api("state") : await api(path, {});
      devices = new Map(s.devices.map((d) => [d.id, d]));
      showConn(s.conn);
      $("note").innerHTML = s.note ? `<div class="note">${esc(s.note)}</div>` : "";
      const kinds = [...new Set(s.devices.map((d) => d.kind))].sort();
      const k = $("kind").value;
      $("kind").innerHTML = '<option value="">All kinds</option>' + kinds.map((x) => `<option value="${x}" ${x === k ? "selected" : ""}>${esc(KIND_NAMES[x] || x)}</option>`).join("");
      render();
    } catch (e) {
      showConn("not connected");
      $("rooms").innerHTML = `<div class="note bad">${esc(e.message)}</div>
        <p class="muted">Set Home Assistant's address (e.g. http://192.168.1.20) and a long-lived token in BotGateway → Applications → SmartHomeControl → Config.</p>`;
    }
  }

  async function act(id, action, value) {
    const d = devices.get(id);
    if (!d) return;
    if (action === "temp_up" || action === "temp_down") {
      const step = d.attrs.target_temp_step || 0.5;
      value = Math.round((Number(d.attrs.temperature) + (action === "temp_up" ? step : -step)) * 10) / 10;
      action = "temperature";
    }
    if (action === "unlock" && !confirm(`Unlock ${d.name}?`)) return;
    pending.add(id);
    update(d);
    try {
      const r = await api("call", { id, action, value });
      pending.delete(id);
      if (r.state) update(r.state); else update(d);
      toast(`${d.name}: ${r.result}`);
    } catch (e) {
      pending.delete(id);
      update(d);
      toast(`${d.name}: ${e.message}`, true);
    }
  }

  // Pictures: the ones on the screen are read again every few seconds (the new one replaces the old when it
  // has arrived, so nothing flickers); a click shows it big.
  function refreshSnaps() {
    if (document.hidden) return;
    for (const img of document.querySelectorAll("img[data-snap]")) {
      const r = img.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight || img.dataset.loading) continue;
      img.dataset.loading = "1";
      const next = new Image();
      next.onload = () => { img.src = next.src; delete img.dataset.loading; img.classList.remove("nopic"); };
      next.onerror = () => { delete img.dataset.loading; img.classList.add("nopic"); };
      next.src = snapUrl(img.dataset.snap);
    }
  }
  setInterval(refreshSnaps, SNAP_EVERY_MS);

  function bigPicture(id, title, note = "") {
    const box = $("big");
    box.innerHTML = `<div class="bigbox"><div class="bighead"><b>${esc(title)}</b> <span class="muted">${esc(note)}</span>
      <button type="button" id="bigClose">Close</button></div><img data-snap="${esc(id)}" src="${snapUrl(id)}" alt=""></div>`;
    box.classList.remove("hidden");
  }

  document.addEventListener("click", (e) => {
    if (e.target.id === "bigClose" || e.target.id === "big") { $("big").classList.add("hidden"); $("big").innerHTML = ""; return; }
    if (e.target.id === "sheetClose" || e.target.id === "sheet") { closeSheet(); return; }
    const pic = e.target.closest("img.snap[data-snap]");
    if (pic) { const d = devices.get(pic.dataset.snap); bigPicture(pic.dataset.snap, d ? d.name : pic.dataset.snap); return; }
    const b = e.target.closest("button[data-act]");
    if (b) { act(b.closest(".ent").dataset.id, b.dataset.act); return; }
    const tl = e.target.closest(".tile");
    if (tl) { open = tl.dataset.key; sheet(); return; }
    const rt = e.target.closest(".rtab");
    if (rt) {
      room = rt.dataset.room;
      try { localStorage.setItem("shc.room", room); } catch { }
      $("search").value = "";
      render();
      return;
    }
    const t = e.target.closest(".tab");
    if (t) {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === t));
      $("home").classList.toggle("hidden", t.dataset.tab !== "home");
      $("history").classList.toggle("hidden", t.dataset.tab !== "history");
      if (t.dataset.tab === "history") history();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("big").classList.contains("hidden")) { $("big").classList.add("hidden"); $("big").innerHTML = ""; } else if (open) closeSheet();
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("input[type=range]")) e.target.nextElementSibling.textContent = e.target.value;
  });
  document.addEventListener("change", async (e) => {
    const el = e.target, c = el.closest(".ent");
    if (c && el.dataset.act) return act(c.dataset.id, el.dataset.act, el.type === "range" ? Number(el.value) : el.value);
    if (c && (el.dataset.ai || el.dataset.risk)) {
      const ai = c.querySelector("[data-ai]").value, risk = c.querySelector("[data-risk]");
      try {
        const d = await api("access", { id: c.dataset.id, ai, high_risk: risk ? risk.checked : false });
        update(d);
        const said = { off: "no access", read: "may read", control: "may control" }[d.ai];
        toast(`${d.name || d.id}: assistant ${said}${d.high_risk ? " · high risk" : ""} ✓ saved`);
      } catch (err) { toast(err.message, true); }
    }
  });
  $("search").addEventListener("input", render);
  $("kind").addEventListener("change", render);
  $("showAi").addEventListener("change", render);
  $("reload").addEventListener("click", () => load("reload"));

  async function history() {
    try {
      const rows = await api("history");
      $("hist").innerHTML = rows.length ? `<table><tr><th>When</th><th>Who</th><th>Device</th><th>Action</th><th>Result</th></tr>
        ${rows.map((r) => `<tr class="${r.ok ? "" : "bad"}"><td>${esc(new Date(r.at).toLocaleString())}</td><td>${esc(r.who)}</td>
          <td>${esc(devices.get(r.entity_id)?.name || r.entity_id)}</td><td>${esc(r.action)}${r.value !== null ? " " + esc(r.value) : ""}</td><td>${esc(r.result)}</td></tr>`).join("")}</table>`
        : '<p class="muted">Nothing done yet.</p>';
    } catch (e) { $("hist").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
  }

  // Live: the program's pushes. After a break (or a "resync") everything is read again.
  const events = new EventSource("events");
  let broken = false;
  events.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "state") update(m.entity);
    else if (m.type === "conn") showConn(m.conn);
    else if (m.type === "resync") load();
    else if (m.type === "ring") {
      toast(`🔔 ${m.name}`);
      const cam = m.camera && devices.get(m.camera);
      bigPicture(m.camera || "", `🔔 ${m.name}`, `${new Date(m.at).toLocaleTimeString()}${cam ? " · " + cam.name : " · no camera found for it"}`);
      if (!m.camera) $("big").querySelector("img").remove();
    }
  };
  events.addEventListener("resync", () => load());
  events.onerror = () => { broken = true; };
  events.onopen = () => { if (broken) { broken = false; load(); } };

  load();
})();
