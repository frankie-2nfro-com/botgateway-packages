// App kit - the application's login page (login.html). The gateway checks the password (apppass.rs): this posts
// it to ../_gw/login and goes where the gateway says (back to the page the owner opened). Languages: add one to
// WORDS (the key is the kit's language code, as the app's `languages`); the page uses the browser's kit language
// (kit-lang, chosen on the app's own pages), else the language the app's page was shown in (its <html lang>,
// kept by the gateway's watch.js), else the browser's, else English.
"use strict";
(() => {
  const WORDS = {
    en: { need: "This application needs its password.", label: "Password", go: "Log in", wrong: "Wrong password.",
      wait: "Too many tries - please wait 15 minutes.", bad: "Could not log in - please try again." },
    zh: { need: "此應用程式需要密碼。", label: "密碼", go: "登入", wrong: "密碼不正確。",
      wait: "錯誤太多次，請 15 分鐘後再試。", bad: "未能登入，請再試。" },
  };
  const NAMES = { en: "EN", zh: "中文" };
  const $ = (id) => document.getElementById(id);
  let saved = "";
  try { saved = localStorage.getItem("kit-lang") || ""; } catch (_) { }
  let page = "";
  try { page = (localStorage.getItem("botgw-lang:" + location.pathname.replace(/_gw\/login$/, "")) || "").slice(0, 2).toLowerCase(); } catch (_) { }
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  let lang = WORDS[saved] ? saved : WORDS[page] ? page : WORDS[browser] ? browser : "en";
  const show = () => {
    const w = WORDS[lang];
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : lang;
    $("need").textContent = w.need; $("label").textContent = w.label; $("go").textContent = w.go; $("err").textContent = "";
    $("langs").innerHTML = Object.keys(WORDS).map((k) => `<button type="button" data-lang="${k}" class="${k === lang ? "on" : ""}">${NAMES[k] || k}</button>`).join("");
  };
  $("langs").classList.toggle("hidden", Object.keys(WORDS).length < 2);
  $("langs").addEventListener("click", (e) => {
    const k = e.target.dataset && e.target.dataset.lang;
    if (!k) return;
    lang = k;
    try { localStorage.setItem("kit-lang", k); } catch (_) { }
    show();
  });
  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const w = WORDS[lang];
    $("err").textContent = "";
    $("go").disabled = true;
    try {
      const r = await fetch("../_gw/login", { method: "POST", headers: { "x-botgateway": "1", "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("password").value, next: new URLSearchParams(location.search).get("next") || "" }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.go) return location.replace(d.go);
      $("err").textContent = w[d.error] || w.bad;
    } catch (_) { $("err").textContent = w.bad; }
    $("go").disabled = false;
  });
  show();
})();
