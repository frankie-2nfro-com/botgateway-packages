// FamilyHealthRecords' page (app_familyhealthrecord_requirements.txt part C, after Aera): five area tabs at the bottom,
// ＋ for inputs, a timeline, My BMI, the year, the inbox and the members. Talks to its program through api/...; photos
// are made smaller here before they are kept (the sandbox has no image code).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Photos: the long side at most this (an A4 page at ~185 dpi - printed text stays readable); smaller files are kept as they are.
  const MAX_SIDE = 2160, KEEP_UNDER = 1 << 20, QUALITY = 0.88, MAX_FILE = 10 << 20;
  const ICON = {
    body: "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
    diet: "M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z",
    exercise: "M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z",
    mental: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z",
    medication: "M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm6 11h-3v3h-2v-3H8v-2h3v-3h2v3h3v2z",
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
  const INPUT_ICON = { text: "📝", mood: "🙂", sleep: "🌙", height: "📏", weight: "⚖️", pdf: "📄" };

  // --- words (繁體中文 / English) ----------------------------------------------------------------------------
  const T = {
    zh: {
      timeline: "時間線", bmi: "我的 BMI", year: "年度", inbox: "收件箱", members: "成員", lang: "EN",
      all: "全部", noRemark: "未有狀況摘要 - 加入記錄後，你的助理會寫低。", remarkOf: "狀況摘要",
      overview: { body: "身體狀況總覽", diet: "飲食總覽", exercise: "運動總覽", mental: "心理總覽", medication: "醫治總覽" },
      lead: { body: "驗血、影像、症狀照片、心電圖、體重與血壓等會整理在這裡。", diet: "飲食記錄、食物相片同營養估算會整理在這裡。", exercise: "運動種類、時間同距離會整理在這裡。",
        mental: "心情變化同睡眠質素會整理在這裡。", medication: "病患、醫生總結、覆診、處方、用藥同疫苗會整理在這裡。" },
      latestDay: "最近輸入日期", adviceTitle: "AI 建議", browse: "瀏覽各類資料", nRecords: (n) => `${n} 筆`, aiNote: "由 AI（你的助理）寫，建議未經醫生確認，行動前請先問醫生。", empty: "呢度未有記錄。撳 ＋ 加入。",
      addMemberFirst: "請先加入家庭成員（成員）。", st: { queued: "排隊中…", reading: "讀緊…", ready: "", needs_check: "請檢查", failed: "失敗" },
      hub: "新增記錄", hubPhoto: "相片／檔案", hubPhotoSub: "化驗單、醫生信、處方、血壓計、食物相…（PDF / 相片）",
      hubMood: "心情記錄", hubMoodSub: "由一種心情轉到另一種", hubSleep: "睡眠質素", hubSleepSub: "昨晚瞓得點",
      hubText: "文字記錄", hubTextSub: "打幾句，例如血壓、血糖、症狀、食咗乜", hubBody: "身高／體重", hubBodySub: "用嚟計 BMI",
      date: "日期", note: "備註（可選）", save: "儲存", cancel: "取消", close: "關閉", from: "之前", to: "而家", quality: "質素",
      templates: "快速範本", height: "身高", weight: "體重", cm: "cm", kg: "kg",
      tpl: [["血壓", "血壓：   /    mmHg，脈搏    "], ["血糖", "血糖：    mmol/L（空腹／飯後）"], ["體溫", "體溫：    °C"], ["運動", "運動：    ，    分鐘"],
        ["飲食", "食咗："], ["症狀", "症狀："], ["尿液試紙", "尿液試紙："], ["用藥", "食咗藥："]],
      saved: "已儲存 - 你的助理會整理", added: (n) => `已加入 ${n} 個檔案 - 你的助理會逐個讀`, preparing: "準備緊…",
      again: "照樣再加？", sure: "確定", readAgain: "再讀一次", itIsRight: "冇錯", download: "下載", del: "刪除",
      delInput: "刪除呢個記錄同讀出嚟嘅數值？", remarksHint: "俾助理嘅提示（可選），例如「呢張係 2024 年嘅」",
      primary: "主分類", also: "亦屬", values: "數值", what: "項目", value: "數值", range: "參考範圍", when: "日期", openPdf: "開啟 PDF",
      confidence: (p) => `可信度 ${p}%`, warnings: "注意", member: "成員",
      tlEmpty: "未有記錄。", daysAgo: (n) => (n === 0 ? "今日" : n === 1 ? "尋日" : n < 30 ? `${n} 日前` : n < 365 ? `約 ${Math.round(n / 30)} 個月前` : `約 ${Math.round(n / 365)} 年前`),
      inputsOfDay: "當日記錄",
      bmiFormula: "BMI 公式", bmiFormulaBody: "BMI = 體重（公斤）÷［身高（公尺）］²\n例：體重 68 kg、身高 170 cm（即 1.70 m）\nBMI = 68 ÷ (1.70 × 1.70) ≈ 23.5",
      bmiLatest: "最新身高／體重", bmiResult: "計算結果", bmiNeed: "要有身高同體重先計到", enter: "輸入", bmiHistory: "體重記錄",
      yearDocs: (y) => `${y} 年記錄`, latestValues: (y) => `${y} 年最新數值`, noValues: "呢年未有數值。",
      inboxOff: "未揀收件資料夾。", inboxHow: (n) => `喺 BotGateway → 應用程式 → FamilyHealthRecords → Config → Inbox folder 揀一個資料夾（例如 iCloud Drive 入面嘅，iPhone：分享 → 儲存到「檔案」）。每個成員開一個子資料夾，用成員名命名（例如「${n}」），入面嘅檔就會歸嗰個成員。`,
      inboxEmpty: "收件箱冇檔案。", importAll: "全部匯入（有揀成員嘅）", importNote: "匯入咗嘅檔會搬去收件資料夾嘅 done/（保留）。",
      file: "檔案", folder: "資料夾", size: "大小", choose: "- 揀 -", import: "匯入", reject: "搬去 rejected/", noSuchMember: "冇呢個名嘅成員",
      addMember: "＋ 加入成員", name: "名", relation: "關係", birth: "出生年份", colour: "顏色", assistant: "助理", mayRead: "可以讀", noAccess: "唔准讀",
      archived: "封存", edit: "修改", start: "先加入家庭成員 - 由自己開始。", rel: { self: "自己", partner: "伴侶", child: "子女", parent: "父母", other: "其他" },
      conditions: "長期病患", addCond: "其他病患（自己打）", add: "加入", memory: "健康狀況記憶", memoryEmpty: "未有 - 每次記錄後，助理會更新。",
      versions: "之前版本", why: { input: "記錄後更新", restored: "還原" }, restore: "用返呢個版本", candidates: "助理發現嘅病患（等你確認）", confirmCond: "加入長期病患",
      counts: (m) => `${m.documents} 個記錄 · ${m.records} 個數值 · 助理：${m.ai === "read" ? "可以讀" : "唔准讀"}`,
      delMember: (m) => `刪除 ${m.name} 同佢所有 ${m.documents} 個記錄？刪咗就冇得返轉頭。\n打個名確認（或者用「修改 → 封存」保留資料）：`,
      dropHere: "放開就加入", todayBtn: "今日", addN: (n) => `加入 ${n} 個檔案`,
      fileDateHint: "記錄日期：例如補入舊報告，就揀報告嘅日子。留空 = 由助理喺文件讀出日期（讀唔到就用今日）。", born: (y) => `${y} 年出生`,
      trayWait: "⏳ 你的助理整理緊", trayLook: "⚠️ 要你睇吓", trayDone: "✓ 啱啱整理好", filed: "✓ 已整理", clearDone: "清除已完成", hide: "收起", show: "打開",
      trayN: (w, a, d) => [w && `${w} 個整理緊`, a && `${a} 個要你睇`, d && `${d} 個啱啱整理好`].filter(Boolean).join(" · "),
    },
    en: {
      timeline: "Timeline", bmi: "My BMI", year: "Year", inbox: "Inbox", members: "Members", lang: "中文",
      all: "All", noRemark: "No remark yet - your assistant writes one after each input.", remarkOf: "Summary",
      overview: { body: "Body overview", diet: "Diet overview", exercise: "Exercise overview", mental: "Mind overview", medication: "Care overview" },
      lead: { body: "Blood tests, imaging, symptom photos, ECGs, weight and blood pressure are kept here.", diet: "Meals, food photos and nutrition estimates are kept here.",
        exercise: "Activities, time and distance are kept here.", mental: "Mood changes and sleep quality are kept here.", medication: "Illnesses, doctor summaries, follow-ups, prescriptions, medicines and vaccinations are kept here." },
      latestDay: "Latest input", adviceTitle: "AI advice", browse: "Browse by category", nRecords: (n) => `${n} record${n === 1 ? "" : "s"}`, aiNote: "Written by an AI (your assistant): its advice is not checked by a doctor - ask your doctor before acting on it.", empty: "Nothing here yet. Press ＋ to add.",
      addMemberFirst: "Add a family member first (Members).", st: { queued: "waiting…", reading: "being read…", ready: "", needs_check: "please check", failed: "failed" },
      hub: "Add", hubPhoto: "Photo / file", hubPhotoSub: "lab reports, doctor's letters, prescriptions, a BP meter, a meal… (PDF / photo)",
      hubMood: "Mood log", hubMoodSub: "from one mood to another", hubSleep: "Sleep quality", hubSleepSub: "how was last night",
      hubText: "Text record", hubTextSub: "a few words - blood pressure, blood sugar, a symptom, a meal", hubBody: "Height / weight", hubBodySub: "for the BMI",
      date: "Date", note: "Note (optional)", save: "Save", cancel: "Cancel", close: "Close", from: "Before", to: "Now", quality: "Quality",
      templates: "Quick templates", height: "Height", weight: "Weight", cm: "cm", kg: "kg",
      tpl: [["Blood pressure", "Blood pressure:    /    mmHg, pulse    "], ["Blood sugar", "Blood sugar:     mmol/L (fasting / after meal)"], ["Temperature", "Temperature:     °C"],
        ["Exercise", "Exercise:     ,     minutes"], ["Meal", "I ate: "], ["Symptom", "Symptom: "], ["Urine strip", "Urine test strip: "], ["Medicine", "Medicine taken: "]],
      saved: "Saved - your assistant files it", added: (n) => `${n} file(s) added - your assistant reads them one by one`, preparing: "preparing…",
      again: "Add it again anyway?", sure: "OK", readAgain: "Read again", itIsRight: "It is right", download: "Download", del: "Delete",
      delInput: "Delete this input and the values read from it?", remarksHint: "A hint for the assistant (optional), e.g. \"this one is from 2024\"",
      primary: "Primary", also: "Also", values: "Values", what: "What", value: "Value", range: "Range", when: "Date", openPdf: "Open the PDF",
      confidence: (p) => `${p}% confidence`, warnings: "Notes", member: "Member",
      tlEmpty: "Nothing recorded yet.", daysAgo: (n) => (n === 0 ? "today" : n === 1 ? "yesterday" : n < 30 ? `${n} days ago` : n < 365 ? `~${Math.round(n / 30)} months ago` : `~${Math.round(n / 365)} years ago`),
      inputsOfDay: "Inputs of the day",
      bmiFormula: "BMI formula", bmiFormulaBody: "BMI = weight (kg) ÷ [height (m)]²\nExample: 68 kg at 170 cm (1.70 m)\nBMI = 68 ÷ (1.70 × 1.70) ≈ 23.5",
      bmiLatest: "Latest height / weight", bmiResult: "Your BMI", bmiNeed: "needs both height and weight", enter: "Enter", bmiHistory: "Weights",
      yearDocs: (y) => `inputs in ${y}`, latestValues: (y) => `Latest values in ${y}`, noValues: "No values in this year.",
      inboxOff: "No inbox folder chosen.", inboxHow: (n) => `Choose a folder in BotGateway → Applications → FamilyHealthRecords → Config → Inbox folder (e.g. one in iCloud Drive: on the iPhone, Share → Save to Files). Make a sub-folder per member, named like the member (e.g. "${n}"): files in it go to that member.`,
      inboxEmpty: "The inbox is empty.", importAll: "Import all with a member", importNote: "Imported files move to done/ in the inbox folder (kept there).",
      file: "File", folder: "Folder", size: "Size", choose: "- choose -", import: "Import", reject: "move to rejected/", noSuchMember: "no member with this name",
      addMember: "＋ Add a member", name: "Name", relation: "Relation", birth: "Birth year", colour: "Colour", assistant: "Assistant", mayRead: "may read", noAccess: "no access",
      archived: "Archived", edit: "Edit", start: "Start by adding the family members - yourself first.", rel: { self: "self", partner: "partner", child: "child", parent: "parent", other: "other" },
      conditions: "Chronic conditions", addCond: "Another condition (type it)", add: "Add", memory: "Health summary (memory)", memoryEmpty: "None yet - your assistant updates it after each input.",
      versions: "Earlier versions", why: { input: "after an input", restored: "put back" }, restore: "Use this version", candidates: "Conditions your assistant found (waiting for you)", confirmCond: "Add to chronic conditions",
      counts: (m) => `${m.documents} inputs · ${m.records} values · assistant: ${m.ai === "read" ? "may read" : "no access"}`,
      delMember: (m) => `Delete ${m.name} with all ${m.documents} inputs? This can't be undone.\nType the name to confirm (or use Edit → Archived to keep them):`,
      dropHere: "drop to add", todayBtn: "Today", addN: (n) => `Add ${n} file(s)`,
      fileDateHint: "The record's date: for an old report added now, pick the report's day. Empty = your assistant reads the date in the file (else today).", born: (y) => `born ${y}`,
      trayWait: "⏳ Your assistant is filing", trayLook: "⚠️ Please have a look", trayDone: "✓ Just filed", filed: "✓ filed", clearDone: "Clear the filed", hide: "Hide", show: "Show",
      trayN: (w, a, d) => [w && `${w} being filed`, a && `${a} to look at`, d && `${d} just filed`].filter(Boolean).join(" · "),
    },
  };
  let lang = "zh";
  try { lang = localStorage.getItem("fhr.lang") || (/^zh/i.test(navigator.language) ? "zh" : "en"); } catch { }
  const t = (k) => T[lang][k];
  const nm = (x) => (x ? x.name[lang === "zh" ? 1 : 0] : "");
  const opt = (arr) => arr[lang === "zh" ? 2 : 1];

  let st = { members: [], areas: [], categories: [], inbox: { files: [] }, busy: [], pending: [] };
  let who = null, view = "body", sub = null, poll = null, tlDay = null, trayOpen = true, seen = [];
  try {
    who = Number(localStorage.getItem("fhr.member")) || null; view = localStorage.getItem("fhr.view") || "body";
    trayOpen = localStorage.getItem("fhr.tray") !== "closed"; seen = JSON.parse(localStorage.getItem("fhr.seen") || "[]");
  } catch { }

  async function api(path, body) {
    const r = await fetch("api/" + path, body === undefined ? { headers: { "x-botgateway": "1" } }
      : { method: "POST", headers: { "x-botgateway": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt || r.statusText);
    return txt ? JSON.parse(txt) : null;
  }
  function toast(msg, bad) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (bad ? " bad" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), bad ? 7000 : 3000);
  }
  const me = () => st.members.find((m) => m.id === who);
  const active = () => st.members.filter((m) => !m.archived);
  const cat = (k) => st.categories.find((c) => c.key === k);
  const areaOf = (k) => cat(k)?.area;
  const area = (k) => st.areas.find((a) => a.key === k);
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const val = (r) => r.kind === "vital_bp" && r.extras?.systolic
    ? `${r.extras.systolic}/${r.extras.diastolic ?? "?"} mmHg${r.extras.pulse ? ` · ${lang === "zh" ? "脈搏" : "pulse"} ${r.extras.pulse}` : ""}`
    : r.kind === "visit" && !r.value_text ? r.extras?.follow_up || r.extras?.follow_up_relative || r.extras?.findings || r.extras?.plan || ""
    : r.kind === "medication" && !r.value ? [r.extras?.dose, r.extras?.frequency, r.extras?.duration].filter(Boolean).join(" · ")
    : r.value !== null && r.value !== undefined ? `${r.value}${r.unit ? " " + r.unit : ""}` : r.value_text || r.extras?.text || r.extras?.notes || "";
  const range = (r) => (r.ref_low !== null || r.ref_high !== null ? `${r.ref_low ?? ""} – ${r.ref_high ?? ""}` : "");
  const flag = (r) => (r.flag && r.flag !== "normal" ? ` <span class="flag-${esc(r.flag)}">${esc(r.flag === "high" ? "↑" : r.flag === "low" ? "↓" : "!")}</span>` : "");
  const status = (d) => (t("st")[d.status] ? `<span class="st-${d.status}">${esc(t("st")[d.status])}</span>` : "");
  const thumb = (d) => d.input === "file" && d.media_type.startsWith("image/") ? `<img src="api/file?id=${d.id}" alt="" loading="lazy">`
    : INPUT_ICON[d.input === "file" ? "pdf" : d.input] || "📄";
  const busyOf = (id) => st.busy.find((b) => b.member_id === id)?.n || 0;

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

  // --- frame: menu, members, area tabs ----------------------------------------------------------------------

  // The top bar (menu, the member shown - tap to change, ＋) and the area tabs.
  function frame() {
    const ms = active();
    if (!ms.some((m) => m.id === who)) who = ms[0]?.id ?? null;
    const m = me();
    $("whoBtn").innerHTML = m ? `${esc(m.name)}${busyOf(m.id) ? "<small>⏳</small>" : ""}${ms.length > 1 ? "<small>▾</small>" : ""}` : "FamilyHealthRecords";
    $("areas").innerHTML = st.areas.map((a) => `<button type="button" data-view="${a.key}" class="${view === a.key ? "on" : ""}">${svg(a.key)}<span>${esc(nm(a))}</span></button>`).join("");
    $("plus").classList.toggle("hidden", !m);
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    tray();
    if (!$("drawer").classList.contains("hidden")) drawer();
  }

  // The tray under the top bar, on every page: the inputs (of all members) waiting or being read, those that
  // failed or are to check (until dealt with) and those just filed (until cleared) - so an input added is never
  // out of sight while it has no area yet.
  const waiting = (d) => d.status === "queued" || d.status === "reading";
  function tray() {
    const list = st.pending.filter((d) => d.status !== "ready" || !seen.includes(d.id));
    const el = $("tray");
    el.classList.toggle("hidden", !list.length);
    if (!list.length) return;
    const w = list.filter(waiting).length, look = list.filter((d) => d.status === "failed" || d.status === "needs_check").length, done = list.length - w - look;
    const many = active().length > 1;
    const hubName = { text: "hubText", mood: "hubMood", sleep: "hubSleep", height: "height", weight: "weight" };
    const label = (d) => (d.status === "ready" && d.summary) || (d.input === "text" && d.note?.text ? d.note.text.slice(0, 60) : d.name || t(hubName[d.input] || "hubPhoto"));
    const row = (d) => {
      const m = st.members.find((x) => x.id === d.member_id);
      const right = d.status === "ready" ? `<span class="st-ready">${esc(t("filed"))}${d.main_key ? ` · ${esc(nm(area(d.main_key)))}` : ""}</span>` : status(d);
      return `<div class="trow"><button type="button" class="tdoc" data-doc="${d.id}"><span class="tthumb">${thumb(d)}</span>
          <span class="tbody"><span class="tname">${many && m ? `<span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)} · ` : ""}${esc(label(d))}</span>
          ${d.reason && d.status !== "ready" ? `<span class="treason">${esc(d.reason)}</span>` : ""}</span>${right}</button>
        ${d.status === "ready" ? `<button type="button" class="tx" data-seen="${d.id}" aria-label="${esc(t("close"))}">✕</button>` : ""}</div>`;
    };
    el.innerHTML = `<div class="trayhead"><b>${esc(w ? t("trayWait") : look ? t("trayLook") : t("trayDone"))}</b><span class="muted">${esc(t("trayN")(w, look, done))}</span>
        ${done && trayOpen ? `<button type="button" class="link" data-seen="all">${esc(t("clearDone"))}</button>` : ""}
        <button type="button" class="link" data-tray>${esc(trayOpen ? t("hide") : t("show"))}</button></div>
      ${trayOpen ? `<div class="trows">${list.map(row).join("")}</div>` : ""}`;
  }
  function markSeen(id) {
    seen = [...seen, ...(id === "all" ? st.pending.filter((d) => d.status === "ready").map((d) => d.id) : [Number(id)])].slice(-300);
    try { localStorage.setItem("fhr.seen", JSON.stringify(seen)); } catch { }
    tray();
  }

  // The menu: the other pages, the members (to change), the language.
  function drawer() {
    const n = st.inbox.files.length;
    const item = (k, label, extra = "") => `<button type="button" data-view="${k}" class="${view === k ? "on" : ""}">${esc(label)}${extra}</button>`;
    $("drawerBox").innerHTML = `${st.areas.map((a) => item(a.key, nm(a))).join("")}<h3></h3>
      ${item("timeline", t("timeline"))}${item("bmi", t("bmi"))}${item("year", t("year"))}${item("inbox", t("inbox"), n ? `<span class="count">${n}</span>` : "")}${item("members", t("members"))}
      ${active().length > 1 ? `<h3>${esc(t("member"))}</h3>${active().map((m) => `<button type="button" data-who="${m.id}" class="${m.id === who ? "on" : ""}"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}</button>`).join("")}` : ""}
      <h3></h3><button type="button" data-lang>${esc(t("lang") === "EN" ? "English" : "中文")}</button>`;
    $("drawer").classList.remove("hidden");
  }
  const closeDrawer = () => $("drawer").classList.add("hidden");

  // Tap on the member's name: the members to change to.
  function whoSheet() {
    const ms = active();
    if (ms.length < 2) return go("members");
    sheet(`<div class="sheethead"><h2>${esc(t("member"))}</h2><button type="button" class="btn" data-close>${esc(t("close"))}</button></div>
      <div class="hub">${ms.map((m) => `<button type="button" data-who="${m.id}"><span class="ico" style="background:${esc(m.color)}22;color:${esc(m.color)}">●</span>
        <span><b>${esc(m.name)}</b><small>${esc(t("rel")[m.relation] || "")}${m.birth_year ? ` · ${esc(t("born")(m.birth_year))}` : ""}</small></span></button>`).join("")}</div>`);
  }

  async function load() {
    st = await api("state");
    if (!active().length && view !== "members") view = "members";
    frame();
    await render();
  }

  async function render() {
    clearTimeout(poll);
    try { localStorage.setItem("fhr.view", view); } catch { }
    const v = $("view"), m = me();
    if (view === "members") await members(v);
    else if (view === "inbox") await inbox(v);
    else if (!m) v.innerHTML = `<div class="card empty">${esc(t("addMemberFirst"))}</div>`;
    else if (view === "timeline") await timeline(v, m);
    else if (view === "bmi") await bmi(v, m);
    else if (view === "year") await year(v, m);
    else await areaView(v, m);
    watch();
  }

  // While inputs wait or are being read: look again every 4 seconds - the tray each time, the page only when an
  // input changed (and not the members or inbox pages, which may have a form open).
  const sig = () => st.pending.map((d) => `${d.id}:${d.status}`).join();
  function watch() {
    clearTimeout(poll);
    if (!st.pending.some(waiting)) return;
    const was = sig();
    poll = setTimeout(async () => {
      try { st = await api("state"); } catch { return watch(); }
      frame();
      if (sig() !== was && view !== "members" && view !== "inbox") render().catch(() => watch());
      else watch();
    }, 4000);
  }

  function go(next) {
    if (next !== view) sub = null;
    view = next;
    frame();
    render().catch((e) => toast(e.message, true));
    window.scrollTo({ top: 0 });
  }

  // --- an area: its summary, sub-categories and inputs ---------------------------------------------------------

  // An area (Aera): its overview - the latest day's inputs, the latest summary with the AI's advice, the
  // sub-categories with records; a sub-category opens its inputs.
  async function areaView(v, m) {
    const a = area(view) || st.areas[0];
    view = a.key;
    const r = await api(`area?member=${m.id}&area=${a.key}${sub ? `&category=${sub}` : ""}`);
    if (sub) {
      v.innerHTML = `<div class="ov"><button type="button" class="back" data-sub="">‹ ${esc(t("overview")[a.key])}</button>
        <h1>${esc(nm(cat(sub)))}</h1><p class="lead">${esc(t("nRecords")(r.items.length))}</p>
        ${r.items.length ? `<div class="list">${r.items.map((d) => item(d, a.key)).join("")}</div>` : `<div class="card empty">${esc(t("empty"))}</div>`}</div>`;
      return;
    }
    const last = r.items[0]?.date;
    const ofDay = r.items.filter((d) => d.date === last);
    const time = (d) => { const x = new Date(d.created); return isNaN(x) ? "" : `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
    const subs = st.categories.filter((c) => c.area === a.key && r.counts[c.key]);
    v.innerHTML = `<div class="ov"><h1>${esc(t("overview")[a.key])}</h1><p class="lead">${esc(t("lead")[a.key])}</p>
      ${last ? `<h2 class="sec">${esc(t("latestDay"))} (${esc(last.replaceAll("-", "/"))})</h2><div class="latest">${ofDay.map((d) => `<button type="button" data-doc="${d.id}">
        <span class="tm">${esc(time(d))}</span>${esc(nm(cat(d.subs?.[0] || d.category_key)) || "")}${d.subs?.length || d.category_key ? "：" : ""}${esc(d.status === "ready" || !d.reason ? d.summary || d.name : d.reason)} ${status(d)}</button>`).join("")}</div>` : ""}
      <h2 class="sec">${esc(t("remarkOf"))}</h2>
      <div class="sumcard">${r.remark ? esc(r.remark.text) : `<span class="muted">${esc(t("noRemark"))}</span>`}${r.remark?.advice ? adviceBox(r.remark.advice) : ""}</div>
      <h2 class="sec">${esc(t("browse"))}</h2>
      ${subs.length ? `<div class="subs">${subs.map((c) => `<button type="button" data-sub="${c.key}"><span class="dot" style="background:var(--a-${a.key})"></span>${esc(nm(c))}
        <span class="n">${esc(t("nRecords")(r.counts[c.key]))}</span><span class="chev">›</span></button>`).join("")}</div>` : `<div class="card empty">${esc(t("empty"))}</div>`}</div>`;
  }

  const adviceBox = (x) => `<div class="advice" title="${esc(t("aiNote"))}"><b>💡 ${esc(t("adviceTitle"))}</b><div>${esc(x)}</div></div>`;

  // One input as a card: its sub-categories (in this area), status, summary and the values filed here.
  const item = (d, areaKey) => {
    const subs = (d.subs || [d.category_key]).filter(Boolean);
    const recs = (d.records || []).slice(0, 6);
    return `<button type="button" class="item" data-doc="${d.id}"><div class="thumb">${thumb(d)}</div><div class="body">
      <span class="line1">${esc(d.date || "")} ${subs.map((k) => `<span class="tag">${esc(nm(cat(k)))}</span>`).join("")}
        ${!areaKey && d.main_key ? `<span class="tag area" style="--area:var(--a-${d.main_key})">${esc(nm(area(d.main_key)))}</span>` : ""} ${status(d)}</span>
      <span class="sum">${esc(d.status === "ready" || !d.reason ? d.summary || d.name : d.reason)}</span>
      ${recs.length ? `<span class="vals">${recs.map((r) => `<span>${esc(r.title)} <b>${esc(val(r))}</b>${flag(r)}</span>`).join("")}${(d.records.length > 6) ? "<span>…</span>" : ""}</span>` : ""}
    </div></button>`;
  };

  // --- one input: the panel ----------------------------------------------------------------------------------

  async function openDoc(id) {
    const d = await api(`document?id=${id}`);
    const img = d.input === "file" && d.media_type.startsWith("image/");
    const fixed = ["mood", "sleep", "height", "weight"].includes(d.input);
    sheet(`<div class="sheethead"><h2>${esc(d.summary || d.name)}</h2>${status(d)}<button type="button" class="btn" data-close>${esc(t("close"))}</button></div>
      ${img ? `<img class="preview" src="api/file?id=${d.id}" alt="">` : d.input === "file" ? `<p><a href="api/file?id=${d.id}" target="_blank" rel="noopener">${esc(t("openPdf"))}</a></p>` : ""}
      ${d.input === "text" && d.note?.text ? `<div class="memory">${esc(d.note.text)}</div>` : ""}
      ${d.reason ? `<div class="note ${d.status === "failed" ? "bad" : ""}">${esc(d.reason)}</div>` : ""}
      <p class="muted">${[d.date, d.clinic, d.doctor].filter(Boolean).map(esc).join(" · ")}${d.confidence !== null && d.confidence !== undefined && !fixed ? ` · ${esc(t("confidence")(Math.round(d.confidence * 100)))}` : ""}</p>
      ${d.category_key ? `<p>${esc(t("primary"))}: <span class="tag area" style="--area:var(--a-${d.main_key})">${esc(nm(area(d.main_key)))}</span><span class="tag">${esc(nm(cat(d.category_key)))}</span>
        ${d.also_keys.length ? ` · ${esc(t("also"))}: ${d.also_keys.map((k) => `<span class="tag">${esc(nm(cat(k)))}</span>`).join("")}` : ""}</p>` : ""}
      ${d.area_remarks.map((r) => `<div class="card rcard" style="--area:var(--a-${r.main_key})"><b>${esc(nm(area(r.main_key)))}</b><p>${esc(r.text)}</p>${r.advice ? adviceBox(r.advice) : ""}</div>`).join("")}
      ${d.items.length ? `<h3>${esc(t("values"))} (${d.items.length})</h3><div class="scroll"><table><tr><th>${esc(t("what"))}</th><th>${esc(t("value"))}</th><th>${esc(t("range"))}</th><th>${esc(t("when"))}</th></tr>
        ${d.items.map((r) => `<tr><td>${esc(r.title)} <span class="muted">${esc(nm(cat(r.category_key)) || r.kind)}</span></td><td>${esc(val(r))}${flag(r)}</td><td>${esc(range(r))}</td><td>${esc(String(r.observed_at || "").slice(0, 10))}</td></tr>`).join("")}</table></div>` : ""}
      ${d.warnings.length ? `<p class="muted">${esc(t("warnings"))}: ${d.warnings.map(esc).join(" · ")}</p>` : ""}
      <h3>${esc(t("readAgain"))}</h3>
      <div class="row">
        <label class="f">${esc(t("member"))}<select id="dMember">${active().map((m) => `<option value="${m.id}" ${m.id === d.member_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
        ${fixed ? "" : `<label class="f">${esc(t("primary"))}<select id="dCat"><option value="">-</option>${st.areas.map((a) => `<optgroup label="${esc(nm(a))}">${st.categories.filter((c) => c.area === a.key)
          .map((c) => `<option value="${c.key}" ${c.key === d.category_key ? "selected" : ""}>${esc(nm(c))}</option>`).join("")}</optgroup>`).join("")}</select></label>`}
        <label class="f">${esc(t("date"))}<input type="date" id="dDate" value="${esc(d.date || "")}"></label>
      </div>
      <textarea id="dRemarks" placeholder="${esc(t("remarksHint"))}" style="min-height:60px">${esc(d.remarks || "")}</textarea>
      <div class="row">
        ${d.status === "needs_check" ? `<button type="button" class="btn primary" data-act="confirm">${esc(t("itIsRight"))}</button>` : ""}
        <button type="button" class="btn" data-act="read">${esc(t("readAgain"))}</button>
        ${d.input === "file" ? `<a href="api/file?id=${d.id}&download=1"><button type="button" class="btn">${esc(t("download"))}</button></a>` : ""}
        <button type="button" class="btn danger" data-act="delete">${esc(t("del"))}</button>
      </div>
`);
    // Not data-doc on the sheet: that would make every button in it open the input again.
    $("sheet").dataset.open = d.id;
  }

  function sheet(html) {
    $("sheet").innerHTML = `<div class="sheetbox">${html}</div>`;
    $("sheet").classList.remove("hidden");
  }
  const closeSheet = () => { $("sheet").classList.add("hidden"); $("sheet").innerHTML = ""; };

  async function docAction(act) {
    const id = Number($("sheet").dataset.open);
    try {
      if (act === "delete") {
        if (!confirm(t("delInput"))) return;
        await api("documents/delete", { id });
      } else if (act === "read") {
        await api("documents/read", { id, member_id: Number($("dMember").value), category: $("dCat")?.value || "", date: $("dDate").value, remarks: $("dRemarks").value });
      } else if (act === "confirm") {
        await api("documents/confirm", { id, category: $("dCat")?.value || "", date: $("dDate").value });
      }
      closeSheet();
      await load();
    } catch (e) { toast(e.message, true); }
  }

  // --- ＋ inputs ------------------------------------------------------------------------------------------------

  function hub() {
    if (!me()) return toast(t("addMemberFirst"), true);
    const b = (k, ico, title, small) => `<button type="button" data-hub="${k}"><span class="ico">${ico}</span><span><b>${esc(title)}</b><small>${esc(small)}</small></span></button>`;
    sheet(`<div class="sheethead"><h2>${esc(t("hub"))} · ${esc(me().name)}</h2><button type="button" class="btn" data-close>${esc(t("close"))}</button></div>
      <div class="hub">${b("file", "📷", t("hubPhoto"), t("hubPhotoSub"))}${b("mood", "🙂", t("hubMood"), t("hubMoodSub"))}${b("sleep", "🌙", t("hubSleep"), t("hubSleepSub"))}
        ${b("text", "📝", t("hubText"), t("hubTextSub"))}${b("body", "📏", t("hubBody"), t("hubBodySub"))}</div>
      <input id="pick" type="file" multiple accept="image/*,application/pdf,.heic,.heif" hidden>`);
  }
  const dateField = () => `<label class="f">${esc(t("date"))}<input type="date" id="eDate" value="${today()}" max="${today()}"></label>`;
  const head = (title) => `<div class="sheethead"><h2>${esc(title)} · ${esc(me().name)}</h2><button type="button" class="btn" data-close>${esc(t("close"))}</button></div>`;
  const choices = (id, list, sel) => `<div class="pick" id="${id}">${list.map((x) => `<button type="button" class="chip ${x[0] === sel ? "on" : ""}" data-pick="${x[0]}">${esc(opt(x))}</button>`).join("")}</div>`;

  function hubPanel(k) {
    if (k === "file") return $("pick").click();
    if (k === "mood") return sheet(`${head(t("hubMood"))}<h3>${esc(t("from"))}</h3>${choices("pFrom", st.moods)}<h3>${esc(t("to"))}</h3>${choices("pTo", st.moods)}
      <textarea id="eNote" placeholder="${esc(t("note"))}" style="min-height:60px"></textarea><div class="row">${dateField()}</div>
      <div class="row"><button type="button" class="btn primary" data-save="mood">${esc(t("save"))}</button></div>`);
    if (k === "sleep") return sheet(`${head(t("hubSleep"))}<h3>${esc(t("quality"))}</h3>${choices("pQuality", st.sleep)}
      <textarea id="eNote" placeholder="${esc(t("note"))}" style="min-height:60px"></textarea><div class="row">${dateField()}</div>
      <div class="row"><button type="button" class="btn primary" data-save="sleep">${esc(t("save"))}</button></div>`);
    if (k === "text") return sheet(`${head(t("hubText"))}<p class="muted" style="margin:0">${esc(t("templates"))}</p>
      <div class="pick">${t("tpl").map(([l], i) => `<button type="button" class="chip" data-tpl="${i}">${esc(l)}</button>`).join("")}</div>
      <textarea id="eText"></textarea><div class="row">${dateField()}</div>
      <div class="row"><button type="button" class="btn primary" data-save="text">${esc(t("save"))}</button></div>`);
    if (k === "body" || k === "height" || k === "weight") return sheet(`${head(t("hubBody"))}
      <div class="row"><label class="f">${esc(t("height"))} (cm)<input type="number" id="eHeight" step="0.1" min="40" max="260" style="width:130px"></label>
      <label class="f">${esc(t("weight"))} (kg)<input type="number" id="eWeight" step="0.1" min="2" max="400" style="width:130px"></label>${dateField()}</div>
      <div class="row"><button type="button" class="btn primary" data-save="body">${esc(t("save"))}</button></div>`);
  }

  const picked = (id) => document.querySelector(`#${id} .chip.on`)?.dataset.pick || "";
  async function saveEntry(k) {
    const m = me(), date = $("eDate").value, note = $("eNote")?.value || "";
    try {
      if (k === "mood") await api("entry", { member_id: m.id, input: "mood", from: picked("pFrom"), to: picked("pTo"), note, date });
      else if (k === "sleep") await api("entry", { member_id: m.id, input: "sleep", quality: picked("pQuality"), note, date });
      else if (k === "text") await api("entry", { member_id: m.id, input: "text", text: $("eText").value, date });
      else {
        const h = $("eHeight").value, w = $("eWeight").value;
        if (!h && !w) throw new Error(`${t("height")} / ${t("weight")}?`);
        if (h) await api("entry", { member_id: m.id, input: "height", value: Number(h), date });
        if (w) await api("entry", { member_id: m.id, input: "weight", value: Number(w), date });
      }
      closeSheet();
      toast(t("saved"));
      await load();
    } catch (e) { toast(e.message, true); }
  }

  // Files picked or dropped: first their date (an old document added now gets its own day; empty = the day the
  // assistant reads in it, else today), then they are added.
  let pending = [];
  function pickedFiles(list) {
    if (!me()) return toast(t("addMemberFirst"), true);
    if (!list.length) return;
    pending = list;
    sheet(`${head(t("hubPhoto"))}<ul>${list.map((f) => `<li>${esc(f.name)} <span class="muted">${(f.size / 1048576).toFixed(1)} MB</span></li>`).join("")}</ul>
      <div class="row"><label class="f">${esc(t("date"))}<input type="date" id="fDate" max="${today()}"></label>
        <button type="button" class="btn" id="fToday">${esc(t("todayBtn"))}</button></div>
      <p class="muted" style="margin:0">${esc(t("fileDateHint"))}</p>
      <div class="row"><button type="button" class="btn primary" id="fAdd">${esc(t("addN")(list.length))}</button><button type="button" class="btn" data-close>${esc(t("cancel"))}</button></div>`);
  }

  async function addFiles(list, date) {
    const m = me();
    if (!m) return toast(t("addMemberFirst"), true);
    closeSheet();
    let done = 0;
    for (const f of list) {
      toast(`${f.name}: ${t("preparing")}`);
      try {
        const p = await prepare(f, f.name, f.type);
        try { await api("upload", { member_id: m.id, ...p, date }); } catch (e) {
          if (!e.message.startsWith("DUPLICATE") || !confirm(`${e.message.slice(11)}\n\n${t("again")}`)) throw e;
          await api("upload", { member_id: m.id, ...p, date, force: true });
        }
        done++;
      } catch (e) { toast(e.message.replace(/^DUPLICATE: /, ""), true); }
    }
    if (done) toast(t("added")(done));
    await load();
  }

  // --- timeline -----------------------------------------------------------------------------------------------

  async function timeline(v, m) {
    const r = await api(`timeline?member=${m.id}${tlDay ? `&day=${tlDay}` : ""}`);
    if (!r.days.length) { v.innerHTML = `<div class="card empty">${esc(t("tlEmpty"))}</div>`; return; }
    if (!r.days.some((x) => x.day === r.day)) tlDay = null;
    const ago = (d) => t("daysAgo")(Math.max(0, Math.round((Date.parse(today()) - Date.parse(d)) / 86400000)));
    v.innerHTML = `<div class="tl"><div class="rail">${r.days.map((x) => `<button type="button" data-day="${x.day}" class="${x.day === r.day ? "on" : ""}">${esc(x.day)}<small>${esc(ago(x.day))} · ${x.n}</small></button>`).join("")}</div>
      <div><h2 style="margin-top:0">${esc(r.day)} <span class="muted" style="font-size:15px">${esc(ago(r.day))}</span></h2>
        ${r.remarks.map((x) => `<div class="card rcard" style="--area:var(--a-${x.main_key})"><b>${svgSmall(x.main_key)} ${esc(nm(area(x.main_key)))}</b><p>${esc(x.text)}</p>${x.advice ? adviceBox(x.advice) : ""}</div>`).join("")}
        <h3>${esc(t("inputsOfDay"))}</h3><div class="list">${r.items.map((d) => item(d)).join("")}</div></div></div>`;
  }
  const svgSmall = (k) => `<span style="display:inline-block;width:16px;height:16px;vertical-align:-3px;fill:var(--a-${k})">${svg(k)}</span>`;

  // --- BMI (the page computes it: the latest height and weight) ------------------------------------------------

  async function bmi(v, m) {
    const r = await api(`bmi?member=${m.id}`);
    const h = r.height?.value, w = r.weight?.value;
    const calc = (kg) => (h && kg ? kg / ((h / 100) * (h / 100)) : null);
    const b = calc(w);
    const rowM = (label, rec, unit) => `<div class="mrow"><div class="grow"><b>${esc(label)}</b><div class="muted">${rec ? `${esc(rec.value)} ${unit} · ${esc(String(rec.observed_at || "").slice(0, 10))}` : "—"}</div></div>
      <button type="button" class="btn" data-hub="body">${esc(t("enter"))}</button></div>`;
    v.innerHTML = `<div class="grid2"><div class="card"><h2 style="margin-top:0">${esc(t("bmiFormula"))}</h2><div class="formula">${esc(t("bmiFormulaBody"))}</div></div>
      <div class="card"><h2 style="margin-top:0">${esc(t("bmiResult"))}</h2><div class="bmi">${b ? b.toFixed(1) : "—"}</div><p class="muted" style="margin:0">${b ? "kg/m²" : esc(t("bmiNeed"))}</p></div></div>
      <div class="card" style="margin-top:14px"><h2 style="margin-top:0">${esc(t("bmiLatest"))}</h2>${rowM(t("height"), r.height, "cm")}${rowM(t("weight"), r.weight, "kg")}</div>
      ${r.weights.length > 1 ? `<h2>${esc(t("bmiHistory"))}</h2><div class="scroll"><table><tr><th>${esc(t("when"))}</th><th>${esc(t("weight"))}</th><th>BMI</th></tr>
        ${r.weights.map((x) => `<tr><td>${esc(String(x.observed_at || "").slice(0, 10))}</td><td>${esc(x.value)} kg</td><td>${calc(x.value) ? calc(x.value).toFixed(1) : "—"}</td></tr>`).join("")}</table></div>` : ""}`;
  }

  // --- year -----------------------------------------------------------------------------------------------------

  async function year(v, m) {
    const pickY = $("yearPick")?.value || "";
    const y = await api(`year?member=${m.id}${pickY ? `&year=${pickY}` : ""}`);
    const years = [...new Set([String(new Date().getFullYear()), ...y.years])].sort().reverse();
    const total = y.areas.reduce((n, x) => n + x.n, 0);
    v.innerHTML = `<div class="row"><select id="yearPick">${years.map((x) => `<option ${x === y.year ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="stats"><div class="stat"><b>${total}</b>${esc(t("yearDocs")(y.year))}</div>
        ${y.areas.filter((x) => x.main_key).map((x) => `<div class="stat" style="--area:var(--a-${x.main_key})"><b>${x.n}</b>${esc(nm(area(x.main_key)))}</div>`).join("")}</div>
      <h2>${esc(t("latestValues")(y.year))}</h2>
      ${y.latest.length ? `<div class="scroll"><table><tr><th>${esc(t("what"))}</th><th>${esc(t("value"))}</th><th>${esc(t("range"))}</th><th>${esc(t("when"))}</th></tr>${y.latest.map((r) => `<tr>
        <td>${esc(r.title)} <span class="muted">${esc(nm(cat(r.category_key)) || r.kind)}</span></td><td>${esc(val(r))}${flag(r)}</td><td>${esc(range(r))}</td>
        <td><a href="#" data-doc="${r.document_id}">${esc(String(r.observed_at || "").slice(0, 10))}</a></td></tr>`).join("")}</table></div>`
        : `<div class="card empty">${esc(t("noValues"))}</div>`}`;
  }

  // --- inbox --------------------------------------------------------------------------------------------------

  async function inbox(v) {
    const ib = await api("inbox");
    st.inbox = ib;
    frame();
    if (!ib.available) {
      v.innerHTML = `<div class="note">${esc(t("inboxOff"))} ${esc(ib.reason)}</div><p class="muted">${esc(t("inboxHow")(active()[0]?.name || "Mum"))}</p>`;
      return;
    }
    const opts = (sel) => `<option value="">${esc(t("choose"))}</option>` + active().map((m) => `<option value="${m.id}" ${m.id === sel ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    v.innerHTML = ib.files.length ? `<div class="row"><button type="button" class="btn primary" id="importAll">${esc(t("importAll"))}</button>
        <span class="muted">${esc(t("importNote"))}</span></div>
      <div class="scroll"><table><tr><th>${esc(t("file"))}</th><th>${esc(t("folder"))}</th><th>${esc(t("size"))}</th><th>${esc(t("member"))}</th><th></th></tr>${ib.files.map((f, i) => `<tr>
        <td>${esc(f.name)}</td><td>${esc(f.folder || "(top)")}${f.folder && !f.member_id ? ` <span class="muted">${esc(t("noSuchMember"))}</span>` : ""}</td>
        <td>${(f.size / 1048576).toFixed(1)} MB</td><td><select data-member="${i}">${opts(f.member_id)}</select></td>
        <td style="white-space:nowrap"><button type="button" class="btn" data-import="${i}">${esc(t("import"))}</button> <button type="button" class="btn danger" data-reject="${i}" title="${esc(t("reject"))}">✕</button></td></tr>`).join("")}</table></div>`
      : `<div class="card empty">${esc(t("inboxEmpty"))}</div><p class="muted">${esc(t("inboxHow")(active()[0]?.name || "Mum"))}</p>`;
  }

  async function importOne(i) {
    const f = st.inbox.files[i], member_id = Number(document.querySelector(`[data-member="${i}"]`)?.value);
    if (!member_id) throw new Error(`${f.name}: ${t("choose")}`);
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
      if (!e.message.startsWith("DUPLICATE") || !confirm(`${e.message.slice(11)}\n\n${t("again")}`)) throw e;
      await api("inbox/import", { ...body, force: true });
    }
  }
  async function importMany(list) {
    let n = 0;
    for (const i of list) {
      try { toast(`${st.inbox.files[i].name}: ${t("import")}…`); await importOne(i); n++; } catch (e) { toast(e.message.replace(/^DUPLICATE: /, ""), true); }
    }
    if (n) toast(t("added")(n));
    await load();
  }

  // --- members: details, chronic conditions, memory --------------------------------------------------------------

  async function members(v) {
    const list = st.members.length ? st.members.map((m) => `<div class="card member"><span class="dot" style="background:${esc(m.color)}"></span>
        <div class="grow"><b>${esc(m.name)}</b> <span class="muted">${esc(t("rel")[m.relation] || m.relation)}${m.birth_year ? ` · ${esc(t("born")(m.birth_year))}` : ""}${m.archived ? ` · ${esc(t("archived"))}` : ""}</span>
          <div class="muted">${esc(t("counts")(m))}</div>
          ${m.conditions.length ? `<div>${m.conditions.map((c) => `<span class="tag">${esc(lang === "zh" ? c.zh : c.en || c.zh)}</span>`).join("")}</div>` : ""}</div>
        <button type="button" class="btn" data-health="${m.id}">${esc(t("memory").split(" ")[0])}</button>
        <button type="button" class="btn" data-edit="${m.id}">${esc(t("edit"))}</button><button type="button" class="btn danger" data-delmember="${m.id}">${esc(t("del"))}</button></div>`).join("")
      : `<div class="note">${esc(t("start"))}</div>`;
    v.innerHTML = `<div class="row"><button type="button" class="btn primary" id="addMember">${esc(t("addMember"))}</button></div><div id="memberForm" class="card hidden" style="margin-bottom:12px"></div>${list}`;
    if (!st.members.length) memberForm();
  }
  function memberForm(m = {}) {
    const f = $("memberForm");
    f.innerHTML = `<div class="row">
      <label class="f">${esc(t("name"))}<input type="text" id="mName" value="${esc(m.name || "")}" maxlength="60"></label>
      <label class="f">${esc(t("relation"))}<select id="mRel">${st.relations.map((r) => `<option value="${r}" ${r === (m.relation || (st.members.length ? "other" : "self")) ? "selected" : ""}>${esc(t("rel")[r])}</option>`).join("")}</select></label>
      <label class="f">${esc(t("birth"))}<input type="number" id="mYear" value="${esc(m.birth_year || "")}" style="width:110px"></label>
      <label class="f">${esc(t("colour"))}<input type="color" id="mColor" value="${esc(m.color || "#0ea58f")}"></label>
      <label class="f">${esc(t("assistant"))}<select id="mAi"><option value="read" ${m.ai !== "off" ? "selected" : ""}>${esc(t("mayRead"))}</option><option value="off" ${m.ai === "off" ? "selected" : ""}>${esc(t("noAccess"))}</option></select></label>
      ${m.id ? `<label class="f">${esc(t("archived"))}<input type="checkbox" id="mArch" ${m.archived ? "checked" : ""}></label>` : ""}</div>
      <div class="row"><button type="button" class="btn primary" id="mSave" data-id="${m.id || ""}">${esc(t("save"))}</button><button type="button" class="btn" id="mCancel">${esc(t("cancel"))}</button></div>`;
    f.classList.remove("hidden");
    $("mName").focus();
  }
  async function saveMember() {
    const id = Number($("mSave").dataset.id) || undefined;
    try {
      const m = await api("members", { id, name: $("mName").value, relation: $("mRel").value, birth_year: $("mYear").value, color: $("mColor").value,
        ai: $("mAi").value, archived: $("mArch")?.checked });
      if (!who) who = m.id;
      toast(`${m.name} ✓`);
      await load();
    } catch (e) { toast(e.message, true); }
  }

  // A member's health: chronic conditions (memory A, only the owner), the running summary (B) and its versions,
  // the conditions the assistant found.
  async function health(id) {
    const m = st.members.find((x) => x.id === id);
    const r = await api(`memory?member=${id}`);
    const has = (k) => m.conditions.some((c) => c.key === k);
    sheet(`<div class="sheethead"><h2>${esc(m.name)}</h2><button type="button" class="btn" data-close>${esc(t("close"))}</button></div>
      <h3>${esc(t("conditions"))}</h3>
      <div class="pick">${st.conditions.map((c) => `<button type="button" class="chip ${has(c[0]) ? "on" : ""}" data-cond="${c[0]}">${esc(opt(c))}</button>`).join("")}
        ${m.conditions.filter((c) => !c.key).map((c) => `<button type="button" class="chip on" data-custom="${esc(c.zh)}">${esc(c.zh)} ✕</button>`).join("")}</div>
      <div class="row"><input type="text" id="cText" placeholder="${esc(t("addCond"))}" maxlength="120"><button type="button" class="btn" data-addcond="${id}">${esc(t("add"))}</button></div>
      ${r.candidates.length ? `<h3>${esc(t("candidates"))}</h3>${r.candidates.map((c) => `<div class="mrow"><div class="grow"><b>${esc(c.title)}</b><div class="muted">${esc(c.value_text || "")} · ${esc(String(c.observed_at || "").slice(0, 10))}</div></div>
        <button type="button" class="btn primary" data-confirmcond="${c.id}">${esc(t("confirmCond"))}</button></div>`).join("")}` : ""}
      <h3>${esc(t("memory"))}</h3><div class="memory">${r.memory ? esc(r.memory) : `<span class="muted">${esc(t("memoryEmpty"))}</span>`}</div>
      ${r.versions.length > 1 ? `<h3>${esc(t("versions"))}</h3>${r.versions.slice(1).map((x) => `<details class="card" style="margin-bottom:6px"><summary>${esc(x.created.slice(0, 16).replace("T", " "))} · ${esc(t("why")[x.why] || x.why)}</summary>
        <div class="memory" style="margin-top:8px">${esc(x.text)}</div><div class="row"><button type="button" class="btn" data-restore="${x.id}">${esc(t("restore"))}</button></div></details>`).join("")}` : ""}`);
    $("sheet").dataset.member = id;
  }
  async function saveConds(id, list) {
    await api("members/conditions", { id, conditions: list });
    st = await api("state");
    await health(id);
  }

  // --- events -------------------------------------------------------------------------------------------------

  document.addEventListener("click", async (e) => {
    const el = e.target;
    if (el.closest("[data-close]") || el.id === "sheet") return closeSheet();
    const sn = el.closest("[data-seen]");
    if (sn) return markSeen(sn.dataset.seen);
    if (el.closest("[data-tray]")) {
      trayOpen = !trayOpen;
      try { localStorage.setItem("fhr.tray", trayOpen ? "open" : "closed"); } catch { }
      return tray();
    }
    if (el.id === "drawer") return closeDrawer();
    if (el.closest("#menuBtn")) return drawer();
    if (el.closest("#whoBtn")) return whoSheet();
    if (el.closest("#plus")) return hub();
    if (el.closest("#drawer")) closeDrawer();
    const vb = el.closest("[data-view]");
    if (vb) return go(vb.dataset.view);
    if (el.closest("[data-lang]")) {
      closeDrawer();
      lang = lang === "zh" ? "en" : "zh";
      try { localStorage.setItem("fhr.lang", lang); } catch { }
      frame();
      return render();
    }
    const p = el.closest("[data-who]");
    if (p) {
      who = Number(p.dataset.who);
      closeSheet();
      try { localStorage.setItem("fhr.member", who); } catch { }
      frame();
      return render();
    }
    const sb = el.closest("[data-sub]");
    if (sb) { sub = sb.dataset.sub || null; return render(); }
    const dy = el.closest("[data-day]");
    if (dy) { tlDay = dy.dataset.day; return render(); }
    const d = el.closest("[data-doc]");
    if (d) { e.preventDefault(); if (d.dataset.doc !== "null") openDoc(d.dataset.doc); return; }
    const a = el.closest("[data-act]");
    if (a) return docAction(a.dataset.act);
    if (el.id === "fToday") { $("fDate").value = today(); return; }
    if (el.id === "fAdd") return addFiles(pending, $("fDate").value || undefined);
    const hb = el.closest("[data-hub]");
    if (hb) { if ($("sheet").classList.contains("hidden")) hub(); return hubPanel(hb.dataset.hub); }
    const pk = el.closest("[data-pick]");
    if (pk) { pk.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === pk)); return; }
    const tp = el.closest("[data-tpl]");
    if (tp) { const x = $("eText"); x.value = (x.value ? x.value.replace(/\s*$/, "\n") : "") + t("tpl")[Number(tp.dataset.tpl)][1]; x.focus(); return; }
    const sv = el.closest("[data-save]");
    if (sv) return saveEntry(sv.dataset.save);
    if (el.id === "addMember") return memberForm();
    if (el.id === "mSave") return saveMember();
    if (el.id === "mCancel") return $("memberForm").classList.add("hidden");
    const ed = el.closest("[data-edit]");
    if (ed) return memberForm(st.members.find((m) => m.id === Number(ed.dataset.edit)));
    const hl = el.closest("[data-health]");
    if (hl) return health(Number(hl.dataset.health));
    const mid = Number($("sheet").dataset.member);
    const cm = st.members.find((m) => m.id === mid);
    const cd = el.closest("[data-cond]");
    if (cd && cm) {
      const k = cd.dataset.cond;
      return saveConds(mid, cm.conditions.some((c) => c.key === k) ? cm.conditions.filter((c) => c.key !== k) : [...cm.conditions, { key: k }]);
    }
    const cu = el.closest("[data-custom]");
    if (cu && cm) return saveConds(mid, cm.conditions.filter((c) => c.key || c.zh !== cu.dataset.custom));
    if (el.closest("[data-addcond]") && cm) { const v = $("cText").value.trim(); if (v) return saveConds(mid, [...cm.conditions, { zh: v }]); return; }
    const cc = el.closest("[data-confirmcond]");
    if (cc) { try { await api("candidates/confirm", { id: Number(cc.dataset.confirmcond) }); st = await api("state"); return health(mid); } catch (err) { return toast(err.message, true); } }
    const rs = el.closest("[data-restore]");
    if (rs) { await api("memory/restore", { member: mid, version: Number(rs.dataset.restore) }); return health(mid); }
    const dm = el.closest("[data-delmember]");
    if (dm) {
      const m = st.members.find((x) => x.id === Number(dm.dataset.delmember));
      const typed = prompt(t("delMember")(m));
      if (typed === null) return;
      try { await api("members/delete", { id: m.id, confirm: typed }); await load(); } catch (err) { toast(err.message, true); }
      return;
    }
    const im = el.closest("[data-import]");
    if (im) return importMany([Number(im.dataset.import)]);
    if (el.id === "importAll") return importMany(st.inbox.files.map((_, i) => i).filter((i) => Number(document.querySelector(`[data-member="${i}"]`)?.value)));
    const rj = el.closest("[data-reject]");
    if (rj) {
      const f = st.inbox.files[Number(rj.dataset.reject)];
      if (!confirm(`${f.name}: ${t("reject")}?`)) return;
      try { await api("inbox/reject", { folder: f.folder, name: f.name }); await load(); } catch (err) { toast(err.message, true); }
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "pick") { pickedFiles([...e.target.files]); e.target.value = ""; }
    if (e.target.id === "yearPick") render();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeDrawer(); } });
  // Files dropped anywhere on the page go to the member shown.
  document.addEventListener("dragover", (e) => { if (me() && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => { if (me() && e.dataTransfer?.files?.length) { e.preventDefault(); pickedFiles([...e.dataTransfer.files]); } });

  load().catch((e) => { $("view").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; });
})();
