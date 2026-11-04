// FamilyHealthRecords' page: members on top, their documents / records / year, the inbox, the members. Talks to
// its program through api/...; photos are made smaller here before they are kept (the sandbox has no image code).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CAT = { bloodTest: "Blood test", doctorReport: "Doctor's report", prescription: "Prescription", imaging: "Imaging", bloodPressure: "Blood pressure",
    weight: "Weight", glucose: "Glucose", vaccination: "Vaccination", food: "Food", other: "Other" };
  const KIND = { lab: "Lab", blood_pressure: "Blood pressure", pulse: "Pulse", weight: "Weight", height: "Height", glucose: "Glucose", temperature: "Temperature",
    medication: "Medication", visit: "Visit", vaccination: "Vaccination", imaging: "Imaging", food: "Food", note: "Note" };
  const STATUS = { uploaded: "kept", reading: "being read…", ready: "ready", needs_check: "please check", failed: "failed" };
  // Values entered by hand: a template per kind.
  const TEMPLATES = {
    blood_pressure: { title: "Blood pressure", unit: "mmHg", fields: [["systolic", "Systolic"], ["diastolic", "Diastolic"], ["pulse", "Pulse"]] },
    weight: { title: "Weight", unit: "kg" }, height: { title: "Height", unit: "cm" }, glucose: { title: "Glucose", unit: "mmol/L" },
    temperature: { title: "Temperature", unit: "°C" }, pulse: { title: "Pulse", unit: "bpm" }, note: { title: "Note", text: true },
  };
  // Photos: the long side at most this (an A4 page at ~185 dpi - printed text stays readable); smaller files are kept as they are.
  const MAX_SIDE = 2160, KEEP_UNDER = 1 << 20, QUALITY = 0.88, MAX_FILE = 10 << 20;

  let st = { members: [], inbox: { files: [] } };
  let who = null, tab = "documents", docs = [], poll = null;
  try { who = Number(localStorage.getItem("fhr.member")) || null; } catch { }

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
    toast.timer = setTimeout(() => t.classList.add("hidden"), bad ? 7000 : 3000);
  }
  const me = () => st.members.find((m) => m.id === who);
  const active = () => st.members.filter((m) => !m.archived);
  const val = (r) => r.extras && r.kind === "blood_pressure" && r.extras.systolic
    ? `${r.extras.systolic}/${r.extras.diastolic ?? "?"}${r.extras.pulse ? ` · pulse ${r.extras.pulse}` : ""} ${r.unit || "mmHg"}`
    : r.value !== null && r.value !== undefined ? `${r.value}${r.unit ? " " + r.unit : ""}` : r.value_text || "";
  const range = (r) => r.ref_low !== null || r.ref_high !== null ? `${r.ref_low ?? ""} – ${r.ref_high ?? ""}` : "";

  // --- photos made smaller ----------------------------------------------------------------------------------

  const base64 = (blob) => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = () => no(f.error); f.readAsDataURL(blob); });
  // -> {name, media_type, data}. PDFs and small photos as they are; bigger photos (and HEIC) as JPEG, the long side
  // at most MAX_SIDE, turned upright; the canvas drops the rest of the EXIF (e.g. the place).
  async function prepare(blob, name, type) {
    type = (type || blob.type || "").toLowerCase();
    const heic = /hei[cf]/.test(type) || /\.hei[cf]$/i.test(name);
    if (type === "application/pdf" || (!heic && /^image\/(jpeg|png|webp|gif)$/.test(type) && blob.size < KEEP_UNDER)) {
      if (blob.size > MAX_FILE) throw new Error(`${name}: larger than 10 MB`);
      return { name, media_type: type, data: await base64(blob) };
    }
    if (!type.startsWith("image/") && !heic) throw new Error(`${name}: PDF or a photo only`);
    let img;
    try { img = await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch {
      throw new Error(`${name}: this browser can't open it${heic ? " (HEIC) - save it as JPEG on the phone (Settings → Camera → Formats → Most Compatible)" : ""}`);
    }
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise((ok) => c.toBlob(ok, "image/jpeg", QUALITY));
    // Never bigger than it was (a small, well compressed photo stays as it is).
    if (!heic && /^image\/(jpeg|png|webp|gif)$/.test(type) && out.size >= blob.size && blob.size <= MAX_FILE) return { name, media_type: type, data: await base64(blob) };
    return { name: name.replace(/\.[^.]+$/, "") + ".jpg", media_type: "image/jpeg", data: await base64(out) };
  }

  // --- members on top ---------------------------------------------------------------------------------------

  function people() {
    const ms = active();
    if (!ms.some((m) => m.id === who)) who = ms[0]?.id ?? null;
    $("people").innerHTML = ms.map((m) => `<button type="button" class="person ${m.id === who ? "on" : ""}" data-who="${m.id}">
      <span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)} <span class="muted">${m.documents}</span></button>`).join("");
    $("people").classList.toggle("hidden", tab === "members" || tab === "inbox" || !ms.length);
  }

  async function load() {
    st = await api("state");
    $("notAdvice").textContent = st.not_advice;
    const n = st.inbox.files.length;
    $("inboxCount").textContent = n;
    $("inboxCount").classList.toggle("hidden", !n);
    people();
    if (!active().length && tab !== "members") return show("members");
    show(tab);
  }

  function show(t) {
    tab = t;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.tab === t));
    for (const s of ["documents", "records", "year", "inbox", "members"]) $(s).classList.toggle("hidden", s !== t);
    people();
    ({ documents, records, year: yearView, inbox, members })[t]();
  }

  // --- documents --------------------------------------------------------------------------------------------

  async function documents() {
    const m = me();
    if (!m) { $("docs").innerHTML = '<p class="muted">Add a family member first (Members).</p>'; return; }
    docs = await api(`documents?member=${m.id}`);
    $("docs").innerHTML = docs.length ? `<div class="cards">${docs.map(card).join("")}</div>`
      : `<p class="muted">No documents of ${esc(m.name)} yet - add photos or PDFs, or put them into the inbox folder (a sub-folder called "${esc(m.name)}").</p>`;
    clearTimeout(poll);
    if (docs.some((d) => d.status === "reading" || d.status === "uploaded")) poll = setTimeout(() => tab === "documents" && documents(), 4000);
  }
  const card = (d) => `<button type="button" class="doc" data-doc="${d.id}">
      <div class="thumb">${d.media_type.startsWith("image/") ? `<img src="api/file?id=${d.id}" alt="" loading="lazy">` : "📄"}</div>
      <div class="body"><span class="name" title="${esc(d.name)}">${esc(d.name)}</span>
        <span><span class="chip">${esc(CAT[d.category] || "…")}</span> ${esc(d.date || "")} <span class="st-${d.status}">${esc(STATUS[d.status])}</span></span>
        <span class="sum">${esc(d.status === "ready" ? d.summary || "" : d.reason || d.summary || "")}</span></div></button>`;

  async function addFiles(list) {
    const m = me();
    if (!m) return toast("Add a family member first", true);
    let done = 0;
    for (const f of list) {
      toast(`${f.name}: preparing…`);
      try {
        const p = await prepare(f, f.name, f.type);
        try { await api("upload", { member_id: m.id, ...p }); } catch (e) {
          if (!e.message.startsWith("DUPLICATE") || !confirm(`${e.message.slice(11)}\n\nAdd it again anyway?`)) throw e;
          await api("upload", { member_id: m.id, ...p, force: true });
        }
        done++;
      } catch (e) { toast(e.message.replace(/^DUPLICATE: /, ""), true); }
    }
    if (done) toast(`${done} document(s) added - your assistant is reading them`);
    await load();
  }

  async function openDoc(id) {
    const d = await api(`document?id=${id}`);
    const img = d.media_type.startsWith("image/");
    $("sheet").innerHTML = `<div class="sheetbox"><div class="sheethead"><b>${esc(d.name)}</b> <span class="st-${d.status}">${esc(STATUS[d.status])}</span>
        <button type="button" data-close>Close</button></div>
      ${img ? `<img class="preview" src="api/file?id=${d.id}" alt="">` : `<p><a href="api/file?id=${d.id}" target="_blank" rel="noopener">Open the PDF</a></p>`}
      ${d.reason ? `<div class="note ${d.status === "failed" ? "bad" : ""}">${esc(d.reason)}</div>` : ""}
      ${d.summary ? `<p>${esc(d.summary)}</p>` : ""}
      <p class="muted">${[d.clinic, d.doctor].filter(Boolean).map(esc).join(" · ")}${d.confidence !== null && d.confidence !== undefined ? ` · read with ${Math.round(d.confidence * 100)}% confidence` : ""}</p>
      <div class="row">
        <select id="dMember">${active().map((m) => `<option value="${m.id}" ${m.id === d.member_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
        <select id="dCat">${st.categories.map((c) => `<option value="${c}" ${c === d.category ? "selected" : ""}>${esc(CAT[c])}</option>`).join("")}</select>
        <input type="date" id="dDate" value="${esc(d.date || "")}">
      </div>
      <div class="row">
        ${d.status === "needs_check" ? '<button type="button" class="primary" data-act="confirm">It is right</button>' : ""}
        <button type="button" data-act="read" title="the assistant reads it again (with the member and category chosen above)">Read again</button>
        <a href="api/file?id=${d.id}&download=1"><button type="button">Download</button></a>
        <button type="button" class="danger" data-act="delete">Delete</button>
      </div>
      <h2>Values read from it (${d.items.length})</h2>
      ${d.items.length ? `<table><tr><th>What</th><th>Value</th><th>Range</th><th>Date</th></tr>${d.items.map((r) => `<tr>
        <td>${esc(r.title)} <span class="muted">${esc(KIND[r.kind] || r.kind)}</span></td><td class="flag-${esc(r.flag || "")}">${esc(val(r))} ${r.flag && r.flag !== "normal" ? esc(r.flag) : ""}</td>
        <td>${esc(range(r))}</td><td>${esc(r.observed_at || "")}</td></tr>`).join("")}</table>` : '<p class="muted">None.</p>'}
      <p class="muted">${esc(st.not_advice)}</p></div>`;
    $("sheet").classList.remove("hidden");
    $("sheet").dataset.doc = d.id;
  }
  const closeSheet = () => { $("sheet").classList.add("hidden"); $("sheet").innerHTML = ""; };

  async function docAction(act) {
    const id = Number($("sheet").dataset.doc);
    try {
      if (act === "delete") {
        if (!confirm("Delete this document and the values read from it?")) return;
        await api("documents/delete", { id });
        closeSheet();
      } else if (act === "read") {
        await api("documents/read", { id, member_id: Number($("dMember").value), category: $("dCat").value });
        toast("Your assistant reads it again");
        closeSheet();
      } else if (act === "confirm") {
        await api("documents/confirm", { id, category: $("dCat").value, date: $("dDate").value });
        await openDoc(id);
      }
      await load();
    } catch (e) { toast(e.message, true); }
  }

  // --- records ------------------------------------------------------------------------------------------------

  async function records() {
    const m = me();
    if (!m) { $("recs").innerHTML = ""; return; }
    const y = await api(`year?member=${m.id}`);
    const keepY = $("recYear").value;
    $("recYear").innerHTML = `<option value="">All years</option>` + y.years.map((x) => `<option ${x === keepY ? "selected" : ""}>${x}</option>`).join("");
    const keepK = $("recKind").value;
    $("recKind").innerHTML = `<option value="">All kinds</option>` + st.kinds.map((k) => `<option value="${k}" ${k === keepK ? "selected" : ""}>${esc(KIND[k])}</option>`).join("");
    const rows = (await api(`records?member=${m.id}${$("recYear").value ? `&year=${$("recYear").value}` : ""}`)).filter((r) => !$("recKind").value || r.kind === $("recKind").value);
    $("recs").innerHTML = rows.length ? `<table><tr><th>What</th><th>Value</th><th>Range</th><th>Date</th><th>From</th><th></th></tr>${rows.map((r) => `<tr>
      <td>${esc(r.title)} <span class="muted">${esc(KIND[r.kind] || r.kind)}</span></td><td class="flag-${esc(r.flag || "")}">${esc(val(r))} ${r.flag && r.flag !== "normal" ? esc(r.flag) : ""}</td>
      <td>${esc(range(r))}</td><td>${esc(r.observed_at || "")}</td>
      <td>${r.document_id ? `<a href="#" data-doc="${r.document_id}">document</a>` : '<span class="muted">by hand</span>'}</td>
      <td>${r.source === "manual" ? `<button type="button" class="danger" data-delrec="${r.id}" title="delete">✕</button>` : ""}</td></tr>`).join("")}</table>`
      : `<p class="muted">No values yet.</p>`;
  }

  function recForm(kind = "blood_pressure") {
    const t = TEMPLATES[kind];
    const f = $("recForm");
    f.innerHTML = `<label>Kind<select id="rKind">${Object.keys(TEMPLATES).map((k) => `<option value="${k}" ${k === kind ? "selected" : ""}>${esc(KIND[k])}</option>`).join("")}</select></label>
      <label>Date<input type="date" id="rDate" value="${new Date().toISOString().slice(0, 10)}"></label>
      ${t.fields ? t.fields.map(([k, l]) => `<label>${esc(l)}<input type="number" step="any" id="rx_${k}" style="width:90px"></label>`).join("")
        : t.text ? `<label style="flex:1">Text<input type="text" id="rText"></label>` : `<label>Value (${esc(t.unit)})<input type="number" step="any" id="rValue" style="width:110px"></label>`}
      <button type="button" class="primary" id="rSave">Save</button><button type="button" id="rCancel">Cancel</button>`;
    f.classList.remove("hidden");
  }
  async function saveRec() {
    const kind = $("rKind").value, t = TEMPLATES[kind];
    const body = { member_id: who, kind, title: t.title, unit: t.unit, observed_at: $("rDate").value };
    if (t.fields) {
      body.extras = Object.fromEntries(t.fields.map(([k]) => [k, Number($("rx_" + k).value) || null]));
      if (!body.extras.systolic) return toast("Systolic is needed", true);
      body.value = body.extras.systolic;
    } else if (t.text) body.value_text = $("rText").value;
    else body.value = $("rValue").value;
    try { await api("records", body); $("recForm").classList.add("hidden"); toast("Saved"); records(); } catch (e) { toast(e.message, true); }
  }

  // --- year ---------------------------------------------------------------------------------------------------

  async function yearView() {
    const m = me();
    if (!m) { $("yearView").innerHTML = ""; return; }
    const y = await api(`year?member=${m.id}${$("yearPick").value ? `&year=${$("yearPick").value}` : ""}`);
    const years = [...new Set([String(new Date().getFullYear()), ...y.years])].sort().reverse();
    $("yearPick").innerHTML = years.map((x) => `<option ${x === y.year ? "selected" : ""}>${x}</option>`).join("");
    const total = y.documents.reduce((n, d) => n + d.n, 0);
    const bp = y.latest.find((r) => r.kind === "blood_pressure");
    $("yearView").innerHTML = `<div class="stats"><div class="stat"><b>${total}</b>documents in ${esc(y.year)}</div>
        ${y.documents.map((d) => `<div class="stat"><b>${d.n}</b>${esc(CAT[d.category] || "not read yet")}</div>`).join("")}
        ${bp ? `<div class="stat"><b>${esc(val(bp))}</b>latest blood pressure · ${esc(bp.observed_at || "")}</div>` : ""}</div>
      <h2>Latest values in ${esc(y.year)}</h2>
      ${y.latest.length ? `<table><tr><th>What</th><th>Value</th><th>Range</th><th>Date</th></tr>${y.latest.map((r) => `<tr><td>${esc(r.title)} <span class="muted">${esc(KIND[r.kind] || r.kind)}</span></td>
        <td class="flag-${esc(r.flag || "")}">${esc(val(r))} ${r.flag && r.flag !== "normal" ? esc(r.flag) : ""}</td><td>${esc(range(r))}</td><td>${esc(r.observed_at || "")}</td></tr>`).join("")}</table>`
        : '<p class="muted">No values in this year.</p>'}`;
  }

  // --- inbox --------------------------------------------------------------------------------------------------

  async function inbox() {
    const ib = await api("inbox");
    st.inbox = ib;
    $("inboxCount").textContent = ib.files.length;
    $("inboxCount").classList.toggle("hidden", !ib.files.length);
    if (!ib.available) {
      $("inboxView").innerHTML = `<div class="note">${esc(ib.reason)}</div><p class="muted">Choose a folder in BotGateway → Applications → FamilyHealthRecords → Config → Inbox folder
        (e.g. one in iCloud Drive: on the iPhone, Share → Save to Files). Make a sub-folder per member, named like the member (e.g. "${esc(active()[0]?.name || "Mum")}"): files in it go to that member.</p>`;
      return;
    }
    const opts = (sel) => `<option value="">- choose -</option>` + active().map((m) => `<option value="${m.id}" ${m.id === sel ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    $("inboxView").innerHTML = ib.files.length ? `<div class="tools"><button type="button" class="primary" id="importAll">Import all with a member</button>
        <span class="muted">Imported files move to done/ in the inbox folder (kept there).</span></div>
      <table><tr><th>File</th><th>Folder</th><th>Size</th><th>Member</th><th></th></tr>${ib.files.map((f, i) => `<tr data-i="${i}">
        <td>${esc(f.name)}</td><td>${esc(f.folder || "(top)")}${f.folder && !f.member_id ? ' <span class="muted">no member with this name</span>' : ""}</td>
        <td>${(f.size / 1048576).toFixed(1)} MB</td><td><select data-member="${i}">${opts(f.member_id)}</select></td>
        <td><button type="button" data-import="${i}">Import</button> <button type="button" class="danger" data-reject="${i}" title="move it to rejected/">✕</button></td></tr>`).join("")}</table>`
      : '<p class="muted">The inbox is empty.</p>';
  }

  async function importOne(i) {
    const f = st.inbox.files[i], member_id = Number(document.querySelector(`[data-member="${i}"]`)?.value);
    if (!member_id) throw new Error(`${f.name}: choose a member`);
    const body = { folder: f.folder, name: f.name, member_id };
    // A photo to make smaller (or a HEIC to convert) is read here first; a PDF or a small photo the program keeps as it is.
    const small = f.media_type === "application/pdf" || (/^image\/(jpeg|png|webp|gif)$/.test(f.media_type) && f.size < KEEP_UNDER);
    if (!small) {
      const r = await fetch(`api/inbox/file?folder=${encodeURIComponent(f.folder)}&name=${encodeURIComponent(f.name)}`, { headers: { "x-botgateway": "1" } });
      if (!r.ok) throw new Error(await r.text());
      const p = await prepare(await r.blob(), f.name, f.media_type);
      Object.assign(body, { data: p.data, media_type: p.media_type });
    } else body.media_type = f.media_type;
    try { await api("inbox/import", body); } catch (e) {
      if (!e.message.startsWith("DUPLICATE") || !confirm(`${e.message.slice(11)}\n\nAdd it again anyway?`)) throw e;
      await api("inbox/import", { ...body, force: true });
    }
  }
  async function importMany(list) {
    let n = 0;
    for (const i of list) {
      try { toast(`${st.inbox.files[i].name}: importing…`); await importOne(i); n++; } catch (e) { toast(e.message.replace(/^DUPLICATE: /, ""), true); }
    }
    if (n) toast(`${n} file(s) imported - your assistant is reading them`);
    await load();
  }

  // --- members ------------------------------------------------------------------------------------------------

  function members() {
    $("memberList").innerHTML = st.members.length ? st.members.map((m) => `<div class="member">
        <span class="dot" style="background:${esc(m.color)}"></span>
        <div class="grow"><b>${esc(m.name)}</b> <span class="muted">${esc(m.relation)}${m.birth_year ? ` · born ${m.birth_year}` : ""}${m.archived ? " · archived" : ""}</span>
          <div class="muted">${m.documents} documents · ${m.records} values · assistant: ${m.ai === "read" ? "may read" : "no access"}</div></div>
        <button type="button" data-edit="${m.id}">Edit</button><button type="button" class="danger" data-delmember="${m.id}">Delete</button></div>`).join("")
      : '<p class="note">Start by adding the family members - yourself first.</p>';
    if (!st.members.length) memberForm();
  }
  function memberForm(m = {}) {
    const f = $("memberForm");
    f.innerHTML = `<label>Name<input type="text" id="mName" value="${esc(m.name || "")}" maxlength="60"></label>
      <label>Relation<select id="mRel">${st.relations.map((r) => `<option ${r === (m.relation || (st.members.length ? "other" : "self")) ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      <label>Birth year<input type="number" id="mYear" value="${esc(m.birth_year || "")}" style="width:100px"></label>
      <label>Colour<input type="color" id="mColor" value="${esc(m.color || "#2f6fdf")}"></label>
      <label>Assistant<select id="mAi"><option value="read" ${m.ai !== "off" ? "selected" : ""}>may read</option><option value="off" ${m.ai === "off" ? "selected" : ""}>no access</option></select></label>
      ${m.id ? `<label>Archived<input type="checkbox" id="mArch" ${m.archived ? "checked" : ""}></label>` : ""}
      <button type="button" class="primary" id="mSave" data-id="${m.id || ""}">Save</button><button type="button" id="mCancel">Cancel</button>`;
    f.classList.remove("hidden");
    $("mName").focus();
  }
  async function saveMember() {
    const id = Number($("mSave").dataset.id) || undefined;
    try {
      const m = await api("members", { id, name: $("mName").value, relation: $("mRel").value, birth_year: $("mYear").value, color: $("mColor").value,
        ai: $("mAi").value, archived: $("mArch")?.checked });
      $("memberForm").classList.add("hidden");
      if (!who) who = m.id;
      toast(`${m.name} saved`);
      await load();
    } catch (e) { toast(e.message, true); }
  }

  // --- events -------------------------------------------------------------------------------------------------

  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("[data-close]") || t.id === "sheet") return closeSheet();
    const tb = t.closest(".tab");
    if (tb) return show(tb.dataset.tab);
    const p = t.closest("[data-who]");
    if (p) {
      who = Number(p.dataset.who);
      try { localStorage.setItem("fhr.member", who); } catch { }
      return show(tab);
    }
    const d = t.closest("[data-doc]");
    if (d) { e.preventDefault(); return openDoc(d.dataset.doc); }
    const a = t.closest("[data-act]");
    if (a) return docAction(a.dataset.act);
    if (t.id === "addRec") return recForm();
    if (t.id === "rSave") return saveRec();
    if (t.id === "rCancel") return $("recForm").classList.add("hidden");
    const dr = t.closest("[data-delrec]");
    if (dr && confirm("Delete this value?")) { await api("records/delete", { id: Number(dr.dataset.delrec) }); return records(); }
    if (t.id === "addMember") return memberForm();
    if (t.id === "mSave") return saveMember();
    if (t.id === "mCancel") return $("memberForm").classList.add("hidden");
    const ed = t.closest("[data-edit]");
    if (ed) return memberForm(st.members.find((m) => m.id === Number(ed.dataset.edit)));
    const dm = t.closest("[data-delmember]");
    if (dm) {
      const m = st.members.find((x) => x.id === Number(dm.dataset.delmember));
      const typed = prompt(`Delete ${m.name} with all ${m.documents} documents and ${m.records} values? This can't be undone.\nType the name to confirm (or use Edit → Archived to keep them):`);
      if (typed === null) return;
      try { await api("members/delete", { id: m.id, confirm: typed }); toast(`${m.name} deleted`); await load(); } catch (err) { toast(err.message, true); }
      return;
    }
    const im = t.closest("[data-import]");
    if (im) return importMany([Number(im.dataset.import)]);
    if (t.id === "importAll") return importMany(st.inbox.files.map((_, i) => i).filter((i) => Number(document.querySelector(`[data-member="${i}"]`)?.value)));
    const rj = t.closest("[data-reject]");
    if (rj) {
      const f = st.inbox.files[Number(rj.dataset.reject)];
      if (!confirm(`Move ${f.name} to rejected/ in the inbox folder?`)) return;
      try { await api("inbox/reject", { folder: f.folder, name: f.name }); await load(); } catch (err) { toast(err.message, true); }
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "pick") { addFiles([...e.target.files]); e.target.value = ""; }
    if (e.target.id === "rKind") recForm(e.target.value);
    if (e.target.id === "recYear" || e.target.id === "recKind") records();
    if (e.target.id === "yearPick") yearView();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  // Files dropped anywhere on the Documents tab.
  document.addEventListener("dragover", (e) => { if (tab === "documents") e.preventDefault(); });
  document.addEventListener("drop", (e) => { if (tab === "documents") { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

  load().catch((e) => { $("docs").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; });
})();
