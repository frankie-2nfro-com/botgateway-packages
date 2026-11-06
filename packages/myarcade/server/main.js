// MyArcade (DOCUMENTATIONS/app_myarcade_requirements.txt): a public arcade whose games are data. The owner makes games on the
// local page; visitors play the published ones. A game's code never runs here: it runs in the visitor's browser, in a
// sandboxed frame (`sandbox_pages`). This program only stores the files, checks them and answers who may have them.
import { checkPack, ID, NAME, TYPES } from "./check.js";
import { DEMOS } from "./demos.js";
import { aiTask, GAME_SCHEMA, HOW_TO_DELIVER, SPEC } from "./prompts.js";

export const STATEMENT_VERSION = 1;

const now = () => new Date().toISOString();
const q = (sql, p = []) => host.db.query(sql, p);
const one = (sql, p = []) => host.db.query(sql, p)[0] || null;
const run = (sql, p = []) => host.db.exec(sql, p);
const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const text = (v, max = 4000) => String(v ?? "").slice(0, max);

/** A refusal whose words are meant for whoever asked. */
class Refused extends Error {}
const refuse = (message) => { throw new Refused(message); };

// --- data --------------------------------------------------------------------------------------------------

export function onInstall() {
  host.db.script(`
    CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, live_version TEXT, released TEXT, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS versions (game_id TEXT NOT NULL, version TEXT NOT NULL, manifest TEXT NOT NULL, files TEXT NOT NULL,
      source TEXT NOT NULL, warnings TEXT NOT NULL DEFAULT '[]', created TEXT NOT NULL, PRIMARY KEY (game_id, version));
    CREATE TABLE IF NOT EXISTS statements (id INTEGER PRIMARY KEY, game_id TEXT NOT NULL, version TEXT NOT NULL,
      statement_version INTEGER NOT NULL, agreed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, mode TEXT NOT NULL, state TEXT NOT NULL, description TEXT NOT NULL,
      comment TEXT, base_game TEXT, base_version TEXT, game_id TEXT, version TEXT, run TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      errors TEXT NOT NULL DEFAULT '[]', warnings TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '[]', created TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS job_files (job_id INTEGER NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY (job_id, name));
    CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, player_id INTEGER NOT NULL, expires TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plays (id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL, game_id TEXT NOT NULL, started TEXT NOT NULL,
      ended TEXT, score INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, stats TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS plays_player ON plays (player_id, id);
    CREATE TABLE IF NOT EXISTS counts (game_id TEXT PRIMARY KEY, plays INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS best (game_id TEXT NOT NULL, player_id INTEGER NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (game_id, player_id));
    CREATE INDEX IF NOT EXISTS best_game ON best (game_id, score);
    CREATE TABLE IF NOT EXISTS login_fails (name_key TEXT PRIMARY KEY, fails INTEGER NOT NULL, until INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  if (!one("SELECT 1 AS x FROM meta WHERE key = 'demos'")) {
    run("INSERT INTO meta (key, value) VALUES ('demos', '1')");
    for (const demo of DEMOS) addDemo(demo);
  }
}

export function onUpdate() {
  onInstall();
}

export function onRestore() {
  onInstall();
}

function addDemo(demo) {
  const job = newJob("demo", "working", `Demo: ${demo.id}`);
  for (const [name, content] of Object.entries(demo.files)) stage(job, name, content);
  finish(job, "demo");
}

// --- a game pack on its way in: staged files, checked, then a draft ------------------------------------------

const stagedName = (job, name) => `t-${job}-${name}`;
const fileName = (game, version, name) => `g-${game}-${version}-${name}`;

function newJob(mode, state, description, extra = {}) {
  return run(`INSERT INTO jobs (mode, state, description, comment, base_game, base_version, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [mode, state, description, extra.comment || null, extra.base_game || null, extra.base_version || null, now(), now()]).last_id;
}

function stage(job, name, content, encoding = "text") {
  if (!NAME.test(name)) refuse(`${name}: letters, digits, "-", "_", "." only`);
  const info = host.files.write(stagedName(job, name), content, encoding);
  run("INSERT INTO job_files (job_id, name, size) VALUES (?, ?, ?) ON CONFLICT (job_id, name) DO UPDATE SET size = excluded.size", [job, name, info.size]);
}

function clearStaged(job) {
  for (const { name } of q("SELECT name FROM job_files WHERE job_id = ?", [job])) {
    try { host.files.remove(stagedName(job, name)); } catch { /* gone already */ }
  }
  run("DELETE FROM job_files WHERE job_id = ?", [job]);
}

const jobState = (job, state, fields = {}) => {
  const keys = Object.keys(fields);
  run(`UPDATE jobs SET state = ?, updated = ?${keys.map((k) => `, ${k} = ?`).join("")} WHERE id = ?`,
    [state, now(), ...keys.map((k) => fields[k]), job]);
};

function nextVersion(game, wanted) {
  let version = wanted;
  while (one("SELECT 1 AS x FROM versions WHERE game_id = ? AND version = ?", [game, version])) {
    const [a, b, c] = version.split(".").map(Number);
    version = `${a}.${b}.${c + 1}`;
  }
  return version;
}

/** Checks what is staged. Good: it becomes a draft. Otherwise the job keeps the files and says what is wrong. */
function finish(job, source) {
  const row = one("SELECT * FROM jobs WHERE id = ?", [job]);
  const files = q("SELECT name, size FROM job_files WHERE job_id = ?", [job]);
  const read = (name) => host.files.read(stagedName(job, name), "text");
  const { errors, warnings } = checkPack({ files, read });
  let manifest = null;
  if (!errors.length) {
    manifest = JSON.parse(read("game.json"));
    if (row.base_game && manifest.id !== row.base_game) manifest.id = row.base_game;
    manifest.version = nextVersion(manifest.id, manifest.version);
    if (!ID.test(manifest.id)) errors.push("game.json: bad id");
  }
  if (errors.length) {
    jobState(job, "errors", { errors: JSON.stringify(errors), warnings: JSON.stringify(warnings) });
    return { state: "errors", errors, warnings };
  }
  stage(job, "game.json", JSON.stringify(manifest));
  const kept = [];
  for (const { name } of q("SELECT name FROM job_files WHERE job_id = ?", [job])) {
    const info = host.files.write(fileName(manifest.id, manifest.version, name), host.files.read(stagedName(job, name), "base64"), "base64");
    kept.push({ name, size: info.size });
  }
  host.db.transaction(() => {
    run("INSERT INTO games (id, created) VALUES (?, ?) ON CONFLICT (id) DO NOTHING", [manifest.id, now()]);
    run("INSERT INTO versions (game_id, version, manifest, files, source, warnings, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [manifest.id, manifest.version, JSON.stringify(manifest), JSON.stringify(kept), source, JSON.stringify(warnings), now()]);
    jobState(job, "ready", { game_id: manifest.id, version: manifest.version, errors: "[]", warnings: JSON.stringify(warnings) });
  });
  clearStaged(job);
  return { state: "ready", game: manifest.id, version: manifest.version, warnings };
}

// --- the LLM: one answer (host.ai) ---------------------------------------------------------------------------

function currentPack(game, version) {
  if (!game) return null;
  return {
    game_json: JSON.parse(host.files.read(fileName(game, version, "game.json"), "text")),
    game_js: host.files.read(fileName(game, version, "game.js"), "text"),
  };
}

function askLlm(job) {
  const row = one("SELECT * FROM jobs WHERE id = ?", [job]);
  const stagedCode = row.attempts > 0 && one("SELECT 1 AS x FROM job_files WHERE job_id = ? AND name = 'game.js'", [job]);
  const data = { specification: SPEC };
  if (row.attempts > 0) {
    data.errors = json(row.errors, []);
    if (stagedCode) data.current = { game_json: host.files.read(stagedName(job, "game.json"), "text"), game_js: host.files.read(stagedName(job, "game.js"), "text") };
  } else if (row.base_game) {
    data.current = currentPack(row.base_game, row.base_version);
  }
  try {
    const { run: id } = host.ai.run({ task: aiTask({ description: row.description, comment: row.comment, retry: row.attempts > 0 }), schema: GAME_SCHEMA, data, tag: { job } });
    jobState(job, "asking", { run: id, attempts: row.attempts + 1 });
  } catch (e) {
    jobState(job, "failed", { errors: JSON.stringify([text(e.message)]) });
  }
}

export function onAiResult(r) {
  const job = r.tag?.job;
  const row = job && one("SELECT * FROM jobs WHERE id = ?", [job]);
  if (!row || row.run !== r.run || row.state !== "asking") return;
  if (r.state !== "done") {
    jobState(job, "failed", { errors: JSON.stringify([text(r.error || "the LLM could not do it")]) });
    return;
  }
  try {
    stage(job, "game.json", JSON.stringify(r.answer.game_json));
    stage(job, "game.js", r.answer.game_js);
    const cover = String(r.answer.game_json?.cover || "cover.svg");
    stage(job, NAME.test(cover) ? cover : "cover.svg", r.answer.cover_svg);
  } catch (e) {
    jobState(job, "failed", { errors: JSON.stringify([text(e.message)]) });
    return;
  }
  const result = finish(job, "llm");
  // Sends back only the errors and the code: a whole new game costs far more (10.7).
  if (result.state === "errors" && row.attempts < 3) askLlm(job);
}

// --- players -------------------------------------------------------------------------------------------------

const SESSION_DAYS = 90;
const tokenKey = (token) => host.crypto.hmac("myarcade-session", String(token)).hex;

function playerOf(token) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const row = one("SELECT p.id, p.name FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = ? AND s.expires > ?", [tokenKey(token), now()]);
  return row || null;
}

function newSession(player) {
  run("DELETE FROM sessions WHERE expires <= ?", [now()]);
  const token = host.crypto.random(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  run("INSERT INTO sessions (token, player_id, expires) VALUES (?, ?, ?)", [tokenKey(token), player, expires]);
  return token;
}

function register(b) {
  const name = text(b.name, 64).trim();
  const password = String(b.password ?? "");
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return { error: "username" };
  if (password.length < 8 || password.length > 200) return { error: "short" };
  if (password !== String(b.confirm ?? "")) return { error: "mismatch" };
  if (one("SELECT 1 AS x FROM players WHERE name_key = ?", [name.toLowerCase()])) return { error: "taken" };
  // Sign-ups an hour, for all visitors together: nobody fills the owner's disk.
  const hour = new Date().toISOString().slice(0, 13);
  const bucket = one("SELECT value FROM meta WHERE key = 'signups'");
  const [at, n] = bucket ? bucket.value.split("|") : [hour, "0"];
  const count = at === hour ? Number(n) : 0;
  if (count >= 200) return { error: "limit" };
  run("INSERT INTO meta (key, value) VALUES ('signups', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [`${hour}|${count + 1}`]);
  const id = run("INSERT INTO players (name, name_key, hash, created) VALUES (?, ?, ?, ?)", [name, name.toLowerCase(), host.crypto.passwordHash(password), now()]).last_id;
  return { token: newSession(id) };
}

function login(b) {
  const key = text(b.name, 64).trim().toLowerCase();
  const password = String(b.password ?? "");
  const fails = one("SELECT fails, until FROM login_fails WHERE name_key = ?", [key]);
  if (fails && fails.until > Date.now()) return { error: "limit" };
  const player = one("SELECT id, hash FROM players WHERE name_key = ?", [key]);
  if (!player || !host.crypto.passwordVerify(password, player.hash)) {
    if (player) {
      const count = fails && fails.fails < 5 ? fails.fails + 1 : 1;
      run("INSERT INTO login_fails (name_key, fails, until) VALUES (?, ?, ?) ON CONFLICT (name_key) DO UPDATE SET fails = excluded.fails, until = excluded.until",
        [key, count, count >= 5 ? Date.now() + 15 * 60000 : 0]);
    }
    return { error: "bad" };
  }
  run("DELETE FROM login_fails WHERE name_key = ?", [key]);
  return { token: newSession(player.id) };
}

function removePlayer(id) {
  host.db.transaction(() => {
    run("DELETE FROM sessions WHERE player_id = ?", [id]);
    run("DELETE FROM plays WHERE player_id = ?", [id]);
    run("DELETE FROM best WHERE player_id = ?", [id]);
    run("DELETE FROM players WHERE id = ?", [id]);
  });
}

// --- what visitors see ----------------------------------------------------------------------------------------

function liveManifest(game) {
  const row = one("SELECT g.released, v.manifest, v.files, v.version FROM games g JOIN versions v ON v.game_id = g.id AND v.version = g.live_version WHERE g.id = ?", [game]);
  return row && gameView(row);
}

function gameView(row) {
  const m = JSON.parse(row.manifest);
  return {
    id: m.id, version: row.version, kind: m.kind, engine: m.engine, stage: m.stage, tags: m.tags, text: m.text, panel: m.panel, pad: m.pad,
    cover: m.cover, released: (row.released || row.created || "").slice(0, 10), files: JSON.parse(row.files).map((f) => f.name),
  };
}

function publicState(b, who) {
  const games = q("SELECT g.released, v.manifest, v.files, v.version FROM games g JOIN versions v ON v.game_id = g.id AND v.version = g.live_version").map(gameView);
  const counts = {};
  for (const c of q("SELECT game_id, plays FROM counts")) counts[c.game_id] = c.plays;
  const boards = {};
  for (const g of games) {
    boards[g.id] = q("SELECT b.player_id AS userId, p.name, b.score FROM best b JOIN players p ON p.id = b.player_id WHERE b.game_id = ? ORDER BY b.score DESC, p.name LIMIT 20", [g.id]);
  }
  const player = playerOf(b.token);
  const plays = player ? q("SELECT id, game_id, started, ended, score, level, stats FROM plays WHERE player_id = ? ORDER BY id DESC LIMIT 50", [player.id]).map((p) => ({
    id: p.id, userId: player.id, gameId: p.game_id, startedAt: Date.parse(p.started), endedAt: p.ended ? Date.parse(p.ended) : null, score: p.score, level: p.level, stats: json(p.stats, {}),
  })) : [];
  const titles = {};
  for (const p of plays) if (!titles[p.gameId]) titles[p.gameId] = gameTitles(p.gameId);
  return { who, games, counts, boards, user: player, plays, titles };
}

function gameTitles(game) {
  const v = one("SELECT manifest FROM versions WHERE game_id = ? ORDER BY created DESC LIMIT 1", [game]);
  return v ? json(v.manifest, {}).text : null;
}

function beginPlay(b) {
  const player = playerOf(b.token);
  if (!player) refuse("log in first");
  const game = text(b.game, 64);
  if (!liveManifest(game)) refuse("no such game");
  return host.db.transaction(() => {
    const id = run("INSERT INTO plays (player_id, game_id, started) VALUES (?, ?, ?)", [player.id, game, now()]).last_id;
    run("INSERT INTO counts (game_id, plays) VALUES (?, 1) ON CONFLICT (game_id) DO UPDATE SET plays = plays + 1", [game]);
    run("DELETE FROM plays WHERE player_id = ? AND id NOT IN (SELECT id FROM plays WHERE player_id = ? ORDER BY id DESC LIMIT 50)", [player.id, player.id]);
    return { play: id };
  });
}

function completePlay(b) {
  const player = playerOf(b.token);
  if (!player) refuse("log in first");
  const play = one("SELECT * FROM plays WHERE id = ? AND player_id = ?", [Number(b.play) || 0, player.id]);
  if (!play || play.ended) return { ok: true };
  const live = one("SELECT v.manifest FROM games g JOIN versions v ON v.game_id = g.id AND v.version = g.live_version WHERE g.id = ?", [play.game_id]);
  const max = json(live?.manifest, {}).max_score || 1e12;
  const score = Number.isSafeInteger(b.score) && b.score >= 0 && b.score <= max ? b.score : 0;
  const level = Number.isSafeInteger(b.level) && b.level >= 0 ? b.level : 1;
  const stats = {};
  for (const [k, v] of Object.entries(b.stats && typeof b.stats === "object" ? b.stats : {}).slice(0, 8)) if (Number.isFinite(v)) stats[text(k, 32)] = v;
  host.db.transaction(() => {
    run("UPDATE plays SET ended = ?, score = ?, level = ?, stats = ? WHERE id = ?", [now(), score, level, JSON.stringify(stats), play.id]);
    run("INSERT INTO best (game_id, player_id, score) VALUES (?, ?, ?) ON CONFLICT (game_id, player_id) DO UPDATE SET score = max(score, excluded.score)", [play.game_id, player.id, score]);
  });
  return { ok: true };
}

function gameFile(game, version, name, who) {
  if (!ID.test(game) || !NAME.test(name)) return notFound();
  const v = one("SELECT files, g.live_version FROM versions v JOIN games g ON g.id = v.game_id WHERE v.game_id = ? AND v.version = ?", [game, version]);
  // A draft or an old version is the owner's, as if it did not exist.
  if (!v || (who !== "owner" && v.live_version !== version)) return notFound();
  if (!JSON.parse(v.files).some((f) => f.name === name)) return notFound();
  const type = TYPES[name.split(".").pop().toLowerCase()] || "application/octet-stream";
  return { $response: { status: 200, encoding: "base64", body: host.files.read(fileName(game, version, name), "base64"),
    // A version never changes, so a repeat visitor costs no bytes and no API call. The owner's drafts are not kept.
    headers: { "content-type": type, "cache-control": who === "owner" ? "no-store" : "public, max-age=31536000, immutable" } } };
}

const notFound = () => ({ $response: { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "not found" } });

// --- the owner ------------------------------------------------------------------------------------------------

function adminState() {
  const versions = q("SELECT game_id, version, manifest, files, source, warnings, created FROM versions ORDER BY created DESC");
  const agreed = q("SELECT game_id, version, MAX(agreed_at) AS at FROM statements GROUP BY game_id, version");
  const games = q("SELECT g.id, g.live_version, g.released, g.created, c.plays FROM games g LEFT JOIN counts c ON c.game_id = g.id ORDER BY g.created DESC").map((g) => ({
    ...g, plays: g.plays || 0,
    versions: versions.filter((v) => v.game_id === g.id).map((v) => ({
      version: v.version, source: v.source, created: v.created, warnings: json(v.warnings, []), manifest: json(v.manifest, {}),
      size: json(v.files, []).reduce((t, f) => t + f.size, 0), files: json(v.files, []).map((f) => f.name),
      agreed: agreed.find((a) => a.game_id === g.id && a.version === v.version)?.at || null,
    })),
  }));
  const jobs = q("SELECT * FROM jobs WHERE mode != 'demo' ORDER BY id DESC LIMIT 30").map((j) => ({
    ...j, errors: json(j.errors, []), warnings: json(j.warnings, []), notes: json(j.notes, []),
  }));
  const players = q(`SELECT p.id, p.name, p.created, (SELECT COUNT(*) FROM plays x WHERE x.player_id = p.id) AS plays,
    (SELECT MAX(score) FROM best b WHERE b.player_id = p.id) AS best FROM players p ORDER BY p.id DESC LIMIT 200`);
  return { games, jobs, players, statement: STATEMENT_VERSION };
}

function removeGameFiles(game, version) {
  const v = one("SELECT files FROM versions WHERE game_id = ? AND version = ?", [game, version]);
  for (const f of json(v?.files, [])) {
    try { host.files.remove(fileName(game, version, f.name)); } catch { /* gone already */ }
  }
}

function admin(path, b) {
  let m;
  if (path === "state") return adminState();
  if (path === "jobs") {
    const description = text(b.description).trim();
    const mode = b.mode === "ide" ? "ide" : "llm";
    if (!description) refuse("describe the game");
    const base = b.base_game ? one("SELECT id FROM games WHERE id = ?", [text(b.base_game, 64)]) : null;
    if (b.base_game && !base) refuse("no such game");
    const job = newJob(mode, mode === "ide" ? "waiting" : "asking", description, { comment: text(b.comment), base_game: base?.id, base_version: b.base_version && text(b.base_version, 32) });
    if (mode === "llm") askLlm(job);
    return { job };
  }
  if (path === "import") return { job: newJob("import", "working", "Imported") };
  if ((m = path.match(/^jobs\/(\d+)\/(file|done|retry|remove)$/))) {
    const job = Number(m[1]);
    const row = one("SELECT * FROM jobs WHERE id = ?", [job]);
    if (!row) refuse("no such job");
    if (m[2] === "file") {
      stage(job, text(b.name, 200), String(b.data ?? ""), "base64");
      return { ok: true };
    }
    if (m[2] === "done") return finish(job, row.mode === "import" ? "import" : "ide");
    if (m[2] === "retry") {
      if (row.mode !== "llm") refuse("only a game made by the LLM can be asked again");
      clearStaged(job);
      run("UPDATE jobs SET attempts = 0 WHERE id = ?", [job]);
      askLlm(job);
      return { ok: true };
    }
    clearStaged(job);
    run("DELETE FROM jobs WHERE id = ?", [job]);
    return { ok: true };
  }
  if ((m = path.match(/^games\/([a-z0-9-]+)\/(publish|unpublish|delete|remove-version)$/))) {
    const game = m[1];
    if (!one("SELECT id FROM games WHERE id = ?", [game])) refuse("no such game");
    if (m[2] === "publish") {
      const version = text(b.version, 32);
      if (!one("SELECT 1 AS x FROM versions WHERE game_id = ? AND version = ?", [game, version])) refuse("no such version");
      // The owner's statement (requirements 5.2): checked here, not only on the page.
      if (b.agreed !== true || b.statement !== STATEMENT_VERSION) refuse("publishing needs your statement");
      host.db.transaction(() => {
        run("INSERT INTO statements (game_id, version, statement_version, agreed_at) VALUES (?, ?, ?, ?)", [game, version, STATEMENT_VERSION, now()]);
        run("UPDATE games SET live_version = ?, released = COALESCE(released, ?) WHERE id = ?", [version, now(), game]);
      });
      return { ok: true };
    }
    if (m[2] === "unpublish") {
      run("UPDATE games SET live_version = NULL WHERE id = ?", [game]);
      return { ok: true };
    }
    if (m[2] === "remove-version") {
      const version = text(b.version, 32);
      if (one("SELECT 1 AS x FROM games WHERE id = ? AND live_version = ?", [game, version])) refuse("unpublish it first");
      removeGameFiles(game, version);
      run("DELETE FROM versions WHERE game_id = ? AND version = ?", [game, version]);
      return { ok: true };
    }
    for (const v of q("SELECT version FROM versions WHERE game_id = ?", [game])) removeGameFiles(game, v.version);
    host.db.transaction(() => {
      for (const t of ["versions", "plays", "counts", "best"]) run(`DELETE FROM ${t} WHERE game_id = ?`, [game]);
      run("DELETE FROM games WHERE id = ?", [game]);
    });
    return { ok: true };
  }
  if ((m = path.match(/^players\/(\d+)\/(password|delete|clear)$/))) {
    const id = Number(m[1]);
    if (!one("SELECT id FROM players WHERE id = ?", [id])) refuse("no such player");
    if (m[2] === "delete") removePlayer(id);
    else if (m[2] === "clear") run("DELETE FROM best WHERE player_id = ?", [id]);
    else {
      const password = String(b.password ?? "");
      if (password.length < 8 || password.length > 200) refuse("a password has at least 8 characters");
      run("UPDATE players SET hash = ? WHERE id = ?", [host.crypto.passwordHash(password), id]);
      run("DELETE FROM sessions WHERE player_id = ?", [id]);
      run("DELETE FROM login_fails WHERE name_key = (SELECT name_key FROM players WHERE id = ?)", [id]);
    }
    return { ok: true };
  }
  return notFound();
}

// --- the pages ------------------------------------------------------------------------------------------------

export function handle(req) {
  if (req.who === "hook") return notFound();
  try {
    return route(req);
  } catch (e) {
    if (e instanceof Refused) return { $response: { status: 400, headers: { "content-type": "text/plain; charset=utf-8" }, body: e.message } };
    throw e;
  }
}

function route(req) {
  const path = req.path.replace(/^\/+/, "");
  const get = req.method === "GET";
  const m = get && path.match(/^games\/([^/]+)\/([0-9.]+)\/([^/]+)$/);
  if (m) return gameFile(m[1], m[2], m[3], req.who);
  if (get) return notFound();
  const b = req.body ? (json(req.body, null) ?? refuse("bad request")) : {};
  if (path.startsWith("admin/")) {
    // Nothing of this exists for anyone else.
    if (req.who !== "owner") return notFound();
    return admin(path.slice(6), b);
  }
  if (path === "state") return publicState(b, req.who);
  if (path === "auth/register") return register(b);
  if (path === "auth/login") return login(b);
  if (path === "auth/logout") {
    if (typeof b.token === "string") run("DELETE FROM sessions WHERE token = ?", [tokenKey(b.token)]);
    return { ok: true };
  }
  if (path === "plays/begin") return beginPlay(b);
  if (path === "plays/end") return completePlay(b);
  return notFound();
}

// --- the tools of a local AI app or IDE: drafts only, never publishing -------------------------------------------

function toolJob(args) {
  const row = one("SELECT * FROM jobs WHERE id = ?", [Number(args.job) || 0]);
  if (!row) refuse(`no job ${args.job}`);
  if (row.state === "ready") refuse(`job ${row.id} is finished: draft ${row.game_id} ${row.version}`);
  return row;
}

function note(job, row, step, detail) {
  const notes = json(row.notes, []);
  notes.push({ at: now(), step: text(step, 120), note: text(detail, 500) });
  run("UPDATE jobs SET notes = ?, updated = ? WHERE id = ?", [JSON.stringify(notes.slice(-50)), now(), job]);
}

export function callTool(name, args = {}) {
  try {
    return tool(name, args);
  } catch (e) {
    if (e instanceof Refused) return { error: e.message };
    throw e;
  }
}

function tool(name, args) {
  if (name === "arcade_jobs") {
    return { jobs: q("SELECT id, description, comment, state FROM jobs WHERE mode = 'ide' AND state IN ('waiting', 'working', 'errors') ORDER BY id DESC LIMIT 20") };
  }
  if (name === "arcade_project_get") {
    const game = one("SELECT id, live_version FROM games WHERE id = ?", [text(args.game, 64)]);
    if (!game) refuse("no such game");
    const version = args.version ? text(args.version, 32) : one("SELECT version FROM versions WHERE game_id = ? ORDER BY created DESC LIMIT 1", [game.id])?.version;
    const v = one("SELECT files FROM versions WHERE game_id = ? AND version = ?", [game.id, version]);
    if (!v) refuse("no such version");
    return { game: game.id, version, live_version: game.live_version, files: JSON.parse(v.files), ...currentPack(game.id, version) };
  }
  const row = toolJob(args);
  const job = row.id;
  if (name === "arcade_job_get") {
    if (row.mode !== "ide") refuse("this job is not made through tools");
    jobState(job, "working");
    note(job, row, "received", "the whole brief was received");
    return { received: true, job, description: row.description, owner_asks: row.comment, base: row.base_game ? { game: row.base_game, version: row.base_version } : null,
      last_errors: json(row.errors, []), how_to_deliver: HOW_TO_DELIVER, specification: SPEC };
  }
  if (name === "arcade_job_progress") {
    note(job, row, args.step, args.note);
    return { ok: true };
  }
  if (name === "arcade_job_put_file") {
    const file = text(args.name, 200);
    const previous = args.part > 0 && one("SELECT 1 AS x FROM job_files WHERE job_id = ? AND name = ?", [job, file]) ? host.files.read(stagedName(job, file), "text") : "";
    stage(job, file, previous + String(args.data ?? ""));
    return { ok: true, name: file, size: one("SELECT size FROM job_files WHERE job_id = ? AND name = ?", [job, file]).size };
  }
  if (name === "arcade_job_import") {
    const folder = text(args.folder, 255);
    if (!folder) refuse("name the folder inside the inbox");
    const listed = host.inbox.list().filter((f) => f.folder === folder);
    if (!listed.some((f) => f.name === "game.json") || !listed.some((f) => f.name === "game.js")) {
      return { state: "wait", retry_after_seconds: 10, found: listed.map((f) => f.name), note: "a file just written is listed after a moment; try again. If game.json and game.js are not there, copy them first." };
    }
    for (const f of listed) stage(job, f.name, host.inbox.read({ folder: f.folder, name: f.name }), "base64");
    for (const f of listed) host.inbox.done({ folder: f.folder, name: f.name });
    note(job, row, "imported", `${listed.length} files from ${folder}`);
    return { ok: true, imported: listed.map((f) => f.name) };
  }
  if (name === "arcade_job_done") {
    const result = finish(job, "ide");
    note(job, one("SELECT * FROM jobs WHERE id = ?", [job]), result.state === "ready" ? "all sent: draft ready" : "all sent: errors", result.state === "ready" ? `${result.game} ${result.version}` : `${result.errors.length} errors`);
    return result.state === "ready" ? { ...result, note: "The owner tests the draft on the local page and decides. You are done." } : result;
  }
  refuse(`no tool ${name}`);
}
