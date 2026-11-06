// Home Thingy's page (app_homethingy_requirements.txt 5): home, things (search + filters, cards or rows), places,
// warranty, inbox and ask; an item opens in a side panel. Talks to its program through api/...; photos are made
// smaller here (with a small picture for the lists) before they are kept - the sandbox has no image code.
// Live: the program's pushes (EventSource "events") when a reading or an answer is done.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Photos: the long side at most MAX_SIDE (receipts stay readable), under KEEP_UNDER untouched; THUMB for the lists.
  const MAX_SIDE = 2160, KEEP_UNDER = 1 << 20, QUALITY = 0.88, MAX_FILE = 10 << 20, THUMB = 480;
  const PLACE_ICONS = ["🛋️", "🛏️", "🍳", "🛁", "📚", "📦", "🪴", "🚪", "🗄️", "🧰", "👔", "🧸", "🚗", "🏠", "🧺", "💼"];
  const FORM = ["name", "category", "place_id", "spot", "brand", "model", "serial", "quantity", "purchase_date", "price", "currency", "shop", "order_no",
    "warranty_months", "warranty_until", "tags", "notes"];

  // --- words (繁體中文 / English) ----------------------------------------------------------------------------
  const T = {
    zh: {
      sub: "家居物品清單", nav: { home: "首頁", things: "物品", places: "地方", warranty: "保養", inbox: "收件箱", ask: "問一問", more: "更多" },
      search: "搵嘢：名、牌子、型號、地方、標籤…", add: "加物品", lang: "English", currency: (c) => `貨幣 ${c}`,
      currencyAsk: "預設貨幣（三個字母，例如 HKD、USD、JPY）：",
      hello: "我屋企嘅嘢", helloSub: (n) => `記低咗 ${n} 件物品`, today: (d) => `今日 ${d}`,
      stItems: "件物品", stValue: "總值", stWarranty: "保養中", stSoon: (d) => `${d} 日內過保`, stLent: "借咗出去", stCheck: "要你檢查", stNoPlace: "未有地方",
      secCheck: "要你檢查", secBusy: (n) => `你嘅助理整理緊 ${n} 件物品`, secSoon: "保養快到期", secRecent: "最近加入", secPlaces: "地方", seeAll: "全部 →",
      emptyT: "由第一件物品開始", emptyS: "影張相，你嘅助理會幫你整理：品牌、型號、價錢、保養期。",
      steps: [["🗺️", "1. 加地方", "客廳、睡房、雜物房…一個櫃、一個箱都得，可以一層入一層。"], ["📸", "2. 影相", "物品本身、單據、保養卡、說明書；一件物品可以有幾張。"],
        ["✨", "3. AI 整理", "你嘅助理讀出資料，寫低有用提示；你檢查一下就得。"]],
      addFirst: "加第一件物品", addPlaces: "加地方",
      things: "物品", nFound: (n) => `${n} 件`, f: { category: "類別", place: "地方", status: "狀態", warranty: "保養", proof: "單據", sort: "排序" },
      any: "全部", anyStatus: "全部（唔計已唔喺度）", allStatus: "包括已唔喺度", noPlace: "未有地方",
      w: { active: "保養中", soon: "快到期", expired: "過咗保", none: "冇保養資料" }, proof: { yes: "有單據／保養卡", no: "冇單據" },
      sort: { new: "最新加入", name: "名", price: "價錢", warranty: "保養到期", bought: "購買日期" },
      onlyCheck: "只睇要檢查", clear: "清除", grid: "▦", list: "☰", exportCsv: "匯出 CSV", noMatch: "搵唔到。試吓其他字，或者清除篩選。",
      unnamed: "（未有名）", st: { queued: "排緊隊", reading: "整理緊…", needs_check: "請檢查", failed: "失敗" },
      until: (d) => `保養至 ${d}`, left: (n) => (n === 0 ? "今日到期" : `剩 ${n} 日`), ended: "過咗保", endedOn: (d) => `${d} 過咗保`, lentTo: (w) => (w ? `借咗俾 ${w}` : "借咗出去"),
      places: "地方", addPlace: "＋ 加地方", addRooms: "加常用房間", inside: "＋ 入面", edit: "修改", del: "刪除",
      placesEmpty: "未有地方。先加幾間房，之後可以喺入面再加櫃、抽屜、箱。", nItems: (n, all) => (all > n ? `${n} 件 · 連入面 ${all} 件` : `${n} 件`),
      hiddenMark: "🙈 唔俾助理睇", placeT: "地方", placeName: "名", placeIcon: "圖示", placeIn: "放喺", topLevel: "（最外層）",
      placeHidden: "唔俾助理睇呢個地方（同入面嘅嘢）", delPlace: (n) => `刪除「${n}」？入面嘅物品同地方會搬去上一層。`,
      warranty: "保養", wSoon: (d) => `${d} 日內到期`, wActive: "保養中", wExpired: "最近過咗保（一年內）", wNone: (n) => `${n} 件冇保養資料`,
      wEmpty: "未有保養資料。加單據或者保養卡嘅相，你嘅助理會讀出保養期。",
      inboxOff: "未揀收件資料夾。", inboxHow: (n) => `喺 BotGateway → 應用程式 → Home Thingy → Config → Inbox folder 揀一個資料夾（例如 iCloud Drive 入面嘅；iPhone：分享 → 儲存到「檔案」）。開個子資料夾用地方嘅名（例如「${n}」），入面嘅相就會放喺嗰個地方。`,
      inboxEmpty: "收件箱冇檔案。", importEach: (n) => `每個檔一件物品（${n}）`, importOne: (n) => `合成一件物品（${n}）`, importNote: "匯入咗嘅檔會搬去收件資料夾嘅 done/（保留原檔）。",
      reject: "搬走", rejectAsk: "搬去收件資料夾嘅 rejected/？",
      ask: "問一問", askHint: "問你嘅助理，例如「電鑽放咗喺邊？」", askGo: "問", thinking: "諗緊", askEmpty: "未問過嘢。",
      suggest: ["電鑽放咗喺邊？", "邊啲嘢今年過保？", "我借咗咩俾人？", "廚房有咩電器？", "去年喺 IKEA 買過咩？"],
      askNote: "你嘅問題同物品清單（唔包括唔俾助理睇嘅）會送去你嘅助理。",
      close: "關閉", save: "儲存", cancel: "取消", ok: "確定", itIsRight: "冇錯", readAgain: "再讀一次", hint: "俾助理嘅提示（可選），例如「單據係 2023 年嘅」",
      move: "搬去…", status: "狀態", hide: "唔俾助理睇", unhide: "俾助理睇", hidden: "🙈 唔俾助理睇", placeIsHidden: "🙈 個地方唔俾助理睇",
      delItem: "刪除呢件物品同佢嘅相同檔案？", cover: "做封面", isCover: "封面", download: "下載", open: "開啟", delFile: "刪除呢個檔？", addFiles: "加相／檔",
      busy: "你嘅助理整理緊呢件物品…", aiT: "你嘅助理整理", tipsT: "有用提示", warnT: "要留意", othersT: "呢張單仲有：", addOther: "加做物品", added: "已加",
      aiFilled: "虛線 = 由助理填，你未改過", aiDot: "由助理填，你未改過", shared: (n) => `同「${n}」共用`, newT: "新物品",
      fl: { name: "名", category: "類別", place_id: "地方", spot: "位置", brand: "牌子", model: "型號", serial: "序號", quantity: "數量", purchase_date: "購買日期",
        price: "價錢（每件）", currency: "貨幣", shop: "商店", order_no: "單號", warranty_months: "保養（月）", warranty_until: "保養到", tags: "標籤", notes: "備註", lent_to: "借咗俾", status: "狀態" },
      spotHint: "例如：頂層抽屜", tagsHint: "用逗號分開", months: (m) => (m % 12 === 0 ? `${m / 12} 年` : `${m} 個月`), wFrom: (d) => `由 ${d}`,
      addT: "加物品", addToT: (n) => `加相／檔去「${n}」`, zoneB: "揀相或者檔案", zoneS: "或者拖入嚟 - 物品本身、單據、保養卡、說明書（相片／PDF）",
      modeOne: "全部係同一件物品", modeOneS: "例如物品相 + 單據 + 保養卡", modeEach: "每個檔係一件物品", modeEachS: "例如一次過影晒成個櫃",
      optPlace: "放喺邊（可選）", optName: "名（可選）", optHint: "俾助理嘅提示（可選）", addGo: (n) => `加入 ${n} 個檔案`, manual: "唔用相，自己打",
      preparing: "準備緊…", uploading: (i, n) => `上載緊 ${i}／${n}…`, addedOk: "已加入 - 你嘅助理會整理", again: "照樣再加？",
      dropHere: "放開就加入", dropTo: (n) => `放開就加去「${n}」`, saved: "已儲存", deleted: "已刪除", none: "-",
    },
    en: {
      sub: "Home inventory", nav: { home: "Home", things: "Things", places: "Places", warranty: "Warranty", inbox: "Inbox", ask: "Ask", more: "More" },
      search: "Search: name, brand, model, place, tag…", add: "Add thing", lang: "中文", currency: (c) => `Currency ${c}`,
      currencyAsk: "Default currency (three letters, e.g. HKD, USD, JPY):",
      hello: "Our things", helloSub: (n) => `${n} thing${n === 1 ? "" : "s"} recorded`, today: (d) => `Today ${d}`,
      stItems: "things", stValue: "total value", stWarranty: "under warranty", stSoon: (d) => `warranty ends within ${d} days`, stLent: "lent out", stCheck: "to check", stNoPlace: "without a place",
      secCheck: "Please check", secBusy: (n) => `Your assistant is reading ${n} thing${n === 1 ? "" : "s"}`, secSoon: "Warranty ends soon", secRecent: "Recently added", secPlaces: "Places", seeAll: "See all →",
      emptyT: "Start with your first thing", emptyS: "Take a photo - your assistant fills in the brand, model, price and warranty.",
      steps: [["🗺️", "1. Add places", "Rooms, cupboards, drawers, boxes - places within places."], ["📸", "2. Take photos", "The thing, its receipt, warranty card, manual - several per thing."],
        ["✨", "3. Your assistant files it", "It reads the details and writes useful notes; you check them."]],
      addFirst: "Add your first thing", addPlaces: "Add places",
      things: "Things", nFound: (n) => `${n}`, f: { category: "Category", place: "Place", status: "Status", warranty: "Warranty", proof: "Receipt", sort: "Sort" },
      any: "Any", anyStatus: "All but gone", allStatus: "Including gone", noPlace: "No place",
      w: { active: "Under warranty", soon: "Ends soon", expired: "Expired", none: "No warranty" }, proof: { yes: "With receipt / card", no: "Without receipt" },
      sort: { new: "Newest", name: "Name", price: "Price", warranty: "Warranty end", bought: "Bought on" },
      onlyCheck: "To check only", clear: "Clear", grid: "▦", list: "☰", exportCsv: "Export CSV", noMatch: "Nothing found. Try other words or clear the filters.",
      unnamed: "(no name yet)", st: { queued: "waiting", reading: "reading…", needs_check: "check", failed: "failed" },
      until: (d) => `warranty to ${d}`, left: (n) => (n === 0 ? "ends today" : `${n} day${n === 1 ? "" : "s"} left`), ended: "expired", endedOn: (d) => `ended ${d}`, lentTo: (w) => (w ? `lent to ${w}` : "lent out"),
      places: "Places", addPlace: "＋ Add place", addRooms: "Add the usual rooms", inside: "＋ Inside", edit: "Edit", del: "Delete",
      placesEmpty: "No places yet. Add the rooms first, then cupboards, drawers and boxes inside them.", nItems: (n, all) => (all > n ? `${n} · ${all} with inside` : `${n}`),
      hiddenMark: "🙈 hidden from the assistant", placeT: "Place", placeName: "Name", placeIcon: "Icon", placeIn: "Inside", topLevel: "(top level)",
      placeHidden: "Hide this place (and what is in it) from the assistant", delPlace: (n) => `Delete “${n}”? Its things and places move up one level.`,
      warranty: "Warranty", wSoon: (d) => `Ending within ${d} days`, wActive: "Under warranty", wExpired: "Ended in the last year", wNone: (n) => `${n} without warranty details`,
      wEmpty: "No warranty details yet. Add a photo of a receipt or warranty card - your assistant reads the warranty.",
      inboxOff: "No inbox folder chosen.", inboxHow: (n) => `Choose a folder in BotGateway → Applications → Home Thingy → Config → Inbox folder (e.g. one in iCloud Drive: on the iPhone, Share → Save to Files). A sub-folder named like a place (e.g. "${n}") puts its photos in that place.`,
      inboxEmpty: "The inbox is empty.", importEach: (n) => `One thing per file (${n})`, importOne: (n) => `All as one thing (${n})`, importNote: "Imported files move to done/ in the inbox folder (the originals are kept).",
      reject: "Set aside", rejectAsk: "Move it to rejected/ in the inbox folder?",
      ask: "Ask", askHint: "Ask your assistant, e.g. “where is the drill?”", askGo: "Ask", thinking: "thinking", askEmpty: "Nothing asked yet.",
      suggest: ["Where is the drill?", "Which warranties end this year?", "What have I lent out?", "Which appliances are in the kitchen?", "What did we buy at IKEA last year?"],
      askNote: "Your question and the list of your things (not those hidden from the assistant) go to your assistant.",
      close: "Close", save: "Save", cancel: "Cancel", ok: "OK", itIsRight: "It is right", readAgain: "Read again", hint: "A hint for your assistant (optional), e.g. “the receipt is from 2023”",
      move: "Move to…", status: "Status", hide: "Hide from assistant", unhide: "Show to assistant", hidden: "🙈 hidden from the assistant", placeIsHidden: "🙈 its place is hidden from the assistant",
      delItem: "Delete this thing with its photos and files?", cover: "Use as cover", isCover: "Cover", download: "Download", open: "Open", delFile: "Delete this file?", addFiles: "Add photos / files",
      busy: "Your assistant is reading this thing…", aiT: "From your assistant", tipsT: "Useful notes", warnT: "Please check", othersT: "Also on this receipt:", addOther: "Add as a thing", added: "added",
      aiFilled: "Dashed = filled by your assistant, not changed by you", aiDot: "filled by your assistant, not changed by you", shared: (n) => `shared with “${n}”`, newT: "New thing",
      fl: { name: "Name", category: "Category", place_id: "Place", spot: "Spot", brand: "Brand", model: "Model", serial: "Serial no.", quantity: "Quantity", purchase_date: "Bought on",
        price: "Price (each)", currency: "Currency", shop: "Shop", order_no: "Receipt no.", warranty_months: "Warranty (months)", warranty_until: "Warranty until", tags: "Tags", notes: "Notes", lent_to: "Lent to", status: "Status" },
      spotHint: "e.g. top drawer", tagsHint: "separated by commas", months: (m) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`), wFrom: (d) => `from ${d}`,
      addT: "Add a thing", addToT: (n) => `Add photos / files to “${n}”`, zoneB: "Choose photos or files", zoneS: "or drop them here - the thing, receipts, warranty cards, manuals (photos / PDF)",
      modeOne: "All are one thing", modeOneS: "e.g. a photo of it + the receipt + the warranty card", modeEach: "Each file is its own thing", modeEachS: "e.g. photos of everything in a cupboard",
      optPlace: "Where it is (optional)", optName: "Name (optional)", optHint: "A hint for your assistant (optional)", addGo: (n) => `Add ${n} file${n === 1 ? "" : "s"}`, manual: "No photo - type it in",
      preparing: "preparing…", uploading: (i, n) => `uploading ${i} / ${n}…`, addedOk: "Added - your assistant files it", again: "Add it again anyway?",
      dropHere: "Drop to add", dropTo: (n) => `Drop to add to “${n}”`, saved: "Saved", deleted: "Deleted", none: "-",
    },
  };
  let lang = "zh";
  try { lang = localStorage.getItem("homethingy.lang") || (/^zh/i.test(navigator.language) ? "zh" : "en"); } catch { }
  const t = (k) => T[lang][k];
  const nm = (c) => (c ? c.name[lang === "zh" ? 1 : 0] : "");
  const opt = (arr) => arr[lang === "zh" ? 2 : 1];

  let st = { places: [], categories: [], kinds: [], statuses: [], rooms: [], stats: {}, currency: "HKD", soon_days: 60, inbox: { files: [] } };
  let view = "home", layout = "grid";
  const NO_FILTER = { q: "", place: "", category: "", status: "", warranty: "", proof: "", sort: "new", check: "" };
  let filt = { ...NO_FILTER };
  let panel = null, panelFile = null, editing = false, list = [];
  try { view = localStorage.getItem("homethingy.view") || "home"; layout = localStorage.getItem("homethingy.layout") || "grid"; } catch { }

  async function api(path, body) {
    const r = await fetch("api/" + path, body === undefined ? { headers: { "x-botgateway": "1" } }
      : { method: "POST", headers: { "x-botgateway": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt || r.statusText);
    return txt ? JSON.parse(txt) : null;
  }
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  function toast(msg, bad) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (bad ? " bad" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), bad ? 7000 : 2600);
  }
  const oops = (e) => toast(e.message || String(e), true);

  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const days = (d) => Math.round((Date.parse(d) - Date.parse(today())) / 86400000);
  const cat = (k) => st.categories.find((c) => c.key === k);
  const place = (id) => st.places.find((p) => p.id === id);
  const kindName = (k) => opt(st.kinds.find((x) => x[0] === k) || ["", k, k]);
  const statusName = (k) => opt(st.statuses.find((x) => x[0] === k) || ["", k, k]);
  const where = (it) => (it.place.length ? it.place.join(" › ") : t("noPlace")) + (it.spot ? ` · ${it.spot}` : "");
  function money(v, cur) {
    if (v === null || v === undefined) return "";
    try { return new Intl.NumberFormat(lang === "zh" ? "zh-HK" : "en-HK", { style: "currency", currency: cur || st.currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${cur || ""} ${v}`; }
  }
  const pic = (it, fallback = 44) => (it.cover ? `<img src="api/file?id=${it.cover}&thumb=1" alt="" loading="lazy">` : `<span style="font-size:${fallback}px">${cat(it.category)?.icon || "📦"}</span>`);
  const busy = (it) => it.ai_state === "queued" || it.ai_state === "reading";
  const needsCheck = (it) => it.ai_state === "needs_check" || it.ai_state === "failed";
  function wPill(it) {
    if (it.warranty === "none") return "";
    const n = days(it.warranty_until);
    if (it.warranty === "expired") return `<span class="wp expired">${esc(t("ended"))}</span>`;
    if (it.warranty === "soon") return `<span class="wp soon">⏳ ${esc(t("left")(n))}</span>`;
    return `<span class="wp active">🛡 ${esc(t("until")(it.warranty_until))}</span>`;
  }
  function sPill(it) {
    if (it.status === "lent") return `<span class="pill lent">${esc(t("lentTo")(it.lent_to))}</span>`;
    if (it.status === "have") return "";
    return `<span class="pill ${esc(it.status)}">${esc(statusName(it.status))}</span>`;
  }
  // How much of the warranty is left (0-100), for the meter.
  function wLeft(it) {
    const end = Date.parse(it.warranty_until), now = Date.parse(today());
    let start = it.purchase_date ? Date.parse(it.purchase_date) : null;
    if (!start && it.warranty_months) { const d = new Date(end); d.setMonth(d.getMonth() - it.warranty_months); start = d.getTime(); }
    if (!start || end <= start) return now <= end ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(((end - now) / (end - start)) * 100)));
  }
  const meter = (it, wide) => (it.warranty_until ? `<span class="meter ${esc(it.warranty)}${wide ? " wide" : ""}"><i style="width:${wLeft(it)}%"></i></span>` : "");

  // --- photos made smaller ----------------------------------------------------------------------------------

  const base64 = (blob) => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = () => no(f.error); f.readAsDataURL(blob); });
  const jpeg = (img, side, quality) => {
    const k = Math.min(1, side / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob(ok, "image/jpeg", quality));
  };
  // -> {name, media_type, data, thumb}. PDFs and small photos as they are; bigger photos (and HEIC) as JPEG, the long
  // side at most MAX_SIDE, turned upright (the canvas drops the rest of the EXIF, e.g. the place); a small JPEG for the lists.
  async function prepare(blob, name, type) {
    type = (type || blob.type || "").toLowerCase();
    const heic = /hei[cf]/.test(type) || /\.hei[cf]$/i.test(name);
    if (type === "application/pdf") {
      if (blob.size > MAX_FILE) throw new Error(`${name}: larger than 10 MB`);
      return { name, media_type: type, data: await base64(blob) };
    }
    if (!type.startsWith("image/") && !heic) throw new Error(`${name}: PDF or a photo only`);
    let img;
    try { img = await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch {
      throw new Error(`${name}: this browser can't open it${heic ? " (HEIC) - save it as JPEG on the phone (Settings → Camera → Formats → Most Compatible)" : ""}`);
    }
    const thumb = await base64(await jpeg(img, THUMB, 0.8));
    const plainType = !heic && /^image\/(jpeg|png|webp|gif)$/.test(type);
    if (plainType && blob.size < KEEP_UNDER) return { name, media_type: type, data: await base64(blob), thumb };
    const out = await jpeg(img, MAX_SIDE, QUALITY);
    // Never bigger than it was (a small, well compressed photo stays as it is).
    if (plainType && out.size >= blob.size && blob.size <= MAX_FILE) return { name, media_type: type, data: await base64(blob), thumb };
    return { name: name.replace(/\.[^.]+$/, "") + ".jpg", media_type: "image/jpeg", data: await base64(out), thumb };
  }

  // --- frame: side bar, tabs ----------------------------------------------------------------------------------

  const NAV = [["home", "🏠"], ["things", "📦"], ["places", "🗺️"], ["warranty", "🛡️"], ["inbox", "📥"], ["ask", "💬"]];
  const count = (k) => ({ things: st.stats.check, warranty: st.stats.soon, inbox: st.inbox.files.length }[k] || 0);
  function frame() {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    $("q").placeholder = t("search");
    $("addLabel").textContent = t("add");
    $("side").innerHTML = `<button type="button" class="logo" data-view="home"><img src="icon.svg" alt=""><span><b>Home Thingy</b><small>${esc(t("sub"))}</small></span></button>
      ${NAV.map(([k, i]) => `<button type="button" class="nav ${view === k ? "on" : ""}" data-view="${k}"><span class="ico">${i}</span>${esc(t("nav")[k])}${count(k) ? `<span class="count">${count(k)}</span>` : ""}</button>`).join("")}
      ${st.places.length ? `<div class="sidehead">${esc(t("places"))}</div><div class="tree">${tree().map(({ p, depth }) => `<button type="button" data-place="${p.id}" class="${view === "things" && String(filt.place) === String(p.id) ? "on" : ""}" style="padding-left:${10 + depth * 14}px">
        <span>${esc(p.icon || "▫️")}</span><span>${esc(p.name)}</span><span class="n">${p.all || ""}</span></button>`).join("")}</div>` : ""}
      <div class="sidefoot"><button type="button" class="btn sm" data-act="lang">${esc(t("lang"))}</button><button type="button" class="btn sm" data-act="currency">${esc(t("currency")(st.currency))}</button></div>`;
    const tabs = [["home", "🏠"], ["things", "📦"], ["ask", "💬"], ["places", "🗺️"], ["more", "☰"]];
    const more = ["warranty", "inbox"].includes(view);
    $("tabs").innerHTML = tabs.map(([k, i]) => `<button type="button" ${k === "more" ? 'data-act="more"' : `data-view="${k}"`} class="${view === k || (k === "more" && more) ? "on" : ""}"><span>${i}</span>${esc(t("nav")[k])}
      ${k === "more" && st.stats.soon + st.inbox.files.length ? `<i class="count">${st.stats.soon + st.inbox.files.length}</i>` : k === "things" && st.stats.check ? `<i class="count">${st.stats.check}</i>` : ""}</button>`).join("");
  }

  // The places in tree order with their depth.
  function tree(skip) {
    const kids = new Map();
    for (const p of st.places) { const k = p.parent_id || 0; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(p); }
    const out = [], seen = new Set();
    const walk = (id, depth) => {
      for (const p of (kids.get(id) || []).sort((a, b) => a.name.localeCompare(b.name))) {
        if (seen.has(p.id) || p.id === skip) continue;
        seen.add(p.id); out.push({ p, depth }); walk(p.id, depth + 1);
      }
    };
    walk(0, 0);
    // A parent that is gone (never: deleting moves children up) - shown at the top anyway.
    for (const p of st.places) if (!seen.has(p.id) && p.id !== skip && !place(p.parent_id)) out.push({ p, depth: 0 });
    return out;
  }
  const placeOptions = (sel, skip, empty) => `<option value="">${esc(empty ?? t("noPlace"))}</option>` + tree(skip).map(({ p, depth }) =>
    `<option value="${p.id}" ${String(sel) === String(p.id) ? "selected" : ""}>${"\u00a0\u00a0".repeat(depth)}${depth ? "└ " : ""}${esc(p.icon ? p.icon + " " : "")}${esc(p.name)}</option>`).join("");

  function go(v) {
    view = v;
    try { localStorage.setItem("homethingy.view", v); } catch { }
    closeSheet();
    frame();
    render();
    window.scrollTo(0, 0);
  }

  async function load() {
    try {
      st = await api(`state?lang=${lang}`);
      frame();
      await render();
    } catch (e) { $("view").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
  }

  // Readings and answers come as pushes; while some are waiting, the page also looks again every few seconds.
  let poll = null, again = null;
  function refresh() {
    clearTimeout(again);
    again = setTimeout(async () => {
      try { st = await api(`state?lang=${lang}`); } catch { return; }
      frame();
      if (!$("sheet").classList.contains("hidden") && view === "inbox") return;
      render(true);
    }, 300);
  }
  function watch() {
    clearTimeout(poll);
    if (st.stats.busy) poll = setTimeout(() => { refresh(); watch(); }, 5000);
  }

  // --- views --------------------------------------------------------------------------------------------------

  async function render(quiet) {
    const v = $("view");
    try {
      if (view === "things") await things(v, quiet);
      else if (view === "places") placesView(v);
      else if (view === "warranty") await warranty(v);
      else if (view === "inbox") inbox(v);
      else if (view === "ask") await askView(v, quiet);
      else await home(v);
    } catch (e) { v.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
    if (panel && !editing && quiet) openItem(panel.id, true);
    watch();
  }

  function card(it) {
    const c = cat(it.category);
    const badge = busy(it) ? `<span class="badge busy">${esc(t("st")[it.ai_state])}</span>` : needsCheck(it) ? `<span class="badge check">${esc(t("st")[it.ai_state])}</span>` : "";
    return `<button type="button" class="card ${it.status === "gone" ? "gone" : ""}" data-item="${it.id}">
      <div class="pic">${pic(it)}${busy(it) ? '<i class="shim"></i>' : ""}${c ? `<span class="tag">${c.icon} ${esc(nm(c))}</span>` : ""}${badge}</div>
      <div class="body"><div class="name">${esc(it.name || t("unnamed"))}</div><div class="where">📍 ${esc(where(it))}</div>
        <div class="foot">${sPill(it) || wPill(it)}<span class="price">${esc(money(it.price, it.currency))}${it.quantity > 1 ? ` ×${it.quantity}` : ""}</span></div></div></button>`;
  }
  function rowItem(it, extra = "") {
    const c = cat(it.category);
    return `<button type="button" class="rowi" data-item="${it.id}"><span class="th">${pic(it, 24)}</span>
      <span><b>${esc(it.name || t("unnamed"))}</b>${needsCheck(it) ? ` <span class="pill bad">${esc(t("st")[it.ai_state])}</span>` : busy(it) ? ` <span class="pill ai">${esc(t("st")[it.ai_state])}</span>` : ""}
        <div class="sub">${c ? `${c.icon} ${esc(nm(c))} · ` : ""}📍 ${esc(where(it))}${it.brand ? ` · ${esc(it.brand)}` : ""}${it.model ? ` ${esc(it.model)}` : ""}</div></span>
      <span class="end">${extra || `${sPill(it)}${wPill(it)}<span class="muted">${esc(money(it.price, it.currency))}</span>`}</span></button>`;
  }

  async function home(v) {
    const s = st.stats;
    if (!s.items && !s.busy && !s.check) {
      v.innerHTML = `<div class="empty"><div class="big">🏡</div><h2>${esc(t("emptyT"))}</h2><p class="muted">${esc(t("emptyS"))}</p>
        <div class="steps">${t("steps").map(([i, a, b]) => `<div><span style="font-size:24px">${i}</span><b>${esc(a)}</b><span class="muted small">${esc(b)}</span></div>`).join("")}</div>
        <div class="row" style="justify-content:center;margin-top:18px"><button type="button" class="btn primary" data-act="add">📸 ${esc(t("addFirst"))}</button>
        <button type="button" class="btn" data-view="places">🗺️ ${esc(t("addPlaces"))}</button></div></div>`;
      return;
    }
    const [chk, soon, recent] = await Promise.all([
      s.check ? api("items?check=1&status=all&limit=12") : { items: [] },
      s.soon ? api("items?warranty=soon&sort=warranty&limit=8") : { items: [] },
      api("items?sort=new&limit=10&status=all"),
    ]);
    const value = (s.value || []).slice(0, 2).map((x) => money(x.total, x.currency)).join(" + ") || money(0);
    v.innerHTML = `<div class="hello"><div><h1>${esc(t("hello"))}</h1><p>${esc(t("helloSub")(s.items))} · ${esc(t("today")(today()))}</p></div></div>
      <div class="stats">
        <button type="button" class="stat hero" data-view="things"><b>${s.items}</b><span>${esc(t("stItems"))}</span></button>
        <button type="button" class="stat money" data-view="things"><b>${esc(value)}</b><span>${esc(t("stValue"))}</span></button>
        <button type="button" class="stat" data-filter-go="warranty=active"><b>${s.warranty}</b><span>${esc(t("stWarranty"))}</span></button>
        <button type="button" class="stat soon" data-view="warranty"><b>${s.soon}</b><span>${esc(t("stSoon")(st.soon_days))}</span></button>
        ${s.lent ? `<button type="button" class="stat info" data-filter-go="status=lent"><b>${s.lent}</b><span>${esc(t("stLent"))}</span></button>` : ""}
        ${s.check ? `<button type="button" class="stat bad" data-filter-go="check=1"><b>${s.check}</b><span>${esc(t("stCheck"))}</span></button>` : ""}
        ${s.no_place ? `<button type="button" class="stat" data-filter-go="place=none"><b>${s.no_place}</b><span>${esc(t("stNoPlace"))}</span></button>` : ""}
      </div>
      ${s.busy ? `<p class="note ai" style="margin-top:18px">✨ <span class="dots">${esc(t("secBusy")(s.busy))}</span></p>` : ""}
      ${chk.items.length ? `<h2>⚠️ ${esc(t("secCheck"))}<a class="more" data-filter-go="check=1">${esc(t("seeAll"))}</a></h2><div class="cards">${chk.items.map(card).join("")}</div>` : ""}
      ${soon.items.length ? `<h2>⏳ ${esc(t("secSoon"))}<a class="more" data-view="warranty">${esc(t("seeAll"))}</a></h2>
        <div class="rows">${soon.items.map((it) => rowItem(it, `${wPill(it)}${meter(it)}`)).join("")}</div>` : ""}
      <h2>🆕 ${esc(t("secRecent"))}<a class="more" data-view="things">${esc(t("seeAll"))}</a></h2><div class="cards">${recent.items.map(card).join("")}</div>
      ${st.places.length ? `<h2>🗺️ ${esc(t("secPlaces"))}<a class="more" data-view="places">${esc(t("seeAll"))}</a></h2>
        <div class="places">${st.places.filter((p) => !p.parent_id).map((p) => `<button type="button" class="place" data-place="${p.id}"><span class="pi">${esc(p.icon || "🏠")}</span><b>${esc(p.name)}</b><span>${esc(t("nItems")(p.items, p.all))}</span></button>`).join("")}</div>` : ""}`;
  }

  function chip(key, options, label) {
    const on = filt[key] !== "" && !(key === "sort" && filt.sort === "new");
    const shown = options.find(([k]) => String(k) === String(filt[key]))?.[1] ?? options[0][1];
    return `<label class="chip ${on ? "on" : ""}"><span class="k">${esc(label)}</span> ${esc(shown)} ▾<select data-filter="${key}">${options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(filt[key]) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  }

  async function things(v, quiet) {
    const r = await api("items?" + qs(filt));
    list = r.items;
    const f = t("f");
    const any = Object.keys(NO_FILTER).some((k) => k !== "q" && filt[k] !== NO_FILTER[k]);
    const scroll = window.scrollY;
    v.innerHTML = `<div class="hello"><div><h1>${esc(t("things"))} <span class="muted" style="font-size:18px">${esc(t("nFound")(list.length))}</span></h1></div>
        <div class="row"><span class="seg"><button type="button" class="${layout === "grid" ? "on" : ""}" data-layout="grid">${t("grid")}</button><button type="button" class="${layout === "list" ? "on" : ""}" data-layout="list">${t("list")}</button></span>
        <button type="button" class="btn sm" data-act="csv" ${list.length ? "" : "disabled"}>⬇︎ ${esc(t("exportCsv"))}</button></div></div>
      <div class="chips">
        ${chip("category", [["", t("any")], ...st.categories.map((c) => [c.key, `${c.icon} ${nm(c)}`])], f.category)}
        ${chip("place", [["", t("any")], ["none", t("noPlace")], ...tree().map(({ p, depth }) => [p.id, `${"\u00a0\u00a0".repeat(depth)}${p.icon || ""} ${p.name}`])], f.place)}
        ${chip("status", [["", t("anyStatus")], ["all", t("allStatus")], ...st.statuses.map((s) => [s[0], opt(s)])], f.status)}
        ${chip("warranty", [["", t("any")], ...Object.entries(t("w"))], f.warranty)}
        ${chip("proof", [["", t("any")], ...Object.entries(t("proof"))], f.proof)}
        ${chip("sort", Object.entries(t("sort")), f.sort)}
        ${st.stats.check || filt.check ? `<button type="button" class="chip ${filt.check ? "on" : ""}" data-act="check">⚠️ ${esc(t("onlyCheck"))}</button>` : ""}
        ${any || filt.q ? `<button type="button" class="btn ghost sm" data-act="clear">✕ ${esc(t("clear"))}</button>` : ""}
      </div>
      ${list.length ? (layout === "list" ? `<div class="rows">${list.map((it) => rowItem(it)).join("")}</div>` : `<div class="cards">${list.map(card).join("")}</div>`)
        : st.stats.items || st.stats.busy ? `<div class="empty"><div class="big">🔍</div><p class="muted">${esc(t("noMatch"))}</p></div>`
          : `<div class="empty"><div class="big">📦</div><h2>${esc(t("emptyT"))}</h2><p class="muted">${esc(t("emptyS"))}</p><button type="button" class="btn primary" data-act="add">📸 ${esc(t("addFirst"))}</button></div>`}`;
    if (quiet) window.scrollTo(0, scroll);
  }

  function placesView(v) {
    const rooms = st.rooms.filter((r) => !st.places.some((p) => !p.parent_id && (p.name === r[1] || p.name === r[2])));
    v.innerHTML = `<div class="hello"><div><h1>${esc(t("places"))}</h1></div><div class="row"><button type="button" class="btn primary" data-act="place">${esc(t("addPlace"))}</button></div></div>
      ${rooms.length ? `<div class="chips"><span class="muted small">${esc(t("addRooms"))}:</span>${rooms.map((r) => `<button type="button" class="chip" data-room="${r[0]}">${r[3]} ${esc(opt(r))}</button>`).join("")}</div>` : ""}
      ${st.places.length ? `<div class="ptree">${tree().map(({ p, depth }) => `<div class="prow">
          ${depth ? `<span class="indent">${"   ".repeat(depth - 1)}└─</span>` : ""}
          <button type="button" class="pn" data-place="${p.id}"><span style="font-size:20px">${esc(p.icon || "▫️")}</span><b>${esc(p.name)}</b>
            <span class="muted small">${esc(t("nItems")(p.items, p.all))}</span>${p.hidden ? `<span class="pill">${esc(t("hiddenMark"))}</span>` : ""}</button>
          <span class="acts"><button type="button" class="btn sm ghost" data-act="place" data-parent="${p.id}">${esc(t("inside"))}</button>
            <button type="button" class="btn sm ghost" data-act="place" data-id="${p.id}">${esc(t("edit"))}</button></span></div>`).join("")}</div>`
        : `<div class="empty"><div class="big">🗺️</div><p class="muted">${esc(t("placesEmpty"))}</p></div>`}`;
  }

  async function warranty(v) {
    const withW = await api("items?sort=warranty");
    const year = new Date(Date.parse(today()) - 365 * 86400000).toISOString().slice(0, 10);
    const g = { soon: [], active: [], expired: [] };
    for (const it of withW.items) if (it.warranty !== "none" && (it.warranty !== "expired" || it.warranty_until >= year)) g[it.warranty].push(it);
    g.expired.reverse();
    const noneN = st.stats.items - withW.items.filter((it) => it.warranty !== "none").length;
    const block = (k, title) => (g[k].length ? `<h2>${title}</h2><div class="rows">${g[k].map((it) => rowItem(it, `${wPill(it)}${meter(it)}`)).join("")}</div>` : "");
    v.innerHTML = `<div class="hello"><div><h1>${esc(t("warranty"))}</h1></div></div>
      ${g.soon.length + g.active.length + g.expired.length ? `${block("soon", `⏳ ${esc(t("wSoon")(st.soon_days))}`)}${block("active", `🛡 ${esc(t("wActive"))}`)}${block("expired", `⌛ ${esc(t("wExpired"))}`)}`
        : `<div class="empty"><div class="big">🛡️</div><p class="muted">${esc(t("wEmpty"))}</p></div>`}
      ${noneN > 0 ? `<p style="margin-top:18px"><a data-filter-go="warranty=none">${esc(t("wNone")(noneN))} →</a></p>` : ""}`;
  }

  // The inbox files the owner unticked (all are ticked at first).
  let skips = new Set();
  const ticked = () => st.inbox.files.filter((f) => !skips.has(key(f)));
  function inbox(v) {
    const ib = st.inbox;
    const example = st.places.find((p) => !p.parent_id)?.name || (lang === "zh" ? "客廳" : "Living room");
    if (!ib.available) { v.innerHTML = `<div class="hello"><h1>${esc(t("nav").inbox)}</h1></div><div class="note">${esc(t("inboxOff"))} ${esc(t("inboxHow")(example))}</div>`; return; }
    const n = ticked().length;
    v.innerHTML = `<div class="hello"><div><h1>${esc(t("nav").inbox)}</h1><p class="muted small">${esc(t("inboxHow")(example))}</p></div></div>
      ${ib.files.length ? `<div class="rows" style="margin-bottom:14px">${ib.files.map((f, i) => `<div class="ib">
          <input type="checkbox" data-pick="${i}" ${skips.has(key(f)) ? "" : "checked"}>
          <span><b>${esc(f.name)}</b><div class="muted small">${f.folder ? `📁 ${esc(f.folder)} · ` : ""}${Math.round(f.size / 1024)} KB</div></span>
          <select data-ibplace="${i}">${placeOptions(f.place_id ?? "")}</select>
          <span class="row"><button type="button" class="btn sm ghost danger" data-act="reject" data-i="${i}">${esc(t("reject"))}</button></span></div>`).join("")}</div>
        <div class="row"><button type="button" class="btn primary" data-act="import" data-mode="each" ${n ? "" : "disabled"}>${esc(t("importEach")(n))}</button>
          <button type="button" class="btn" data-act="import" data-mode="one" ${n > 1 ? "" : "disabled"}>${esc(t("importOne")(n))}</button></div>
        <p class="muted small">${esc(t("importNote"))}</p><div id="ibProgress"></div>`
        : `<div class="empty"><div class="big">📥</div><p class="muted">${esc(t("inboxEmpty"))}</p></div>`}`;
  }
  const key = (f) => `${f.folder}/${f.name}`;

  async function askView(v, quiet) {
    const r = await api("asks");
    const keep = quiet && $("askIn") ? $("askIn").value : "";
    v.innerHTML = `<div class="hello"><div><h1>💬 ${esc(t("ask"))}</h1><p class="muted small">${esc(t("askNote"))}</p></div></div>
      <form class="askbox" id="askForm"><input id="askIn" maxlength="500" placeholder="${esc(t("askHint"))}" autocomplete="off"><button type="submit" class="btn primary">${esc(t("askGo"))}</button></form>
      <div class="suggest">${t("suggest").map((s) => `<button type="button" class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      ${r.asks.length ? r.asks.map((a) => `<div class="qa"><div class="qq">💬 <span>${esc(a.question)}</span><button type="button" class="btn sm ghost" data-act="unask" data-id="${a.id}">✕</button></div>
        ${a.state === "asking" ? `<div class="aa muted"><span class="dots">${esc(t("thinking"))}</span></div>` : a.state === "failed" ? `<div class="aa note bad">${esc(a.reason || "")}</div>`
          : `<div class="aa">${esc(a.answer)}</div>${a.items.length ? `<div class="its">${a.items.map((it) => `<button type="button" class="mini" data-item="${it.id}"><span class="th">${pic(it, 15)}</span><span>${esc(it.name)} · ${esc(where(it))}</span></button>`).join("")}</div>` : ""}`}</div>`).join("")
        : `<p class="muted" style="margin-top:18px">${esc(t("askEmpty"))}</p>`}`;
    if (keep) $("askIn").value = keep;
    clearTimeout(askView.timer);
    if (r.asks.some((a) => a.state === "asking")) askView.timer = setTimeout(() => view === "ask" && render(true), 4000);
  }

  // --- the item's panel ----------------------------------------------------------------------------------------

  async function openItem(id, quiet) {
    try {
      const it = await api(`item?id=${id}`);
      if (!quiet || !panel || panel.id !== it.id) { editing = false; panelFile = null; }
      panel = it;
      drawPanel();
    } catch (e) { if (!quiet) oops(e); else closePanel(); }
  }
  function closePanel() { panel = null; editing = false; $("panel").classList.add("hidden"); document.body.classList.remove("locked"); }

  function drawPanel() {
    const it = panel;
    if (editing) return drawEdit(it);
    const c = cat(it.category);
    const f = it.files.find((x) => x.id === panelFile) || it.files.find((x) => x.id === it.cover) || it.files[0];
    panelFile = f?.id ?? null;
    const ai = (k) => (it[k] !== null && it[k] !== undefined && it[k] !== "" && !(Array.isArray(it[k]) && !it[k].length) && !it.owner_fields.includes(k) ? '<span class="aidot" title="AI"></span>' : "");
    const fact = (k, val, wide) => (val === null || val === undefined || val === "" ? "" : `<div class="${wide ? "wide" : ""}"><dt>${esc(t("fl")[k])}${ai(k)}</dt><dd>${val}</dd></div>`);
    const stage = !f ? `<div class="doc"><div>${c?.icon || "📦"}</div><button type="button" class="btn sm" data-act="addto">＋ ${esc(t("addFiles"))}</button></div>`
      : f.media_type.startsWith("image/") ? `<img src="api/file?id=${f.id}" alt="">`
        : `<div class="doc"><div>📄</div><b>${esc(f.name)}</b><p><a class="btn sm" href="api/file?id=${f.id}" target="_blank" rel="noopener">${esc(t("open"))}</a></p></div>`;
    const facts = [fact("brand", esc(it.brand)), fact("model", esc(it.model)), fact("serial", it.serial ? `<code>${esc(it.serial)}</code>` : ""),
      fact("quantity", it.quantity > 1 ? it.quantity : ""), fact("purchase_date", esc(it.purchase_date)), fact("price", esc(money(it.price, it.currency))),
      fact("shop", esc(it.shop)), fact("order_no", esc(it.order_no)), fact("spot", esc(it.spot)),
      fact("tags", it.tags.length ? it.tags.map((x) => `<span class="pill">${esc(x)}</span>`).join(" ") : "", true), fact("notes", esc(it.notes).replace(/\n/g, "<br>"), true)].join("");
    $("panelBox").innerHTML = `<div class="phead"><button type="button" class="x" data-act="pclose" aria-label="${esc(t("close"))}">✕</button><span style="flex:1"></span>
        <button type="button" class="btn sm" data-act="edit">✎ ${esc(t("edit"))}</button></div>
      <div class="pbody">
        <div class="stage">${stage}</div>
        <div class="strip">${it.files.map((x) => `<button type="button" class="${x.id === panelFile ? "on" : ""}" data-file="${x.id}">${x.media_type.startsWith("image/") ? `<img src="api/file?id=${x.id}&thumb=1" alt="">` : "📄"}<small>${esc(kindName(x.kind))}</small></button>`).join("")}
          <button type="button" class="plus" data-act="addto" title="${esc(t("addFiles"))}">＋</button></div>
        ${f ? `<div class="fileacts"><select data-kind="${f.id}">${st.kinds.map((k) => `<option value="${k[0]}" ${k[0] === f.kind ? "selected" : ""}>${esc(opt(k))}</option>`).join("")}</select>
          ${f.media_type.startsWith("image/") ? (f.id === it.cover ? `<span class="pill">★ ${esc(t("isCover"))}</span>` : `<button type="button" class="btn sm" data-act="cover" data-id="${f.id}">★ ${esc(t("cover"))}</button>`) : ""}
          <a class="btn sm" href="api/file?id=${f.id}&download=1">⬇︎ ${esc(t("download"))}</a>
          <button type="button" class="btn sm ghost danger" data-act="delfile" data-id="${f.id}">${esc(t("del"))}</button>
          ${f.shared.length ? `<span class="muted small">${esc(t("shared")(f.shared.map((x) => x.name).join("」「")))}</span>` : ""}</div>` : ""}
        <h1 style="margin-top:16px">${esc(it.name || t("unnamed"))}</h1>
        <div class="crumbs">${c ? `<span class="pill" style="background:var(--tag);color:var(--tag-ink)">${c.icon} ${esc(nm(c))}</span>` : ""}
          <button type="button" class="pill" data-act="move" style="border:0;cursor:pointer">📍 ${esc(where(it))}</button>${sPill(it)}
          ${it.hidden ? `<span class="pill">${esc(t("hidden"))}</span>` : it.place_hidden ? `<span class="pill">${esc(t("placeIsHidden"))}</span>` : ""}</div>
        ${busy(it) ? `<div class="note ai">✨ <span class="dots">${esc(t("busy"))}</span></div>` : ""}
        ${needsCheck(it) ? `<div class="note bad"><b>⚠️ ${esc(t("st")[it.ai_state])}</b> - ${esc(it.ai_reason || "")}
          <div class="row" style="margin-top:8px">${it.ai_state === "needs_check" ? `<button type="button" class="btn sm primary" data-act="confirm">✓ ${esc(t("itIsRight"))}</button>` : ""}
          <button type="button" class="btn sm" data-act="edit">✎ ${esc(t("edit"))}</button><button type="button" class="btn sm" data-act="reread">↻ ${esc(t("readAgain"))}</button></div></div>` : ""}
        ${it.warranty_until || it.warranty_months ? `<div class="wcard"><div class="top2"><b>🛡 ${esc(t("warranty"))}${it.warranty_months ? ` · ${esc(t("months")(it.warranty_months))}` : ""}</b>${wPill(it)}</div>
          ${meter(it, true)}<div class="row muted small" style="justify-content:space-between;margin-top:6px"><span>${it.purchase_date ? esc(t("wFrom")(it.purchase_date)) : ""}</span><span>${it.warranty_until ? esc(it.warranty_until) : ""}</span></div></div>` : ""}
        ${facts ? `<dl class="facts">${facts}</dl>` : ""}
        ${it.summary || it.tips.length || it.warnings.length ? `<div class="note ai" style="margin-top:14px"><b>✨ ${esc(t("aiT"))}</b>${it.summary ? `<div style="margin-top:4px">${esc(it.summary)}</div>` : ""}
          ${it.tips.length ? `<h3>💡 ${esc(t("tipsT"))}</h3><ul class="tips">${it.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${it.warnings.length ? `<h3>⚠️ ${esc(t("warnT"))}</h3><ul class="tips">${it.warnings.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>` : ""}
        ${it.others.length ? `<h3>🧾 ${esc(t("othersT"))}</h3><div class="others">${it.others.map((o, i) => `<div><span>${esc(cat(o.category)?.icon || "📦")} ${esc(o.name)}${o.quantity > 1 ? ` ×${o.quantity}` : ""}${o.price != null ? ` · ${esc(money(o.price, it.currency))}` : ""}</span>
          ${o.added ? `<button type="button" class="btn sm ghost" data-item="${o.added}">✓ ${esc(t("added"))}</button>` : `<button type="button" class="btn sm" data-act="other" data-i="${i}">＋ ${esc(t("addOther"))}</button>`}</div>`).join("")}</div>` : ""}
        ${it.files.length || it.name ? `<p class="muted small" style="margin-top:14px"><span class="aidot"></span> = ${esc(t("aiDot"))}</p>` : ""}
        <div class="pfoot">
          <button type="button" class="btn" data-act="reread" ${busy(it) ? "disabled" : ""}>↻ ${esc(t("readAgain"))}</button>
          <button type="button" class="btn" data-act="move">📍 ${esc(t("move"))}</button>
          <button type="button" class="btn" data-act="status">${esc(t("status"))}: ${esc(statusName(it.status))}</button>
          <button type="button" class="btn" data-act="hide">${esc(it.hidden ? t("unhide") : t("hide"))}</button>
          <button type="button" class="btn danger" data-act="delitem">${esc(t("del"))}</button>
        </div>
      </div>`;
    $("panel").classList.remove("hidden");
    document.body.classList.add("locked");
  }

  function drawEdit(it) {
    const fl = t("fl");
    const val = (k) => (it[k] === null || it[k] === undefined ? "" : k === "tags" ? it[k].join(", ") : it[k]);
    const ai = (k) => (val(k) !== "" && it.id && !it.owner_fields.includes(k) ? " ai" : "");
    const input = (k, type = "text", extra = "") => `<label class="f${ai(k)}">${esc(fl[k])}<input name="${k}" type="${type}" value="${esc(val(k))}" ${extra}></label>`;
    $("panelBox").innerHTML = `<div class="phead"><button type="button" class="x" data-act="${it.id ? "unedit" : "pclose"}" aria-label="${esc(t("close"))}">✕</button><b style="flex:1">${esc(it.id ? it.name || t("unnamed") : t("newT"))}</b></div>
      <form class="pbody stack" id="editForm">
        ${input("name", "text", 'required maxlength="160"')}
        <div class="grid2"><label class="f${ai("category")}">${esc(fl.category)}<select name="category"><option value="">-</option>${st.categories.map((c) => `<option value="${c.key}" ${c.key === it.category ? "selected" : ""}>${c.icon} ${esc(nm(c))}</option>`).join("")}</select></label>
          <label class="f${ai("place_id")}">${esc(fl.place_id)}<select name="place_id">${placeOptions(it.place_id ?? "")}</select></label></div>
        ${input("spot", "text", `placeholder="${esc(t("spotHint"))}"`)}
        <div class="grid2">${input("brand")}${input("model")}</div>
        <div class="grid2">${input("serial")}${input("quantity", "number", 'min="1" max="9999"')}</div>
        <div class="grid3">${input("price", "number", 'min="0" step="0.01"')}${input("currency", "text", 'maxlength="3" style="text-transform:uppercase"')}${input("purchase_date", "date", `max="${today()}"`)}</div>
        <div class="grid2">${input("shop")}${input("order_no")}</div>
        <div class="grid2">${input("warranty_months", "number", 'min="0" max="600"')}${input("warranty_until", "date")}</div>
        ${input("tags", "text", `placeholder="${esc(t("tagsHint"))}"`)}
        <label class="f">${esc(fl.notes)}<textarea name="notes" rows="3">${esc(val("notes"))}</textarea></label>
        ${it.id ? `<p class="muted small">${esc(t("aiFilled"))}</p>` : ""}
        <div class="row"><button type="submit" class="btn primary">${esc(t("save"))}</button><button type="button" class="btn" data-act="${it.id ? "unedit" : "pclose"}">${esc(t("cancel"))}</button></div>
      </form>`;
    $("panel").classList.remove("hidden");
    document.body.classList.add("locked");
    $("editForm").elements.name.focus();
  }

  async function saveEdit(form) {
    const fields = {};
    for (const k of FORM) fields[k] = form.elements[k].value.trim();
    fields.tags = fields.tags ? fields.tags.split(/[,，、]/).map((x) => x.trim()).filter(Boolean) : [];
    fields.place_id = fields.place_id ? Number(fields.place_id) : null;
    try {
      const it = await api("items", panel.id ? { id: panel.id, fields } : { fields });
      panel = it; editing = false; drawPanel(); toast(t("saved")); refresh();
    } catch (e) { oops(e); }
  }

  // --- sheets: add, place, move, status, read again ---------------------------------------------------------

  function sheet(html) { $("sheetBox").innerHTML = html; $("sheet").classList.remove("hidden"); }
  function closeSheet() { $("sheet").classList.add("hidden"); $("sheetBox").innerHTML = ""; picked.forEach((p) => p.url && URL.revokeObjectURL(p.url)); picked = []; }
  const head = (title) => `<div class="sheethead"><h2>${esc(title)}</h2><button type="button" class="btn ghost" data-close>✕</button></div>`;

  let picked = [], addTo = null, mode = "one";
  function addSheet(files = [], to = null) {
    closeSheet();
    addTo = to; mode = "one";
    picked = [...files].map((f) => ({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }));
    drawAdd();
  }
  function drawAdd() {
    const n = picked.length;
    const was = { place: $("addPlace")?.value, name: $("addName")?.value, hint: $("addHint")?.value };
    sheet(`${head(addTo ? t("addToT")(addTo.name || t("unnamed")) : t("addT"))}
      <label class="zone" id="zone"><span class="big">📸</span><b>${esc(t("zoneB"))}</b><span class="muted small">${esc(t("zoneS"))}</span>
        <input type="file" id="pick" multiple accept="image/*,.heic,.heif,application/pdf" class="hidden"></label>
      ${n ? `<div class="picked">${picked.map((p, i) => `<div>${p.url ? `<img src="${p.url}" alt="">` : "📄"}<button type="button" data-unpick="${i}">✕</button></div>`).join("")}</div>` : ""}
      <div class="stack" style="margin-top:12px">
        ${n > 1 && !addTo ? `<div class="opts"><label class="opt"><input type="radio" name="mode" value="one" ${mode === "one" ? "checked" : ""}><span><b>${esc(t("modeOne"))}</b><small>${esc(t("modeOneS"))}</small></span></label>
          <label class="opt"><input type="radio" name="mode" value="each" ${mode === "each" ? "checked" : ""}><span><b>${esc(t("modeEach"))}</b><small>${esc(t("modeEachS"))}</small></span></label></div>` : ""}
        ${addTo ? "" : `<label class="f">${esc(t("optPlace"))}<select id="addPlace">${placeOptions(filt.place && filt.place !== "none" ? filt.place : "")}</select></label>`}
        ${addTo || mode === "each" ? "" : `<label class="f">${esc(t("optName"))}<input id="addName" maxlength="160"></label>`}
        <label class="f">${esc(t("optHint"))}<input id="addHint" maxlength="1000"></label>
        <div class="row"><button type="button" class="btn primary" data-act="upload" ${n ? "" : "disabled"}>${esc(t("addGo")(n))}</button>
          ${addTo ? "" : `<button type="button" class="link" data-act="manual">✎ ${esc(t("manual"))}</button>`}</div>
        <div id="addProgress"></div>
      </div>`);
    if (was.place !== undefined && $("addPlace")) $("addPlace").value = was.place;
    if (was.name && $("addName")) $("addName").value = was.name;
    if (was.hint) $("addHint").value = was.hint;
  }

  function progress(el, i, n, label) {
    if ($(el)) $(el).innerHTML = `<div class="muted small">${esc(label)}</div><div class="progress"><i style="width:${Math.round((i / n) * 100)}%"></i></div>`;
  }

  // One file sent (asks once about a duplicate); -> the item, or null when it was not added.
  async function send(path, body) {
    try { return await api(path, body); } catch (e) {
      if (!e.message.startsWith("DUPLICATE")) throw e;
      if (!confirm(`${e.message.replace(/^DUPLICATE:\s*/, "")}\n${t("again")}`)) return null;
      return api(path, { ...body, force: true });
    }
  }

  async function doUpload() {
    const files = picked.map((p) => p.file), n = files.length;
    const one = !!addTo || mode === "one" || n === 1;
    const place = $("addPlace")?.value || null, name = $("addName")?.value.trim() || null, hint = $("addHint").value.trim() || null;
    document.querySelectorAll("#sheetBox button").forEach((b) => (b.disabled = true));
    let item = addTo?.id || null, readDone = false, ok = 0;
    for (let i = 0; i < n; i++) {
      progress("addProgress", i, n, t("uploading")(i + 1, n));
      try {
        const prep = await prepare(files[i], files[i].name, files[i].type);
        const last = i === n - 1;
        const body = one ? { item_id: item, files: [prep], place_id: item ? undefined : place, name: item ? undefined : name, hint: i === 0 ? hint : undefined, read: last }
          : { files: [prep], place_id: place, hint, read: true };
        const it = await send("upload", body);
        if (!it) continue;
        ok++;
        if (one) { item = it.id; readDone = last; }
      } catch (e) { oops(e); }
    }
    // The last file failed: the item is read with what came.
    if (one && item && ok && !readDone) await api("items/read", { id: item }).catch(oops);
    closeSheet();
    if (ok) toast(t("addedOk"));
    await load();
    if (one && item && ok) openItem(item);
  }

  function placeSheet(id, parent) {
    const p = id ? place(id) : { name: "", icon: "", parent_id: parent || null, hidden: false };
    let icon = p.icon || "";
    sheet(`${head(id ? `${t("edit")} · ${p.name}` : t("addPlace").replace(/^＋\s*/, ""))}
      <form class="stack" id="placeForm">
        <label class="f">${esc(t("placeName"))}<input name="name" required maxlength="60" value="${esc(p.name)}"></label>
        <div><label class="f">${esc(t("placeIcon"))}<input name="icon" maxlength="8" value="${esc(icon)}" style="width:90px"></label>
          <div class="emojis">${PLACE_ICONS.map((e) => `<button type="button" data-emoji="${e}" class="${e === icon ? "on" : ""}">${e}</button>`).join("")}</div></div>
        <label class="f">${esc(t("placeIn"))}<select name="parent_id">${placeOptions(p.parent_id ?? "", id, t("topLevel"))}</select></label>
        <label class="check"><input type="checkbox" name="hidden" ${p.hidden ? "checked" : ""}> ${esc(t("placeHidden"))}</label>
        <div class="row"><button type="submit" class="btn primary">${esc(t("save"))}</button>${id ? `<button type="button" class="btn danger" data-act="delplace" data-id="${id}">${esc(t("del"))}</button>` : ""}</div>
      </form>`);
    $("placeForm").dataset.id = id || "";
    $("placeForm").elements.name.focus();
  }
  function moveSheet() {
    sheet(`${head(t("move"))}<form class="stack" id="moveForm"><label class="f">${esc(t("fl").place_id)}<select name="place_id">${placeOptions(panel.place_id ?? "")}</select></label>
      <label class="f">${esc(t("fl").spot)}<input name="spot" value="${esc(panel.spot || "")}" placeholder="${esc(t("spotHint"))}" maxlength="160"></label>
      <div class="row"><button type="submit" class="btn primary">${esc(t("save"))}</button></div></form>`);
  }
  function statusSheet() {
    sheet(`${head(t("status"))}<form class="stack" id="statusForm"><div class="opts">${st.statuses.map((s) => `<label class="opt"><input type="radio" name="status" value="${s[0]}" ${s[0] === panel.status ? "checked" : ""}><span><b>${esc(opt(s))}</b></span></label>`).join("")}</div>
      <label class="f">${esc(t("fl").lent_to)}<input name="lent_to" value="${esc(panel.lent_to || "")}" maxlength="120"></label>
      <div class="row"><button type="submit" class="btn primary">${esc(t("save"))}</button></div></form>`);
  }
  function rereadSheet() {
    sheet(`${head(t("readAgain"))}<form class="stack" id="rereadForm"><label class="f">${esc(t("hint"))}<textarea name="hint" rows="3" maxlength="1000">${esc(panel.ai_hint || "")}</textarea></label>
      <div class="row"><button type="submit" class="btn primary">↻ ${esc(t("readAgain"))}</button></div></form>`);
  }

  function moreSheet() {
    sheet(`${head(t("nav").more)}<div class="opts">
      <button type="button" class="opt" data-view="warranty"><span>🛡️</span><span><b>${esc(t("nav").warranty)}</b>${st.stats.soon ? `<small>${esc(t("stSoon")(st.soon_days))}: ${st.stats.soon}</small>` : ""}</span></button>
      <button type="button" class="opt" data-view="inbox"><span>📥</span><span><b>${esc(t("nav").inbox)}</b>${st.inbox.files.length ? `<small>${st.inbox.files.length}</small>` : ""}</span></button>
      <button type="button" class="opt" data-act="lang"><span>🌐</span><span><b>${esc(t("lang"))}</b></span></button>
      <button type="button" class="opt" data-act="currency"><span>💱</span><span><b>${esc(t("currency")(st.currency))}</b></span></button></div>`);
  }

  // --- inbox import -----------------------------------------------------------------------------------------

  async function importInbox(how) {
    const files = st.inbox.files.map((f, i) => ({ ...f, i })).filter((f) => !skips.has(key(f)));
    const placeOf = (f) => { const v = document.querySelector(`[data-ibplace="${f.i}"]`)?.value; return v ? Number(v) : null; };
    document.querySelectorAll("#view button").forEach((b) => (b.disabled = true));
    let item = null, ok = 0, readDone = false;
    for (let n = 0; n < files.length; n++) {
      const f = files[n], last = n === files.length - 1;
      progress("ibProgress", n, files.length, t("uploading")(n + 1, files.length));
      try {
        const r = await fetch(`api/inbox/file?folder=${encodeURIComponent(f.folder)}&name=${encodeURIComponent(f.name)}`, { headers: { "x-botgateway": "1" } });
        if (!r.ok) throw new Error(await r.text());
        const prep = await prepare(await r.blob(), f.name, f.media_type);
        const body = { folder: f.folder, name: f.name, data: prep.data, media_type: prep.media_type, thumb: prep.thumb };
        const it = await send("inbox/import", how === "one" ? { ...body, item_id: item, place_id: item ? undefined : placeOf(files[0]), read: last } : { ...body, place_id: placeOf(f), read: true });
        if (!it) continue;
        ok++;
        if (how === "one") { item = it.id; readDone = last; }
      } catch (e) { oops(e); }
    }
    if (how === "one" && item && !readDone) await api("items/read", { id: item }).catch(oops);
    skips.clear();
    if (ok) toast(t("addedOk"));
    await load();
  }

  // --- CSV (for the insurance, a spreadsheet) --------------------------------------------------------------------

  function csv() {
    const cols = ["name", "category", "place_id", "spot", "brand", "model", "serial", "quantity", "purchase_date", "price", "currency", "shop", "order_no", "warranty_until", "status", "lent_to", "tags", "notes"];
    const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const value = (it, k) => (k === "category" ? nm(cat(it.category)) : k === "place_id" ? it.place.join(" › ") : k === "status" ? statusName(it.status) : k === "tags" ? it.tags.join(", ") : it[k]);
    const lines = [cols.map((k) => cell(t("fl")[k])).join(","), ...list.map((it) => cols.map((k) => cell(value(it, k))).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `home-thingy-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // --- events ---------------------------------------------------------------------------------------------------

  const filterGo = (s) => { filt = { ...NO_FILTER, q: filt.q }; for (const [k, v] of new URLSearchParams(s)) filt[k] = v; $("q").value = filt.q; go("things"); };

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-view],[data-item],[data-place],[data-act],[data-close],[data-file],[data-filter-go],[data-layout],[data-room],[data-suggest],[data-unpick],[data-emoji]");
    if (!el) {
      if (e.target === $("panel")) closePanel();
      if (e.target === $("sheet")) closeSheet();
      return;
    }
    const d = el.dataset;
    if (d.view) { if (el.closest("#panel")) closePanel(); return go(d.view); }
    if (d.item) { closeSheet(); return openItem(Number(d.item)); }
    if (d.place) { closePanel(); filt = { ...NO_FILTER, q: filt.q, place: d.place }; return go("things"); }
    if (d.filterGo) return filterGo(d.filterGo);
    if (d.close !== undefined) return closeSheet();
    if (d.file) { panelFile = Number(d.file); return drawPanel(); }
    if (d.layout) { layout = d.layout; try { localStorage.setItem("homethingy.layout", layout); } catch { } return render(true); }
    if (d.unpick) { const [p] = picked.splice(Number(d.unpick), 1); if (p?.url) URL.revokeObjectURL(p.url); return drawAdd(); }
    if (d.emoji) { const f = $("placeForm"); f.elements.icon.value = d.emoji; f.querySelectorAll("[data-emoji]").forEach((b) => b.classList.toggle("on", b === el)); return; }
    if (d.suggest) { $("askIn").value = d.suggest; return $("askForm").requestSubmit(); }
    if (d.room) {
      try { await api("places/rooms", { rooms: [d.room] }); await load(); } catch (err) { oops(err); }
      return;
    }
    const id = Number(d.id) || null;
    try {
      switch (d.act) {
        case "lang":
          lang = lang === "zh" ? "en" : "zh";
          try { localStorage.setItem("homethingy.lang", lang); } catch { }
          closeSheet();
          await load();
          if (panel) drawPanel();
          return;
        case "currency": {
          const c = prompt(t("currencyAsk"), st.currency);
          if (c === null) return;
          await api("settings", { currency: c });
          closeSheet();
          return load();
        }
        case "more": return moreSheet();
        case "add": return addSheet();
        case "manual": closeSheet(); panel = { id: null, owner_fields: [], tags: [], files: [], place_id: filt.place && filt.place !== "none" ? Number(filt.place) : null, currency: st.currency, quantity: 1 }; editing = true; return drawPanel();
        case "upload": return doUpload();
        case "addto": return addSheet([], panel);
        case "pclose": return closePanel();
        case "edit": editing = true; return drawPanel();
        case "unedit": editing = false; return drawPanel();
        case "confirm": panel = await api("items/confirm", { id: panel.id }); drawPanel(); return refresh();
        case "reread": return rereadSheet();
        case "move": return moveSheet();
        case "status": return statusSheet();
        case "hide": panel = await api("items", { id: panel.id, fields: {}, hidden: !panel.hidden }); return drawPanel();
        case "delitem":
          if (!confirm(t("delItem"))) return;
          await api("items/delete", { id: panel.id });
          closePanel(); toast(t("deleted"));
          return load();
        case "cover": panel = await api("files/cover", { item_id: panel.id, file_id: id }); drawPanel(); return refresh();
        case "delfile":
          if (!confirm(t("delFile"))) return;
          panel = await api("files/delete", { item_id: panel.id, file_id: id }); panelFile = null; drawPanel(); return refresh();
        case "other": {
          const it = await api("items/other", { id: panel.id, index: Number(d.i) });
          toast(t("saved")); refresh();
          return openItem(it.id);
        }
        case "place": return placeSheet(id, Number(d.parent) || null);
        case "delplace":
          if (!confirm(t("delPlace")(place(id)?.name || ""))) return;
          await api("places/delete", { id });
          if (String(filt.place) === String(id)) filt.place = "";
          closeSheet();
          return load();
        case "check": filt.check = filt.check ? "" : "1"; return render();
        case "clear": filt = { ...NO_FILTER }; $("q").value = ""; return render();
        case "csv": return csv();
        case "import": return importInbox(d.mode);
        case "reject": {
          const f = st.inbox.files[Number(d.i)];
          if (!f || !confirm(`${f.name}: ${t("rejectAsk")}`)) return;
          await api("inbox/reject", { folder: f.folder, name: f.name });
          return load();
        }
        case "unask": await api("asks/delete", { id }); return render(true);
      }
    } catch (err) { oops(err); }
  });

  document.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.dataset.filter) { filt[el.dataset.filter] = el.value; return render(); }
    if (el.dataset.kind) {
      try { panel = await api("files/kind", { item_id: panel.id, file_id: Number(el.dataset.kind), kind: el.value }); drawPanel(); } catch (err) { oops(err); }
      return;
    }
    if (el.dataset.pick !== undefined) {
      const f = st.inbox.files[Number(el.dataset.pick)];
      if (el.checked) skips.delete(key(f)); else skips.add(key(f));
      return inbox($("view"));
    }
    if (el.id === "pick") { picked.push(...[...el.files].map((f) => ({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }))); return drawAdd(); }
    if (el.name === "mode") { mode = el.value; return drawAdd(); }
  });

  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === "editForm") return saveEdit(f);
      if (f.id === "placeForm") {
        await api("places", { id: Number(f.dataset.id) || undefined, name: f.elements.name.value, icon: f.elements.icon.value, parent_id: f.elements.parent_id.value ? Number(f.elements.parent_id.value) : null, hidden: f.elements.hidden.checked });
        closeSheet();
        return load();
      }
      if (f.id === "moveForm") {
        panel = await api("items", { id: panel.id, fields: { place_id: f.elements.place_id.value ? Number(f.elements.place_id.value) : null, spot: f.elements.spot.value } });
        closeSheet(); drawPanel(); toast(t("saved")); return refresh();
      }
      if (f.id === "statusForm") {
        const s = f.elements.status.value;
        panel = await api("items", { id: panel.id, fields: {}, status: s, lent_to: f.elements.lent_to.value });
        closeSheet(); drawPanel(); return refresh();
      }
      if (f.id === "rereadForm") {
        panel = await api("items/read", { id: panel.id, hint: f.elements.hint.value });
        closeSheet(); drawPanel(); return refresh();
      }
      if (f.id === "askForm") {
        const question = $("askIn").value.trim();
        if (!question) return;
        $("askIn").value = "";
        await api("ask", { question, lang });
        return render(true);
      }
    } catch (err) { oops(err); }
  });

  // Search: as you type (the things view).
  let typing = null;
  $("q").addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => { filt.q = $("q").value.trim(); if (view !== "things") go("things"); else render(true); }, 250);
  });
  $("addBtn").addEventListener("click", () => addSheet());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!$("sheet").classList.contains("hidden")) closeSheet(); else if (panel) closePanel(); }
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { e.preventDefault(); $("q").focus(); }
  });

  // Files dropped anywhere: added (to the open item, or as a new one).
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    $("dropText").textContent = panel?.id && !editing ? t("dropTo")(panel.name || t("unnamed")) : t("dropHere");
    $("drop").classList.remove("hidden");
  });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("drop").classList.add("hidden"); } });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0; $("drop").classList.add("hidden");
    const files = [...e.dataTransfer.files];
    if (!$("sheet").classList.contains("hidden") && $("zone")) { picked.push(...files.map((f) => ({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }))); return drawAdd(); }
    addSheet(files, panel?.id && !editing ? panel : null);
  });

  // Live: a reading or an answer is done.
  try {
    const events = new EventSource("events");
    events.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "item") refresh();
      else if (m.type === "ask" && view === "ask") render(true);
    };
  } catch { /* no live updates: the page still looks again while readings wait */ }

  load();
})();
