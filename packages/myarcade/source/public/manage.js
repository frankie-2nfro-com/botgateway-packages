// The owner's page (requirements 4): make games, test them, publish them. Everything it asks for is refused to anyone but the
// owner by the program, so this file holds nothing secret.
(() => {
  const WORDS = {
    en: {
      lobby: "Open the lobby", warnTitle: "Publishing a game is your own decision and your own risk.",
      warn: "Do not publish copies of existing games, their names, characters, art, music or look. You answer for what you publish; 2nfro and the makers of Bot Gateway do not check games.",
      make: "Make a game", describe: "Describe the game you want", describeHint: "What the player does, how it is won or lost, how it should look. An idea of your own, not a copy of a game that exists.",
      auto: "Make it now (your application's LLM)", ide: "Make it in my IDE (bigger games)",
      autoHint: "\"Make it now\" takes about 6 minutes and uses your LLM's quota. Ask Claude's Timeout must be at least 600 seconds (Workers). A game with pictures or sounds, or anything bigger, is for your IDE.",
      jobs: "In the making", noJobs: "Nothing is being made.",
      games: "Games", noGames: "No games yet.", players: "Players", noPlayers: "Nobody has signed up yet.", import: "Import a game pack (for games made elsewhere)",
      importHint: "Choose all the files of one pack (game.json, game.js, cover ...).", importBtn: "Choose files",
      test: "Test", publish: "Publish", unpublish: "Unpublish", remove: "Delete", deleteGame: "Delete game", change: "Ask for changes", retry: "Ask again", dismiss: "Dismiss",
      live: "public", draft: "draft", earlier: "not public", off: "not public", plays: "plays", cancel: "Cancel", save: "Save",
      stWaiting: "Waiting for your IDE", stWorking: "Your IDE is working", stAsking: "Waiting for your LLM (minutes)", stReady: "Ready to test", stErrors: "The checks found problems", stFailed: "Failed",
      copyLine: "Paste this into Cursor, Claude Code or another AI tool connected to this gateway:", copy: "Copy", copied: "Copied",
      ideSetup: "The tool needs this gateway's MCP connection (Dashboard, Client). Big builds also need the inbox folder chosen once in this application's Config.",
      publishTitle: "Publish", publishBody: "Anyone on the internet can then play this version. The website itself must also be published in the gateway.",
      statement: "I publish this game on my own decision. I have the rights to everything in it, including its name, code, art, music, characters and look, and it does not copy or imitate another game. I alone bear all risk and responsibility for it, including any claim by others. 2nfro and the makers of Bot Gateway do not check games, and take no responsibility for them or for what happens because of them.",
      warnings: "Warnings", changeTitle: "What should change?", confirmDelete: "Delete this for good? Its plays and scores go with it.", confirmVersion: "Delete this version for good?",
      name: "Name", best: "Best", joined: "Joined", resetPassword: "New password", clearScores: "Clear scores", deletePlayer: "Delete", newPassword: "New password for {name} (at least 8 characters). Tell them yourself; they are logged out.",
      confirmPlayer: "Delete {name} with their scores?", confirmClear: "Clear the scores of {name}?", agreedOn: "statement agreed", size: "KB", failedHint: "If it timed out, raise Timeout on the Ask Claude worker (at least 600 seconds) and ask again.",
    },
    zh: {
      lobby: "開啟大廳", warnTitle: "發佈遊戲由你決定，風險亦由你承擔。",
      warn: "請勿發佈現有遊戲的抄襲版本，或使用其名稱、角色、美術、音樂或外觀。你須為所發佈的內容負責；2nfro 及 Bot Gateway 的製作者不會檢查遊戲。",
      make: "製作遊戲", describe: "描述你想要的遊戲", describeHint: "玩家做甚麼、如何勝負、想要怎樣的外觀。請用你自己的構思，不要抄襲現有遊戲。",
      auto: "立即製作（應用程式的 LLM）", ide: "在 IDE 製作（較大的遊戲）",
      autoHint: "「立即製作」約需 6 分鐘，並會用你的 LLM 額度。Ask Claude 的 Timeout 必須至少 600 秒（Workers）。有圖片或音效、或規模較大的遊戲，請用 IDE。",
      jobs: "製作中", noJobs: "目前沒有製作中的遊戲。",
      games: "遊戲", noGames: "還沒有遊戲。", players: "玩家", noPlayers: "還沒有人登記。", import: "匯入遊戲包（其他地方做好的遊戲）",
      importHint: "選擇同一個遊戲包的所有檔案（game.json、game.js、封面等）。", importBtn: "選擇檔案",
      test: "測試", publish: "發佈", unpublish: "下架", remove: "刪除", deleteGame: "刪除遊戲", change: "要求修改", retry: "再試一次", dismiss: "移除",
      live: "公開中", draft: "草稿", earlier: "未公開", off: "未公開", plays: "次遊玩", cancel: "取消", save: "儲存",
      stWaiting: "等待你的 IDE", stWorking: "IDE 製作中", stAsking: "等待 LLM（需時數分鐘）", stReady: "可以測試", stErrors: "檢查發現問題", stFailed: "失敗",
      copyLine: "把這句貼到已連接此閘道的 Cursor、Claude Code 或其他 AI 工具：", copy: "複製", copied: "已複製",
      ideSetup: "工具需要連接此閘道的 MCP（Dashboard → Client）。較大的打包檔還要在此應用程式的 Config 選一次收件資料夾。",
      publishTitle: "發佈", publishBody: "發佈後，互聯網上任何人都可以玩這個版本。網站本身也要在閘道發佈。",
      statement: "本人自行決定發佈此遊戲。本人擁有遊戲內所有內容（包括名稱、程式碼、美術、音樂、角色及外觀）的權利，遊戲亦沒有抄襲或模仿其他遊戲。一切風險及責任（包括他人提出的任何申索）概由本人獨自承擔。2nfro 及 Bot Gateway 的製作者不會檢查遊戲，亦不會就遊戲或因遊戲引致的任何事情負責。",
      warnings: "警告", changeTitle: "要改甚麼？", confirmDelete: "永久刪除？遊玩次數及分數也會一併刪除。", confirmVersion: "永久刪除這個版本？",
      name: "名稱", best: "最高分", joined: "登記日期", resetPassword: "重設密碼", clearScores: "清除分數", deletePlayer: "刪除", newPassword: "{name} 的新密碼（至少 8 個字元）。請親自告知對方；對方會被登出。",
      confirmPlayer: "刪除 {name} 及其分數？", confirmClear: "清除 {name} 的分數？", agreedOn: "已同意聲明", size: "KB", failedHint: "如果是超時，請把 Ask Claude worker 的 Timeout 調高至至少 600 秒，然後再試。",
    },
  };

  const key = "myarcade-manage-lang";
  const stored = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
  let lang = stored || (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
  const t = (name, vars = {}) => WORDS[lang][name].replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "");

  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === "class") node.className = value;
      else if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else if (value !== undefined && value !== null && value !== false) node[name] = value;
    }
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  };

  async function api(path, body = {}) {
    const response = await fetch(`api/admin/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-botgateway": "1" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.text()) || String(response.status));
    return response.status === 204 ? null : response.json();
  }

  function show(message) {
    $("refused").hidden = !message;
    $("refused").textContent = message || "";
  }

  async function act(path, body) {
    try {
      show("");
      const answer = await api(path, body);
      await load();
      render();
      return answer;
    } catch (e) {
      show(e.message);
      return null;
    }
  }

  // --- dialogs (the browser's own would stop everything else on the computer's page) -------------------------------------

  function ask(build) {
    return new Promise((done) => {
      const dialog = $("dialog");
      dialog.textContent = "";
      const close = (value) => { dialog.close(); done(value); };
      build(dialog, close);
      dialog.oncancel = (event) => { event.preventDefault(); close(null); };
      dialog.showModal();
    });
  }

  const confirmBox = (message, okWord) => ask((d, close) => {
    d.append(el("p", {}, message), el("div", { class: "actions" },
      el("button", { type: "button", onclick: () => close(false) }, t("cancel")),
      el("button", { type: "button", class: "danger", onclick: () => close(true) }, okWord)));
  });

  const inputBox = (title, password) => ask((d, close) => {
    const field = password ? el("input", { type: "password", autocomplete: "new-password" }) : el("textarea", {});
    d.append(el("h3", {}, title), field, el("div", { class: "actions" },
      el("button", { type: "button", onclick: () => close(null) }, t("cancel")),
      el("button", { type: "button", class: "main", onclick: () => close(field.value.trim() ? field.value : null) }, t("save"))));
  });

  // The statement (requirements 5.2): for every game and every version; the program checks it again.
  const publishBox = (title, version) => ask((d, close) => {
    const go = el("button", { type: "button", class: "main", disabled: true, onclick: () => close(true) }, t("publish"));
    const tick = el("input", { type: "checkbox", onchange: () => { go.disabled = !tick.checked; } });
    d.append(el("h3", {}, `${t("publishTitle")}: ${title} ${version}`), el("p", {}, t("publishBody")),
      el("label", { class: "tick" }, tick, el("span", {}, t("statement"))),
      el("div", { class: "actions" }, el("button", { type: "button", onclick: () => close(false) }, t("cancel")), go));
  });

  // --- the page --------------------------------------------------------------------------------------------------------

  const titleOf = (manifest) => manifest?.text?.[lang === "zh" ? "zh-TW" : "en"]?.title || manifest?.text?.en?.title || manifest?.id || "";
  let state = null;
  let draft = "";
  let timer = 0;

  function makeSection() {
    const area = el("textarea", { id: "describe", placeholder: t("describeHint"), value: draft, oninput: () => { draft = area.value; } });
    const start = async (mode) => {
      if (!area.value.trim()) { area.focus(); return; }
      const answer = await act("jobs", { description: area.value, mode });
      if (answer) { draft = ""; render(); }
    };
    return el("section", {},
      el("h2", {}, t("make")),
      el("p", { class: "warning" }, el("strong", {}, t("warnTitle")), " ", t("warn")),
      el("div", { class: "card" },
        el("label", { htmlFor: "describe" }, t("describe")), area,
        el("div", { class: "row", style: "margin-top:10px" },
          el("button", { type: "button", class: "main", onclick: () => start("llm") }, t("auto")),
          el("button", { type: "button", onclick: () => start("ide") }, t("ide"))),
        el("p", { class: "muted" }, t("autoHint")),
        el("details", {}, el("summary", {}, t("import")), importer())));
  }

  function importer() {
    const input = el("input", { type: "file", multiple: true, hidden: true, onchange: async () => {
      const files = [...input.files];
      if (!files.length) return;
      try {
        show("");
        const { job } = await api("import");
        for (const file of files) {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = () => reject(new Error(file.name));
            reader.readAsDataURL(file);
          });
          await api(`jobs/${job}/file`, { name: file.name, data });
        }
        await api(`jobs/${job}/done`);
      } catch (e) {
        show(e.message);
      }
      input.value = "";
      await load();
      render();
    } });
    return el("div", {}, el("p", { class: "muted" }, t("importHint")), input, el("button", { type: "button", onclick: () => input.click() }, t("importBtn")));
  }

  function jobsSection() {
    const jobs = state.jobs.filter((j) => j.state !== "ready");
    const states = { waiting: "stWaiting", working: "stWorking", asking: "stAsking", errors: "stErrors", failed: "stFailed" };
    return el("section", {}, el("h2", {}, t("jobs")),
      jobs.length ? jobs.map((job) => {
        const line = `Make MyArcade job ${job.id} with the MyArcade tools (arcade_job_get first).`;
        return el("div", { class: "card" },
          el("div", { class: "row" }, el("span", { class: `badge${job.state === "errors" || job.state === "failed" ? " bad" : ""}` }, t(states[job.state] || "stWorking")),
            el("span", { class: "grow" }, job.comment ? `${job.description} — ${job.comment}` : job.description)),
          job.mode === "ide" && job.state === "waiting" ? el("div", {},
            el("p", { class: "muted" }, t("copyLine")),
            el("div", { class: "row" }, el("div", { class: "line grow" }, line),
              el("button", { type: "button", onclick: async (event) => {
                try { await navigator.clipboard.writeText(line); event.target.textContent = t("copied"); } catch { /* it can be selected by hand */ }
              } }, t("copy"))),
            el("p", { class: "muted" }, t("ideSetup"))) : null,
          job.notes.length ? el("ul", { class: "plain muted" }, job.notes.slice(-6).map((n) => el("li", {}, n.note ? `${n.step}: ${n.note}` : n.step))) : null,
          job.errors.length ? el("ul", { class: "plain error" }, job.errors.map((e) => el("li", {}, e))) : null,
          job.state === "failed" && job.mode === "llm" ? el("p", { class: "muted" }, t("failedHint")) : null,
          el("div", { class: "row", style: "margin-top:8px" },
            job.mode === "llm" && (job.state === "failed" || job.state === "errors") ? el("button", { type: "button", onclick: () => act(`jobs/${job.id}/retry`) }, t("retry")) : null,
            job.state !== "asking" ? el("button", { type: "button", class: "ghost", onclick: () => act(`jobs/${job.id}/remove`) }, t("dismiss")) : null));
      }) : el("p", { class: "muted" }, t("noJobs")));
  }

  function gamesSection() {
    return el("section", {}, el("h2", {}, t("games")),
      state.games.length ? state.games.map((game) => {
        const newest = game.versions[0];
        const manifest = (game.versions.find((v) => v.version === game.live_version) || newest)?.manifest;
        const title = titleOf(manifest);
        const cover = newest && `api/games/${game.id}/${newest.version}/${newest.manifest.cover}`;
        return el("article", { class: "card game" },
          cover ? el("img", { src: cover, alt: "" }) : el("span", {}),
          el("div", {},
            el("div", { class: "row" }, el("h3", { class: "grow" }, title),
              el("span", { class: `badge${game.live_version ? " live" : ""}` }, game.live_version ? `${t("live")} ${game.live_version}` : t("off")),
              el("span", { class: "muted" }, `${game.plays} ${t("plays")}`)),
            el("ul", { class: "versions" }, game.versions.map((v) => el("li", {},
              el("span", { class: "name" }, v.version),
              el("span", { class: `badge${v.version === game.live_version ? " live" : ""}` }, v.version === game.live_version ? t("live") : v.agreed ? t("earlier") : t("draft")),
              el("span", { class: "muted grow" }, `${Math.ceil(v.size / 1024)} ${t("size")}`),
              el("a", { href: `./#/test/${game.id}/${v.version}` }, t("test")),
              v.version !== game.live_version ? el("button", { type: "button", onclick: async () => {
                if (await publishBox(title, v.version)) await act(`games/${game.id}/publish`, { version: v.version, agreed: true, statement: state.statement });
              } }, t("publish")) : el("button", { type: "button", onclick: () => act(`games/${game.id}/unpublish`) }, t("unpublish")),
              el("button", { type: "button", onclick: async () => {
                const comment = await inputBox(t("changeTitle"));
                if (comment) await act("jobs", { description: `${title}: ${manifest?.text?.en?.blurb || ""}`, comment, mode: "llm", base_game: game.id, base_version: v.version });
              } }, t("change")),
              v.version !== game.live_version && game.versions.length > 1 ? el("button", { type: "button", class: "ghost danger", onclick: async () => {
                if (await confirmBox(t("confirmVersion"), t("remove"))) await act(`games/${game.id}/remove-version`, { version: v.version });
              } }, t("remove")) : null,
              v.warnings.length ? el("details", { style: "width:100%" }, el("summary", {}, t("warnings")), el("ul", { class: "plain" }, v.warnings.map((w) => el("li", {}, w)))) : null))),
            el("div", { class: "row", style: "margin-top:8px" }, el("button", { type: "button", class: "ghost danger", onclick: async () => {
              if (await confirmBox(`${title}: ${t("confirmDelete")}`, t("deleteGame"))) await act(`games/${game.id}/delete`);
            } }, t("deleteGame")))));
      }) : el("p", { class: "muted" }, t("noGames")));
  }

  function playersSection() {
    return el("section", {}, el("h2", {}, t("players")),
      state.players.length ? el("div", { class: "table-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, [t("name"), t("plays"), t("best"), t("joined"), ""].map((h) => el("th", {}, h)))),
        el("tbody", {}, state.players.map((p) => el("tr", {},
          el("td", {}, p.name), el("td", {}, String(p.plays)), el("td", {}, String(p.best ?? "—")), el("td", {}, p.created.slice(0, 10)),
          el("td", {}, el("div", { class: "row" },
            el("button", { type: "button", onclick: async () => {
              const password = await inputBox(t("newPassword", { name: p.name }), true);
              if (password) await act(`players/${p.id}/password`, { password });
            } }, t("resetPassword")),
            el("button", { type: "button", class: "ghost", onclick: async () => {
              if (await confirmBox(t("confirmClear", { name: p.name }), t("clearScores"))) await act(`players/${p.id}/clear`);
            } }, t("clearScores")),
            el("button", { type: "button", class: "ghost danger", onclick: async () => {
              if (await confirmBox(t("confirmPlayer", { name: p.name }), t("deletePlayer"))) await act(`players/${p.id}/delete`);
            } }, t("deletePlayer"))))))))) : el("p", { class: "muted" }, t("noPlayers")));
  }

  function render() {
    if (!state) return;
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    $("lobby").textContent = t("lobby");
    $("lang").textContent = lang === "zh" ? "EN" : "中文";
    // Not while the owner is typing or a dialog is open: the live refresh must not take the words away.
    const app = $("app");
    app.textContent = "";
    app.append(makeSection(), jobsSection(), gamesSection(), playersSection());
  }

  async function load() {
    clearTimeout(timer);
    try {
      state = await api("state");
      const busy = document.activeElement?.closest?.("textarea, input, details") || $("dialog").open;
      if (!busy) render();
    } catch (e) {
      show(e.message);
    }
    // Live while something is being made: its steps and its result appear by themselves.
    if (state?.jobs.some((j) => ["waiting", "working", "asking"].includes(j.state))) timer = setTimeout(load, 3000);
  }

  $("lang").addEventListener("click", () => {
    lang = lang === "zh" ? "en" : "zh";
    try { localStorage.setItem(key, lang); } catch { /* it lasts until the page is closed */ }
    render();
  });
  void load();
})();
