// The checks a game pack must pass (myarcade_game_dev_spec.md). Plain JavaScript with no host calls, so it also runs in the
// developer's check tool (webgames/gamekit/check-game.mjs).
//   checkPack({ files: [{ name, size }], read: (name) => text }) -> { errors: [...], warnings: [...] }

export const MAX_FILES = 20;
export const MAX_FILE = 4 * 1024 * 1024;
export const TYPES = {
  js: "text/javascript; charset=utf-8", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
  woff2: "font/woff2", bin: "application/octet-stream",
};
const LANGS = new Set(["en", "zh-TW", "zh-CN", "ja", "es"]);
const WORDS = new Set(["left", "right", "up", "down", "jump"]);
export const NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
export const ID = /^[a-z0-9-]{2,32}$/;

// What the sandboxed frame refuses, or what does not belong in a game. Comments are removed first.
const REFUSED = [
  [/\beval\s*\(/, "eval() is refused by the security policy"],
  [/\bnew\s+Function\b/, "new Function is refused by the security policy"],
  [/\bset(?:Timeout|Interval)\s*\(\s*['"`]/, "setTimeout / setInterval with a string is refused by the security policy"],
  [/\bWebAssembly\b/, "WebAssembly is refused by the security policy"],
  [/\bnew\s+Audio\s*\(/, "new Audio() does not belong in a game: use Web Audio"],
  [/createElement\(\s*['"`](?:audio|video|iframe|script|link|style)['"`]/, "creating audio, video, iframe, script, link or style elements does not work: draw in the canvas, use Web Audio"],
  [/\bimportScripts\s*\(/, "importScripts is not allowed"],
  [/\bnew\s+(?:WebSocket|EventSource|RTCPeerConnection|XMLHttpRequest)\b/, "a game has no network"],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/, "a game has no browser storage or cookies"],
  [/\bdocument\.body\b|\bdocument\.write\b|\bwindow\.open\s*\(|\blocation\.(?:href|assign|replace)\b/, "a game stays inside its canvas: no document.body, document.write, window.open or navigation"],
];

// Names worth a warning (spec section 1). A warning does not block: the responsibility is the owner's.
const KNOWN = /\b(tetris|tetromino|super\s*mario|mario|luigi|nintendo|zelda|pok[eé]mon|pikachu|pac-?\s?man|sonic|sega|street\s*fighter|mortal\s*kombat|minecraft|fortnite|angry\s*birds|flappy\s*bird|candy\s*crush|space\s*invaders|donkey\s*kong)\b/i;

function stripComments(source) {
  // By slices, not character by character: this runs in the sandbox, on bundles of up to 4 MB.
  const out = [];
  let i = 0;
  let from = 0;
  let quote = null;
  const n = source.length;
  while (i < n) {
    const c = source.charCodeAt(i);
    if (quote) {
      if (c === 92) i += 2;
      else {
        if (c === quote) quote = null;
        i += 1;
      }
    } else if (c === 34 || c === 39 || c === 96) {
      quote = c;
      i += 1;
    } else if (c === 47 && source.charCodeAt(i + 1) === 47) {
      out.push(source.slice(from, i));
      const end = source.indexOf("\n", i);
      i = end < 0 ? n : end;
      from = i;
    } else if (c === 47 && source.charCodeAt(i + 1) === 42) {
      out.push(source.slice(from, i));
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      from = i;
    } else {
      i += 1;
    }
  }
  out.push(source.slice(from, n));
  return out.join("");
}

function checkManifest(g, names, err, warn) {
  const need = (ok, message) => { if (!ok) err(`game.json: ${message}`); };
  need(g && typeof g === "object" && !Array.isArray(g), "must be an object");
  if (!g || typeof g !== "object") return;
  need(g.spec === 1, "spec must be 1");
  need(typeof g.id === "string" && ID.test(g.id), 'id: lower-case letters, digits, "-"; 2 to 32 characters');
  need(typeof g.version === "string" && /^\d+\.\d+\.\d+$/.test(g.version), "version must be major.minor.patch");
  need(g.kind === "2d" || g.kind === "3d", "kind must be 2d or 3d");
  need(["canvas", "three", "phaser", "other"].includes(g.engine), "engine must be canvas, three, phaser or other");
  need(g.entry === "game.js", "entry must be game.js");
  need(typeof g.cover === "string" && names.includes(g.cover), "cover must be a file in the pack");
  need(g.stage === "wide" || g.stage === "standard", "stage must be wide or standard");
  need(Array.isArray(g.tags), "tags must be a list");
  need(g.max_score === undefined || (Number.isInteger(g.max_score) && g.max_score > 0), "max_score must be a positive integer");

  const text = g.text && typeof g.text === "object" ? g.text : {};
  need(text.en, "text.en is required");
  for (const [lang, t] of Object.entries(text)) {
    need(LANGS.has(lang), `text.${lang}: not a language of the shell`);
    for (const key of ["title", "blurb", "howto"]) need(typeof t?.[key] === "string" && t[key].trim(), `text.${lang}.${key} is required`);
  }

  const label = (where, value, words) => {
    if (typeof value === "string") need(words.has(value), `${where}: "${value}" is not a shell word; give a language map`);
    else need(value && typeof value.en === "string", `${where}: a language map needs "en"`);
  };
  need(Array.isArray(g.panel), "panel must be a list");
  for (const [i, row] of (Array.isArray(g.panel) ? g.panel : []).entries()) {
    if (row === "score" || row === "level") continue;
    need(row && typeof row.key === "string", `panel[${i}]: "score", "level" or {key, label}`);
    label(`panel[${i}].label`, row?.label, new Set());
  }
  need(Array.isArray(g.pad) && g.pad.length > 0, "pad must list the touch buttons");
  for (const [i, button] of (Array.isArray(g.pad) ? g.pad : []).entries()) {
    need(button && typeof button.action === "string" && button.action, `pad[${i}].action is required`);
    label(`pad[${i}].label`, button?.label, WORDS);
  }

  const found = JSON.stringify([g.id, g.text]).match(KNOWN);
  if (found) warn(`game.json mentions "${found[0]}": make sure this is not a copy of an existing game`);
}

function checkScript(raw, err, warn) {
  const source = stripComments(raw);
  if (!/export\s*(?:\{[^}]*\bmount\b[^}]*\}|(?:async\s+)?function\s+mount\b|(?:const|let|var)\s+mount\b)/.test(source)) {
    err("game.js: must export a function called mount");
  }
  if (/\bimport\s*\(/.test(source) || /(?:^|[;\n}])\s*import\s*(?:[\w*{'"])/.test(source)) {
    err("game.js: no import: bundle everything into one file");
  }
  for (const [pattern, message] of REFUSED) if (pattern.test(source)) err(`game.js: ${message}`);
  const urls = source.match(/\b(?:https?:|wss?:)\/\/[^\s'"`)]+/g) ?? [];
  const outside = urls.filter((url) => !/^http:\/\/www\.w3\.org\//.test(url));
  if (outside.length) warn(`game.js: outside addresses, which the browser will refuse if loaded: ${[...new Set(outside)].slice(0, 5).join(", ")}`);
  const found = source.match(KNOWN);
  if (found) warn(`game.js mentions "${found[0]}": make sure this is not a copy of an existing game`);
}

export function checkPack({ files, read }) {
  const errors = [];
  const warnings = [];
  const err = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);
  const names = files.map((f) => f.name);

  if (files.length > MAX_FILES) err(`${files.length} files, at most ${MAX_FILES}`);
  for (const { name, size, folder } of files) {
    if (folder) {
      err(`${name}: sub-folders are not allowed, keep file names flat`);
      continue;
    }
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    if (!NAME.test(name)) err(`${name}: letters, digits, "-", "_", "." only`);
    if (!TYPES[extension]) err(`${name}: this file type is not allowed`);
    if (size > MAX_FILE) err(`${name}: ${(size / 1048576).toFixed(1)} MB, at most 4 MB`);
    if (extension === "svg" && /<script|\son\w+\s*=/i.test(read(name))) err(`${name}: an SVG may not contain scripts`);
  }
  for (const name of ["game.json", "game.js"]) if (!names.includes(name)) err(`${name} is missing`);

  if (names.includes("game.json")) {
    try {
      checkManifest(JSON.parse(read("game.json")), names, err, warn);
    } catch (e) {
      err(`game.json: ${e.message}`);
    }
  }
  if (names.includes("game.js")) checkScript(read("game.js"), err, warn);
  return { errors, warnings };
}
