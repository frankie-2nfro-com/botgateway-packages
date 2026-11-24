// AI Meetings page (DOCUMENTATIONS/app_aimeetings_requirements.txt 4): on this computer the chair's page (meetings, rounds,
// minutes, invitations; live through the program's pushes, EventSource "events"); on the website the join page and the meeting
// for invited people (asks every few seconds). Talks only to its own api/.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private window */ } },
  };

  // --- words ---------------------------------------------------------------------------------------------
  const WORDS = {
    en: {
      newMeeting: "＋ New meeting", noMeetings: "No meetings yet.", pick: "Choose a meeting on the left, or start a new one.",
      open: "open", ended: "ended", round: "round", ais: "AI", people: "people",
      edit: "Edit", del: "Delete", end: "End meeting", reopen: "Open again", export: "Export",
      opening: "Opening round", openingHint: "Everyone answers at once, without seeing the others",
      discussion: "Discussion round", discussionHint: "One after another, answering each other",
      final: "Closing statements", ask: "Ask one…", stop: "Stop", skip: "Skip",
      sendOpening: "Send and start", openingStatement: "Opening statement", openingNote: "Opening round: this is your opening statement, made from the purpose and the background - change it as you like. Every AI participant answers at once, without seeing the others.",
      openingPurpose: "Purpose of this meeting", openingBackground: "Background", openingAsk: "Please each give your first view: what do you see, what would you suggest, and what worries you?",
      send: "Send", asInstruction: "Keep as instruction", sayHint: "Write to the meeting (Enter = send, Shift+Enter = new line)",
      instruction: "Instruction for the next turns", clear: "Clear",
      thinking: "speaking", failed: "failed", idle: "", left: "left", removed: "removed", hand: "✋",
      invite: "Invite people", inviteOff: "Off - nobody can join with a code.", inviteOn: "On - people can join on the website with this code:",
      inviteHint: "Share the code and the address of this application's website (2nfro Desktop → the application → Website). Invited people read and write; only you start AI turns.",
      inviteLocal: "This 2nfro Desktop gateway runs on this computer only (Local), so nobody else can join. To invite people, use AI Meetings on a Connected gateway (2nfro Cloud).",
      noLlms: "No AI for the participants yet: in 2nfro Desktop → Applications → AI Meetings → Config, tick the LLMs it may use (e.g. an API key worker or Ask an AI CLI).",
      turnOn: "Turn on", turnOff: "Turn off", newCode: "New code", remove: "Remove", lower: "Lower hand",
      minutes: "Minutes", secretary: "Secretary", draft: "Draft the minutes", digest: "Summarize so far",
      digestHint: "A short running summary the AIs get instead of the oldest part of a long meeting.", writing: "The secretary is writing",
      saveDraft: "Save draft", finish: "Finish", finished: "Finished - invited people can read them.", draftState: "Draft - only you see it.",
      runningSummary: "Running summary", none: "none",
      title: "Title", purpose: "Purpose", purposeHint: "What should the meeting decide or produce?", background: "Background",
      backgroundHint: "Facts, figures, constraints, links you pasted - everything the participants should know.",
      lang: "Language", langAuto: "Same as the chair", length: "Length of a turn", words: "words",
      participants: "AI participants", name: "Name", llm: "LLM", role: "Role (optional)", add: "＋ Add AI participant",
      llmDefault: "The application's LLM", noLlms: "No LLMs chosen for AI Meetings yet: every participant uses the application's one LLM. In 2nfro Desktop open the application's Config → \"LLMs it may use\" and tick Claude, GPT, Gemini … (add them first as \"Ask an AI model (API)\" workers).",
      dataNote: "What you write here and the whole transcript go to every LLM chosen above.",
      save: "Save", cancel: "Cancel", start: "Start", confirmDelete: "Delete this meeting and its transcript? This cannot be undone.",
      confirmEnd: "End the meeting? Invitations close; you can open it again later.",
      chair: "Chair", you: "you", copied: "Copied", saved: "Saved",
      joinTitle: "Join a meeting", code: "Invitation code", yourName: "Your name", join: "Join",
      joinNote: "What you write is part of the meeting: the chair's AI participants read it, so it is sent to the AI providers the chair uses.",
      raise: "✋ Raise hand", lowerMine: "Lower hand", leave: "Leave", confirmLeave: "Leave the meeting?",
      waitingChair: "The chair runs the meeting. You can write at any time.", endedNote: "The meeting has ended.",
      minutesFinal: "Minutes", gone: "You are no longer in this meeting.",
      askTitle: "Ask one participant", askWho: "Ask", askText: "Your question", askTextHint: "What should they answer? (empty = they answer your latest message)",
      askWords: "Expected length", askSend: "Ask", askNote: "Your question goes into the meeting as your message, addressed to them; only they answer.",
      turnLength: "Length of a turn", turnLengthHint: "Every AI aims to stay under about this many words, from the next turn on.", turnLengthSaved: "Length of a turn saved",
    },
    zh: {
      newMeeting: "＋ 新會議", noMeetings: "未有會議。", pick: "在左邊選一個會議，或開一個新會議。",
      open: "進行中", ended: "已結束", round: "第", ais: "AI", people: "人",
      edit: "編輯", del: "刪除", end: "結束會議", reopen: "重新開啟", export: "匯出",
      opening: "開場輪", openingHint: "大家同時發言，互相看不到",
      discussion: "討論輪", discussionHint: "輪流發言，互相回應",
      final: "總結發言", ask: "點名提問…", stop: "停止", skip: "跳過",
      sendOpening: "發送並開始", openingStatement: "開場發言", openingNote: "開場輪：這是你的開場發言，由目的和背景資料組成 - 可以隨意修改。所有 AI 與會者會同時回答，互相看不到。",
      openingPurpose: "會議目的", openingBackground: "背景資料", openingAsk: "請各位先講初步看法：你看到甚麼、有甚麼建議、擔心甚麼？",
      send: "發送", asInstruction: "作為指示保留", sayHint: "向會議發言（Enter 發送，Shift+Enter 換行）",
      instruction: "之後發言的指示", clear: "清除",
      thinking: "發言中", failed: "失敗", idle: "", left: "已離開", removed: "已移除", hand: "✋",
      invite: "邀請真人", inviteOff: "關閉 - 沒有人可以用邀請碼加入。", inviteOn: "開啟 - 其他人可以在網站用這個碼加入：",
      inviteHint: "把邀請碼和這個應用程式的網站地址（2nfro Desktop → 應用程式 → 網站）給對方。受邀者可以閱讀和發言；只有你可以叫 AI 發言。",
      inviteLocal: "這個 2nfro Desktop gateway 只在這部電腦運行（本機），其他人無法加入。要邀請其他人，請在「連線」gateway（2nfro Cloud）使用 AI 會議。",
      noLlms: "與會 AI 未有可用的 LLM：請到 2nfro Desktop →「Applications」→ AI Meetings →「Config」，剔選它可以用的 LLM（例如 API key worker 或 Ask an AI CLI）。",
      turnOn: "開啟", turnOff: "關閉", newCode: "換新碼", remove: "移除", lower: "放下手",
      minutes: "會議紀要", secretary: "秘書", draft: "起草紀要", digest: "摘要至今內容",
      digestHint: "會議很長時，AI 會收到這段摘要，代替最舊的部分。", writing: "秘書正在撰寫",
      saveDraft: "儲存草稿", finish: "定稿", finished: "已定稿 - 受邀者可以閱讀。", draftState: "草稿 - 只有你看到。",
      runningSummary: "進行中摘要", none: "無",
      title: "標題", purpose: "目的", purposeHint: "會議要決定或產出甚麼？", background: "背景資料",
      backgroundHint: "事實、數字、限制、你貼上的資料 - 與會者應該知道的一切。",
      lang: "語言", langAuto: "跟主席一樣", length: "每次發言長度", words: "字",
      participants: "AI 與會者", name: "名稱", llm: "LLM", role: "角色（可選）", add: "＋ 加 AI 與會者",
      llmDefault: "應用程式的 LLM", noLlms: "未為 AI Meetings 選擇 LLM：所有與會者都會用應用程式的同一個 LLM。請在 2nfro Desktop 打開這個應用程式的 Config →「LLMs it may use」，勾選 Claude、GPT、Gemini…（先以「Ask an AI model (API)」worker 加入）。",
      dataNote: "這裏寫的內容和整段會議記錄，都會送給上面選擇的每一個 LLM。",
      save: "儲存", cancel: "取消", start: "開始", confirmDelete: "刪除這個會議及其記錄？刪除後無法復原。",
      confirmEnd: "結束會議？邀請會關閉；之後可以重新開啟。",
      chair: "主席", you: "你", copied: "已複製", saved: "已儲存",
      joinTitle: "加入會議", code: "邀請碼", yourName: "你的名字", join: "加入",
      joinNote: "你的發言是會議的一部分：主席的 AI 與會者會讀到，所以會送到主席使用的 AI 供應商。",
      raise: "✋ 舉手", lowerMine: "放下手", leave: "離開", confirmLeave: "離開會議？",
      waitingChair: "會議由主席主持。你可以隨時發言。", endedNote: "會議已結束。",
      minutesFinal: "會議紀要", gone: "你已不在這個會議。",
      askTitle: "點名提問", askWho: "問", askText: "你的問題", askTextHint: "想對方答甚麼？（留空 = 回應你最新的發言）",
      askWords: "預期長度", askSend: "提問", askNote: "你的問題會以你的發言放入會議，指明問對方；只有對方回答。",
      turnLength: "每次發言長度", turnLengthHint: "由下一次發言起，每個 AI 盡量不超過大約這個字數。", turnLengthSaved: "已儲存發言長度",
    },
  };
  let lang = store.get("aim.lang") || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
  const t = (k) => WORDS[lang][k] ?? WORDS.en[k] ?? k;
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  const ROLES = {
    en: ["Finance: costs, money, return", "The critic: find the weak points", "The user: what people really need", "Engineer: can it be built, how", "Risk and law", "Optimist: the best case", "Strategy: the long term"],
    zh: ["財務：成本、金錢、回報", "專挑毛病：找出弱點", "用戶角度：用家真正需要甚麼", "工程師：做唔做到、點做", "風險及法律", "樂觀派：最好的情況", "策略：長遠方向"],
  };

  // --- helpers -------------------------------------------------------------------------------------------
  async function api(path, body) {
    const r = await fetch("api/" + path, body === undefined ? { headers: { "x-botgateway": "1" } }
      : { method: "POST", headers: { "x-botgateway": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) { const e = new Error(txt || r.statusText); e.status = r.status; throw e; }
    return txt ? JSON.parse(txt) : null;
  }
  function toast(msg, bad) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (bad ? " bad" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), bad ? 7000 : 2200);
  }
  const oops = (e) => toast(e.message || String(e), true);
  const COLORS = ["#5b7cfa", "#20a386", "#e0742a", "#b35ad6", "#d6455d", "#2f9fd0", "#8a9a1f", "#c7871d", "#6f6fd8", "#3a9d5d"];
  const color = (p) => COLORS[(Number(p?.id) || 0) % COLORS.length];
  const initials = (name) => { const w = String(name || "?").trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : String(name || "?").slice(0, 2)).toUpperCase(); };
  const avatar = (p, chair) => chair ? `<span class="av" style="background:var(--chair)">★</span>` : `<span class="av" style="background:${color(p)}">${esc(initials(p?.name))}</span>`;
  const time = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const langBtn = () => `<button type="button" class="btn sm lang" id="langBtn">${lang === "zh" ? "EN" : "中文"}</button>`;
  function bindLang(rerender) {
    const b = $("langBtn");
    if (b) b.onclick = () => { lang = lang === "zh" ? "en" : "zh"; store.set("aim.lang", lang); document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en"; rerender(); };
  }
  // A little Markdown for the minutes: headings, bullets, bold; everything escaped first.
  function md(src) {
    const out = [];
    let list = false;
    for (const raw of String(src || "").split("\n")) {
      let line = esc(raw).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      const h = line.match(/^#{1,6}\s+(.*)$/), li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${li[1]}</li>`); continue; }
      if (list) { out.push("</ul>"); list = false; }
      if (h) out.push(`<h3>${h[1]}</h3>`);
      else if (line.trim()) out.push(`<p>${line}</p>`);
    }
    if (list) out.push("</ul>");
    return out.join("");
  }
  function messageHtml(m, people, meId) {
    if (m.kind === "system") {
      const roundish = ["opening", "discussion", "final", "end"].includes(m.turn);
      const label = { "Opening round": t("opening"), "Discussion round": t("discussion"), "Closing statements": t("final"), "Meeting ended": t("endedNote"), "Stopped by the chair": t("stop") }[m.text] || m.text;
      return `<div class="sys${roundish ? " round" : ""}">${esc(label)}${roundish && m.round ? ` · ${esc(m.round)}` : ""}</div>`;
    }
    const chair = m.kind === "chair";
    const p = people.get(m.participant_id) || { id: m.participant_id, name: m.name };
    const role = !chair && p.role ? ` · ${esc(p.role)}` : "";
    const mine = meId && m.participant_id === meId;
    return `<div class="msg ${chair ? "chair" : m.kind === "human" ? "human" : "ai"}">${avatar(p, chair)}<div class="bubble">
      <div class="who"><b>${esc(chair ? t("chair") : m.name)}</b>${mine ? ` (${t("you")})` : ""}${role}${chair && m.turn === "opening" ? ` · 📣 ${t("openingStatement")}` : ""} · ${time(m.at)}</div>
      <div class="txt">${esc(m.text)}</div>${m.stance ? `<div class="stance">➜ ${esc(m.stance)}</div>` : ""}</div></div>`;
  }
  function chipHtml(p, owner) {
    const cls = p.state === "thinking" ? "thinking" : p.state === "failed" ? "failed" : p.state === "left" ? "gone" : "";
    const state = p.state === "thinking" ? `<span class="muted dots">${t("thinking")}</span>`
      : p.state === "failed" ? `<span class="bad" title="${esc(p.error || "")}">⚠ ${t("failed")}</span>`
      : p.state === "left" ? `<span class="muted">${t("left")}</span>` : "";
    const extra = owner && p.kind === "ai" && p.llm ? `<span class="muted">${esc(p.llm)}</span>` : "";
    const hand = p.hand ? `<span title="${t("hand")}">✋</span>` : "";
    const actions = !owner ? "" : p.kind === "ai"
      ? (p.state === "thinking" ? `<button type="button" data-skip="${p.id}" title="${t("skip")}">⏭</button>` : "")
      : `${p.hand ? `<button type="button" data-lower="${p.id}" title="${t("lower")}">↓</button>` : ""}${p.state !== "left" ? `<button type="button" data-remove="${p.id}" title="${t("remove")}">✕</button>` : ""}`;
    return `<span class="chip ${cls}" title="${esc(p.role || "")}">${avatar(p)}<span class="name">${esc(p.name)}</span>${extra}${hand}${state}${actions}</span>`;
  }

  // =======================================================================================================
  // The chair (owner, this computer)
  // =======================================================================================================
  // An LLM as the owner named its worker in 2nfro Desktop (else made from its id), and how a choice reads.
  const llmName = (l) => (S.llmNames && S.llmNames[l]) || (l ? l.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
  const llmLabel = (l) => !l ? t("llmDefault") : llmName(l) === l ? l : `${llmName(l)} (${l})`;
  const S = { llms: [], llmNames: {}, meetings: [], cur: null, msgs: [], lastId: 0, minutesDirty: false, loading: false };

  async function owner() {
    renderShell();
    await loadList();
    const last = Number(store.get("aim.meeting")) || 0;
    if (last && S.meetings.some((m) => m.id === last)) await openMeeting(last);
    try {
      const ev = new EventSource("events");
      ev.onmessage = (e) => { let d = null; try { d = JSON.parse(e.data); } catch { } if (d && S.cur && d.id === S.cur.id) refresh(); listSoon(); };
    } catch { /* no live updates: the timer below */ }
    setInterval(() => { if (S.cur && S.cur.busy) refresh(); }, 6000);
  }

  function renderShell() {
    $("root").className = "root";
    $("root").innerHTML = `<aside class="side"><div class="brand"><img src="icon.svg" alt="">AI Meetings ${langBtn()}</div>
      <button type="button" class="btn primary new" id="newBtn">${t("newMeeting")}</button><div class="list" id="list"></div></aside>
      <section class="main" id="main"><div class="empty">${t("pick")}</div></section>`;
    $("newBtn").onclick = () => meetingDialog(null);
    bindLang(() => { renderShell(); renderList(); if (S.cur) renderMeeting(true); });
    renderList();
  }

  let listTimer = null;
  const listSoon = () => { clearTimeout(listTimer); listTimer = setTimeout(() => loadList().catch(() => { }), 800); };
  async function loadList() {
    const s = await api("state");
    S.llms = s.llms || [];
    S.llmNames = s.llm_names || {};
    S.mode = s.mode || "relay";
    S.meetings = s.meetings || [];
    renderList();
  }
  function renderList() {
    const el = $("list");
    if (!el) return;
    // Local gateway without any LLM ticked: nothing could answer - say where to choose them.
    const noAi = S.mode === "local" && !S.llms.length ? `<p class="bad" style="padding:8px 10px;font-size:12px">⚠ ${t("noLlms")}</p>` : "";
    el.innerHTML = noAi + (S.meetings.length ? S.meetings.map((m) => `<button type="button" data-open="${m.id}" class="${S.cur && S.cur.id === m.id ? "on" : ""}">
        <b>${esc(m.title)}</b><small>${m.status === "ended" ? t("ended") : t("open")} · ${m.ais} ${t("ais")}${m.people ? ` · ${m.people} ${t("people")}` : ""}${m.invite_on && S.mode !== "local" ? " · 🔗" : ""}</small></button>`).join("")
      : `<p class="muted" style="padding:8px 10px">${t("noMeetings")}</p>`);
    el.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openMeeting(Number(b.dataset.open)).catch(oops));
  }

  async function openMeeting(id) {
    const m = await api(`meeting?id=${id}&since=0`);
    S.cur = m; S.msgs = m.messages; S.lastId = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0; S.minutesDirty = false; S.openingDirty = false;
    store.set("aim.meeting", String(id));
    renderList();
    renderMeeting(true);
  }

  async function refresh() {
    if (!S.cur || S.loading) return;
    S.loading = true;
    try {
      const m = await api(`meeting?id=${S.cur.id}&since=${S.lastId}`);
      const fresh = m.messages.filter((x) => x.id > S.lastId);
      S.msgs.push(...fresh);
      if (fresh.length) S.lastId = fresh[fresh.length - 1].id;
      S.cur = m;
      renderMeeting(false, fresh);
    } catch (e) { if (e.status === 400) { S.cur = null; $("main").innerHTML = `<div class="empty">${t("pick")}</div>`; } }
    finally { S.loading = false; }
  }

  function renderMeeting(full, fresh = []) {
    const m = S.cur;
    if (!m) return;
    if (full) {
      $("main").innerHTML = `<div class="head" id="head"></div><div class="people" id="people"></div>
        <div class="body"><div class="talk"><div class="feed" id="feed"></div><div id="focus"></div><div class="controls" id="controls"></div><p class="note" id="openNote" style="margin:8px 18px 0"></p>
          <div class="compose"><textarea id="say" rows="1" placeholder="${esc(t("sayHint"))}"></textarea>
            <div class="opts"><label><input type="checkbox" id="asInstr"> ${t("asInstruction")}</label><button type="button" class="btn primary" id="sendBtn">${t("send")}</button></div></div></div>
          <div class="aside" id="aside"></div></div>`;
      const say = $("say");
      const send = async () => {
        const text = say.value.trim();
        if (!text) return;
        try {
          // Before the first round, what the chair sends is the opening statement and starts the opening round.
          if (S.opening) await api("round", { id: m.id, kind: "opening", text });
          else await api("say", { id: m.id, text, instruction: $("asInstr").checked });
          say.value = ""; S.openingDirty = false; $("asInstr").checked = false; autosize(); refresh();
        } catch (e) { oops(e); }
      };
      const autosize = () => { say.style.height = "auto"; say.style.height = Math.min(S.opening ? 320 : 160, say.scrollHeight) + "px"; };
      S.autosize = autosize;
      say.oninput = () => { if (S.opening) S.openingDirty = true; autosize(); };
      say.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
      $("sendBtn").onclick = send;
    }
    const ended = m.status === "ended";
    $("head").innerHTML = `<h1 title="${esc(m.purpose || "")}">${esc(m.title)}</h1><span class="status">${ended ? t("ended") : t("open")}${m.round ? ` · ${t("round")} ${m.round}` : ""}</span>
      <button type="button" class="btn sm" id="editBtn" ${ended ? "disabled" : ""}>${t("edit")}</button>
      <button type="button" class="btn sm" id="exportBtn">${t("export")}</button>
      ${ended ? `<button type="button" class="btn sm" id="reopenBtn">${t("reopen")}</button>` : `<button type="button" class="btn sm" id="endBtn">${t("end")}</button>`}
      <button type="button" class="btn sm danger" id="delBtn">${t("del")}</button>`;
    $("editBtn").onclick = () => meetingDialog(m);
    $("exportBtn").onclick = exportMeeting;
    $("delBtn").onclick = async () => { if (!confirm(t("confirmDelete"))) return; try { await api("meetings/delete", { id: m.id }); S.cur = null; store.set("aim.meeting", null); $("main").innerHTML = `<div class="empty">${t("pick")}</div>`; loadList(); } catch (e) { oops(e); } };
    if ($("endBtn")) $("endBtn").onclick = async () => { if (!confirm(t("confirmEnd"))) return; try { await api("end", { id: m.id }); refresh(); listSoon(); } catch (e) { oops(e); } };
    if ($("reopenBtn")) $("reopenBtn").onclick = async () => { try { await api("reopen", { id: m.id }); refresh(); listSoon(); } catch (e) { oops(e); } };

    $("people").innerHTML = m.participants.map((p) => chipHtml(p, true)).join("");
    $("people").querySelectorAll("[data-skip]").forEach((b) => b.onclick = () => api("skip", { id: m.id, participant: Number(b.dataset.skip) }).then(refresh, oops));
    $("people").querySelectorAll("[data-lower]").forEach((b) => b.onclick = () => api("hands/lower", { id: m.id, participant: Number(b.dataset.lower) }).then(refresh, oops));
    $("people").querySelectorAll("[data-remove]").forEach((b) => b.onclick = () => api("guests/remove", { id: m.id, participant: Number(b.dataset.remove) }).then(refresh, oops));

    const people = new Map(m.participants.map((p) => [p.id, p]));
    const feed = $("feed");
    const atEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    if (full) feed.innerHTML = S.msgs.length ? S.msgs.map((x) => messageHtml(x, people)).join("") : `<div class="empty">🎙️</div>`;
    else if (fresh.length) { if (!feed.querySelector(".msg, .sys")) feed.innerHTML = ""; feed.insertAdjacentHTML("beforeend", fresh.map((x) => messageHtml(x, people)).join("")); }
    if (full || (fresh.length && atEnd)) feed.scrollTop = feed.scrollHeight;

    $("focus").innerHTML = m.focus ? `<div class="focus">📌 <span title="${esc(m.focus)}">${t("instruction")}: ${esc(m.focus)}</span><button type="button" class="btn sm link" id="clearFocus">${t("clear")}</button></div>` : "";
    if ($("clearFocus")) $("clearFocus").onclick = () => api("focus/clear", { id: m.id }).then(refresh, oops);

    const ais = m.participants.filter((p) => p.kind === "ai" && p.state !== "removed");
    const dis = ended || m.busy || !ais.length ? "disabled" : "";
    // No round yet: the compose box holds the opening statement (purpose + background) until the chair sends it.
    const wasOpening = S.opening;
    S.opening = !ended && m.round === 0;
    $("openNote").textContent = S.opening ? t("openingNote") : "";
    $("openNote").classList.toggle("hidden", !S.opening);
    $("sendBtn").textContent = S.opening ? t("sendOpening") : t("send");
    $("asInstr").closest("label").classList.toggle("hidden", S.opening);
    if (S.opening && !S.openingDirty && (full || !wasOpening || S.openingFor !== m.updated)) {
      $("say").value = openingText(m);
      S.openingFor = m.updated;
      S.autosize();
    }
    $("controls").classList.toggle("hidden", S.opening);
    $("controls").innerHTML = `<button type="button" class="btn" data-round="discussion" title="${esc(t("discussionHint"))}" ${dis}>${t("discussion")}</button>
      <select class="btn" id="askSel" ${dis}><option value="">${t("ask")}</option>${ais.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
      <button type="button" class="btn" data-round="final" ${dis}>${t("final")}</button>
      <button type="button" class="btn danger" id="stopBtn" ${m.busy ? "" : "disabled"}>■ ${t("stop")}</button>`;
    $("controls").querySelectorAll("[data-round]").forEach((b) => b.onclick = () => round(b.dataset.round));
    $("askSel").onchange = (e) => { const v = Number(e.target.value); e.target.value = ""; if (v) askDialog(v); };
    $("stopBtn").onclick = () => api("stop", { id: m.id }).then(refresh, oops);
    $("say").disabled = ended; $("sendBtn").disabled = ended;

    renderAside(m);
  }

  // In the meeting's language (else the page's).
  function openingText(m) {
    const l = m.lang === "zh-Hant" ? "zh" : m.lang === "en" ? "en" : lang;
    const w = (k) => WORDS[l][k], colon = l === "zh" ? "：" : ": ";
    return [m.purpose ? `${w("openingPurpose")}${colon}${m.purpose}` : "", m.background ? `${w("openingBackground")}${colon}\n${m.background}` : "", w("openingAsk")]
      .filter(Boolean).join("\n\n");
  }

  async function round(kind, participant, extra = {}) {
    try { await api("round", { id: S.cur.id, kind, participant, ...extra }); refresh(); return true; } catch (e) { oops(e); return false; }
  }

  // Ask one participant: who, the question (optional) and how long the answer should be.
  const LENGTHS = [30, 50, 80, 120, 180, 250, 400, 600, 800, 1000];
  const lengthOpts = (v) => [...new Set([...LENGTHS, Number(v)])].filter(Boolean).sort((a, b) => a - b)
    .map((w) => `<option value="${w}" ${w === Number(v) ? "selected" : ""}>~${w} ${t("words")}</option>`).join("");
  function askDialog(pid) {
    const m = S.cur;
    const ais = m.participants.filter((p) => p.kind === "ai" && p.state !== "removed");
    $("dialogBox").innerHTML = `<h2>${t("askTitle")}</h2>
      <label class="field"><span>${t("askWho")}</span><select id="aWho">${ais.map((p) => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.name)}${p.role ? ` · ${esc(p.role)}` : ""}</option>`).join("")}</select></label>
      <label class="field"><span>${t("askText")}</span><textarea id="aText" maxlength="2000" placeholder="${esc(t("askTextHint"))}" style="min-height:110px"></textarea></label>
      <label class="field"><span>${t("askWords")}</span><select id="aWords">${lengthOpts(m.words)}</select></label>
      <p class="note">${t("askNote")}</p>
      <div class="actions"><button type="button" class="btn" id="cancelD">${t("cancel")}</button><button type="button" class="btn primary" id="saveD">${t("askSend")}</button></div>`;
    $("dialog").classList.remove("hidden");
    $("cancelD").onclick = closeDialog;
    const go = async () => {
      $("saveD").disabled = true;
      const ok = await round("ask", Number($("aWho").value), { text: $("aText").value.trim(), words: Number($("aWords").value) });
      if (ok) closeDialog(); else $("saveD").disabled = false;
    };
    $("saveD").onclick = go;
    $("aText").onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } };
    $("aText").focus();
  }

  function renderAside(m) {
    renderLength(m);
    const el = $("asideRest");
    const editor = $("minutesText");
    const keep = editor && (S.minutesDirty || document.activeElement === editor) ? editor.value : null;
    const llmOpts = (S.llms.length ? S.llms : [""]).map((l) => `<option value="${esc(l)}">${esc(llmLabel(l))}</option>`).join("");
    const prevSec = $("secSel") ? $("secSel").value : store.get("aim.secretary") || "";
    const writing = m.minutes_state === "writing";
    // Local gateway (R56): no website, so the invitation box is only a short note.
    const inviteBox = S.mode === "local" ? `<div class="box"><h3>🔗 ${t("invite")}</h3><p class="muted">${t("inviteLocal")}</p></div>`
      : `<div class="box"><h3>🔗 ${t("invite")}</h3>
        ${m.invite_on ? `<p>${t("inviteOn")}</p><div class="code" id="codeBox" title="${t("copied")}">${esc(m.invite_code)}</div>` : `<p class="muted">${t("inviteOff")}</p>`}
        <p class="muted">${t("inviteHint")}</p>
        <div class="row">${m.invite_on ? `<button type="button" class="btn sm" id="invOff">${t("turnOff")}</button><button type="button" class="btn sm" id="invNew">${t("newCode")}</button>`
          : `<button type="button" class="btn sm" id="invOn" ${m.status === "ended" ? "disabled" : ""}>${t("turnOn")}</button>`}</div></div>`;
    el.innerHTML = `${inviteBox}
      <div class="box"><h3>📝 ${t("minutes")}</h3>
        <div class="row"><span class="muted">${t("secretary")}</span><select id="secSel">${llmOpts}</select></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn sm" id="draftBtn" ${writing ? "disabled" : ""}>${t("draft")}</button>
          <button type="button" class="btn sm" id="digestBtn" title="${esc(t("digestHint"))}">${t("digest")}</button></div>
        ${writing ? `<p class="dots muted">${t("writing")}</p>` : ""}
        ${m.minutes_error ? `<p class="bad">⚠ ${esc(m.minutes_error)}</p>` : ""}
        <p class="muted">${m.minutes_state === "final" ? t("finished") : m.minutes ? t("draftState") : ""}</p>
        <textarea id="minutesText" spellcheck="false"></textarea>
        <div class="row" style="margin-top:6px"><button type="button" class="btn sm" id="saveMin">${t("saveDraft")}</button><button type="button" class="btn sm primary" id="finishMin">${t("finish")}</button></div>
        ${m.digest ? `<details style="margin-top:12px"><summary class="muted">${t("runningSummary")}</summary><div class="md">${md(m.digest)}</div></details>` : ""}
      </div>`;
    const sec = $("secSel");
    if ([...sec.options].some((o) => o.value === prevSec)) sec.value = prevSec;
    sec.onchange = () => store.set("aim.secretary", sec.value);
    const ed = $("minutesText");
    ed.value = keep ?? (m.minutes || "");
    ed.oninput = () => { S.minutesDirty = true; };
    if (keep !== null && document.activeElement !== ed && editor === document.activeElement) ed.focus();
    if ($("codeBox")) $("codeBox").onclick = () => { navigator.clipboard?.writeText(m.invite_code).then(() => toast(t("copied")), () => { }); };
    if ($("invOn")) $("invOn").onclick = () => api("invite", { id: m.id, on: true }).then(refresh, oops);
    if ($("invOff")) $("invOff").onclick = () => api("invite", { id: m.id, on: false }).then(refresh, oops);
    if ($("invNew")) $("invNew").onclick = () => api("invite", { id: m.id, on: true, renew: true }).then(refresh, oops);
    $("draftBtn").onclick = () => api("minutes/write", { id: m.id, llm: sec.value }).then(() => { S.minutesDirty = false; refresh(); }, oops);
    $("digestBtn").onclick = () => api("minutes/write", { id: m.id, llm: sec.value, digest: true }).then(refresh, oops);
    const saveMin = (final) => api("minutes/save", { id: m.id, text: ed.value, final }).then(() => { S.minutesDirty = false; toast(t("saved")); refresh(); }, oops);
    $("saveMin").onclick = () => saveMin(false);
    $("finishMin").onclick = () => saveMin(true);
  }

  // Length of a turn (right column): its own box, not redrawn while the chair moves the slider.
  function renderLength(m) {
    const words = Number(m.words) || 180, ended = m.status === "ended";
    let wr = $("wRange");
    if (!wr) {
      $("aside").innerHTML = `<div class="box" id="lenBox"></div><div id="asideRest" style="display:contents"></div>`;
      wr = null;
    }
    if (wr && (S.wDrag || document.activeElement === wr) && Number(wr.dataset.meeting) === m.id) { wr.disabled = ended; return; }
    $("lenBox").innerHTML = `<h3>📏 ${t("turnLength")}</h3>
      <div class="row"><input type="range" id="wRange" data-meeting="${m.id}" min="30" max="1000" step="10" value="${words}" ${ended ? "disabled" : ""} style="flex:1">
        <b id="wShow" style="min-width:78px;text-align:right">~${words} ${t("words")}</b></div>
      <p class="muted">${t("turnLengthHint")}</p>`;
    wr = $("wRange");
    wr.onpointerdown = () => { S.wDrag = true; };
    wr.oninput = () => { $("wShow").textContent = `~${wr.value} ${t("words")}`; };
    wr.onchange = () => {
      S.wDrag = false;
      api("words", { id: m.id, words: Number(wr.value) }).then(() => { toast(t("turnLengthSaved")); wr.blur(); refresh(); }, oops);
    };
  }

  function exportMeeting() {
    const m = S.cur;
    const people = new Map(m.participants.map((p) => [p.id, p]));
    const lines = [`# ${m.title}`, "", m.purpose ? `**${t("purpose")}:** ${m.purpose}` : "", "",
      `## ${t("participants")}`, ...m.participants.filter((p) => p.state !== "removed").map((p) => `- ${p.name}${p.kind === "ai" ? ` (AI${p.llm ? `, ${p.llm}` : ""})` : ""}${p.role ? ` - ${p.role}` : ""}`), ""];
    if (m.minutes) lines.push(`## ${t("minutes")}`, "", m.minutes, "");
    lines.push("## Transcript", "");
    for (const x of S.msgs) {
      if (x.kind === "system") { lines.push(`--- ${x.text} ---`, ""); continue; }
      const who = x.kind === "chair" ? t("chair") : (people.get(x.participant_id)?.name || x.name);
      lines.push(`**${who}** (${time(x.at)}): ${x.text}`, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${m.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "meeting"}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // --- the meeting form ------------------------------------------------------------------------------------
  function meetingDialog(m) {
    const llms = S.llms;
    const rows = m ? m.participants.filter((p) => p.kind === "ai" && p.state !== "removed").map((p) => ({ id: p.id, name: p.name, llm: p.llm || "", role: p.role || "" }))
      : (llms.length ? llms.slice(0, 4) : [""]).map((l, i) => ({ id: 0, name: l ? llmName(l).slice(0, 40) : `AI ${i + 1}`, llm: l, role: "" }));
    const d = m ? { title: m.title, purpose: m.purpose, background: m.background, lang: m.lang, words: m.words }
      : { title: "", purpose: "", background: "", lang: lang === "zh" ? "zh-Hant" : "auto", words: 180 };
    const llmSelect = (v) => `<select class="p-llm">${(llms.length ? llms : [""]).map((l) => `<option value="${esc(l)}" ${l === v ? "selected" : ""}>${esc(llmLabel(l))}</option>`).join("")}</select>`;
    const rowHtml = (r, i) => `<div class="prow" data-id="${r.id}"><span class="av" style="background:${COLORS[i % COLORS.length]}">${i + 1}</span>
      <input class="p-name" maxlength="40" value="${esc(r.name)}" placeholder="${esc(t("name"))}">${llmSelect(r.llm)}
      <input class="p-role role" maxlength="300" list="roleList" value="${esc(r.role)}" placeholder="${esc(t("role"))}">
      <button type="button" class="btn sm" data-del title="${t("del")}">✕</button></div>`;
    $("dialogBox").innerHTML = `<h2>${m ? t("edit") : t("newMeeting").replace("＋ ", "")}</h2>
      <label class="field"><span>${t("title")}</span><input id="fTitle" maxlength="120" value="${esc(d.title)}"></label>
      <label class="field"><span>${t("purpose")} <span class="muted">· ${t("purposeHint")}</span></span><textarea id="fPurpose" maxlength="2000">${esc(d.purpose)}</textarea></label>
      <label class="field"><span>${t("background")} <span class="muted">· ${t("backgroundHint")}</span></span><textarea id="fBg" maxlength="12000" style="min-height:110px">${esc(d.background)}</textarea></label>
      <div class="grid2"><label class="field"><span>${t("lang")}</span><select id="fLang">
          <option value="auto" ${d.lang === "auto" ? "selected" : ""}>${t("langAuto")}</option><option value="zh-Hant" ${d.lang === "zh-Hant" ? "selected" : ""}>中文（繁體）</option><option value="en" ${d.lang === "en" ? "selected" : ""}>English</option></select></label>
        <label class="field"><span>${t("length")}</span><select id="fWords">${lengthOpts(d.words)}</select></label></div>
      <div class="field"><span>${t("participants")}</span></div>
      ${llms.length ? "" : `<p class="note">⚠ ${esc(t("noLlms"))}</p>`}
      <div id="pRows">${rows.map(rowHtml).join("")}</div>
      <datalist id="roleList">${ROLES[lang].map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
      <button type="button" class="btn sm" id="addP">${t("add")}</button>
      <p class="note">${t("dataNote")}</p>
      <div class="actions"><button type="button" class="btn" id="cancelD">${t("cancel")}</button><button type="button" class="btn primary" id="saveD">${m ? t("save") : t("start")}</button></div>`;
    $("dialog").classList.remove("hidden");
    const bindRows = () => {
      $("pRows").querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { b.closest(".prow").remove(); });
      // Another LLM: a name that was still that LLM's name follows it.
      $("pRows").querySelectorAll(".p-llm").forEach((sel) => {
        sel.dataset.was = sel.value;
        sel.onchange = () => {
          const name = sel.closest(".prow").querySelector(".p-name");
          if (!name.value.trim() || name.value === llmName(sel.dataset.was).slice(0, 40)) name.value = llmName(sel.value).slice(0, 40);
          sel.dataset.was = sel.value;
        };
      });
    };
    bindRows();
    $("addP").onclick = () => {
      const n = $("pRows").children.length;
      if (n >= 8) return;
      const l = llms[n % Math.max(1, llms.length)] || "";
      $("pRows").insertAdjacentHTML("beforeend", rowHtml({ id: 0, name: l ? llmName(l).slice(0, 40) : `AI ${n + 1}`, llm: l, role: "" }, n));
      bindRows();
    };
    $("cancelD").onclick = closeDialog;
    $("saveD").onclick = async () => {
      const participants = [...$("pRows").children].map((r) => ({ id: Number(r.dataset.id) || 0, name: r.querySelector(".p-name").value.trim(), llm: r.querySelector(".p-llm").value, role: r.querySelector(".p-role").value.trim() }));
      try {
        const saved = await api("meetings/save", { id: m ? m.id : 0, title: $("fTitle").value, purpose: $("fPurpose").value, background: $("fBg").value, lang: $("fLang").value, words: Number($("fWords").value), participants });
        closeDialog();
        await loadList();
        await openMeeting(saved.id);
      } catch (e) { oops(e); }
    };
    $("fTitle").focus();
  }
  function closeDialog() { $("dialog").classList.add("hidden"); $("dialogBox").innerHTML = ""; }
  $("dialog").addEventListener("mousedown", (e) => { if (e.target === $("dialog")) closeDialog(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("dialog").classList.contains("hidden")) closeDialog(); });

  // =======================================================================================================
  // Invited people (the website)
  // =======================================================================================================
  const G = { token: store.get("aim.token"), cur: null, msgs: [], lastId: 0, me: 0, timer: null, hand: false };

  function guestJoin(message) {
    clearTimeout(G.timer);
    $("root").className = "root";
    $("root").innerHTML = `<div class="join"><form class="joinbox" id="joinForm">
      <h1><img src="icon.svg" alt="">${t("joinTitle")} <span style="margin-left:auto">${langBtn()}</span></h1>
      ${message ? `<p class="bad">${esc(message)}</p>` : ""}
      <label class="field"><span>${t("code")}</span><input id="jCode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" maxlength="24"></label>
      <label class="field"><span>${t("yourName")}</span><input id="jName" maxlength="40" autocomplete="nickname"></label>
      <p class="note">${t("joinNote")}</p>
      <button type="submit" class="btn primary">${t("join")}</button></form></div>`;
    bindLang(() => guestJoin(message));
    const fromLink = new URLSearchParams(location.hash.slice(1)).get("code");
    if (fromLink) $("jCode").value = fromLink;
    $("joinForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api("join", { code: $("jCode").value, name: $("jName").value });
        G.token = r.token; store.set("aim.token", r.token); G.msgs = []; G.lastId = 0;
        guestMeeting(true);
      } catch (err) { oops(err); }
    };
  }

  async function guestMeeting(full) {
    clearTimeout(G.timer);
    try {
      const r = await api("view", { token: G.token, since: full ? 0 : G.lastId });
      G.me = r.me;
      const m = r.meeting;
      const fresh = m.messages.filter((x) => x.id > G.lastId);
      if (full) G.msgs = [];
      G.msgs.push(...fresh);
      if (fresh.length) G.lastId = fresh[fresh.length - 1].id;
      const first = full || !G.cur;
      G.cur = m;
      renderGuest(first, fresh);
      G.timer = setTimeout(() => guestMeeting(false), document.hidden ? 8000 : 2500);
    } catch (e) {
      if (e.status === 401) { G.token = null; store.set("aim.token", null); G.cur = null; guestJoin(G.msgs.length ? t("gone") : ""); return; }
      G.timer = setTimeout(() => guestMeeting(false), 6000);
    }
  }

  function renderGuest(full, fresh) {
    const m = G.cur;
    const ended = m.status !== "open";
    const me = m.participants.find((p) => p.id === G.me);
    if (full) {
      $("root").className = "root";
      $("root").innerHTML = `<section class="main guest"><div class="head" id="head"></div><div class="people" id="people"></div>
        <div class="body"><div class="talk"><div class="feed" id="feed"></div>
          <div class="compose"><textarea id="say" rows="1" maxlength="1000" placeholder="${esc(t("sayHint"))}"></textarea>
            <div class="opts"><button type="button" class="btn" id="handBtn"></button><button type="button" class="btn primary" id="sendBtn">${t("send")}</button></div></div></div>
          <div class="aside" id="aside"></div></div></section>`;
      const say = $("say");
      const send = async () => {
        const text = say.value.trim();
        if (!text) return;
        try { await api("say", { token: G.token, text }); say.value = ""; guestMeeting(false); } catch (e) { oops(e); }
      };
      say.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
      say.oninput = () => { say.style.height = "auto"; say.style.height = Math.min(160, say.scrollHeight) + "px"; };
      $("sendBtn").onclick = send;
      $("handBtn").onclick = () => api("hand", { token: G.token, up: !(G.cur.participants.find((p) => p.id === G.me) || {}).hand }).then(() => guestMeeting(false), oops);
    }
    $("head").innerHTML = `<h1 title="${esc(m.purpose || "")}">${esc(m.title)}</h1><span class="status">${ended ? t("ended") : t("open")}</span>${langBtn()}
      <button type="button" class="btn sm" id="leaveBtn">${t("leave")}</button>`;
    bindLang(() => renderGuest(true, []));
    $("leaveBtn").onclick = async () => { if (!confirm(t("confirmLeave"))) return; try { await api("leave", { token: G.token }); } catch { } G.token = null; store.set("aim.token", null); G.cur = null; guestJoin(""); };
    $("people").innerHTML = m.participants.filter((p) => p.state !== "left").map((p) => chipHtml(p, false)).join("");
    const people = new Map(m.participants.map((p) => [p.id, p]));
    const feed = $("feed");
    const atEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    if (full) feed.innerHTML = G.msgs.map((x) => messageHtml(x, people, G.me)).join("") || `<div class="empty">${t("waitingChair")}</div>`;
    else if (fresh.length) { if (!feed.querySelector(".msg, .sys")) feed.innerHTML = ""; feed.insertAdjacentHTML("beforeend", fresh.map((x) => messageHtml(x, people, G.me)).join("")); }
    if (full || (fresh.length && atEnd)) feed.scrollTop = feed.scrollHeight;
    $("handBtn").textContent = me && me.hand ? t("lowerMine") : t("raise");
    $("handBtn").disabled = ended; $("say").disabled = ended; $("sendBtn").disabled = ended;
    $("aside").innerHTML = `${m.purpose ? `<div class="box"><h3>${t("purpose")}</h3><p>${esc(m.purpose)}</p></div>` : ""}
      ${m.minutes ? `<div class="box"><h3>📝 ${t("minutesFinal")}</h3><div class="md">${md(m.minutes)}</div></div>` : `<p class="muted">${ended ? t("endedNote") : t("waitingChair")}</p>`}`;
  }

  // --- start ---------------------------------------------------------------------------------------------
  api("who").then((w) => {
    if (w.who === "owner") return owner();
    if (G.token) return guestMeeting(true);
    guestJoin("");
  }).catch((e) => { $("root").innerHTML = `<div class="empty bad">${esc(e.message)}</div>`; });
})();
