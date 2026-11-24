// AI Meetings (DOCUMENTATIONS/app_aimeetings_requirements.txt): the owner chairs a meeting where several AI models (each one
// of the LLMs the owner allows in Config: host.app.llms) and invited people discuss an issue. The owner runs it on the local
// page: opening round (everyone at once, nobody sees the others), discussion rounds (one after another), asking one
// participant, instructions, stop; a secretary model drafts the minutes, the owner edits and finishes them. People join on
// the website with an invitation code and a name; they read along and write, but never start an AI turn (ai = "owner").

import { PROMPT_VERSION, SPEECH_SCHEMA, SUMMARY_SCHEMA, speechTask, summaryTask } from "./prompts.js";

const now = () => new Date().toISOString();
const q = (sql, p = []) => host.db.query(sql, p);
const one = (sql, p = []) => host.db.query(sql, p)[0] || null;
const run = (sql, p = []) => host.db.exec(sql, p);
const json = (s, fallback) => { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } };
const text = (v, max = 4000) => String(v ?? "").trim().slice(0, max);

class Refused extends Error {}
const refuse = (message) => { throw new Refused(message); };

// Limits (requirements 6).
const MAX_AI = 8;
const MAX_PEOPLE = 12;
const MAX_SAY = 2000;        // the chair's message
const MAX_OPENING = 14000;   // the chair's opening statement (purpose + background, edited)
const MAX_GUEST_SAY = 1000;  // an invited person's message
const MIN_WORDS = 30, MAX_WORDS = 1000; // length of a turn (the meeting's, or the chair's for one question)
const MAX_REPLIES = 4;       // answers to a participant's direct question, per round (no endless back and forth)
const GUEST_GAP_MS = 2000;   // between two messages of one person
const TRANSCRIPT_CHARS = 24000; // what an AI turn gets of the transcript (newest kept)
const JOIN_FAILS = 30, JOIN_WINDOW_MS = 10 * 60 * 1000;
const GUEST_DAYS = 7;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32: no 0/O, 1/I

// --- data --------------------------------------------------------------------------------------------------

export function onInstall() {
  host.db.script(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY, title TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '',
      background TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'auto', words INTEGER NOT NULL DEFAULT 180,
      status TEXT NOT NULL DEFAULT 'open', invite_code TEXT, invite_on INTEGER NOT NULL DEFAULT 0, queue TEXT NOT NULL DEFAULT '[]',
      round INTEGER NOT NULL DEFAULT 0, focus TEXT, digest TEXT, digest_upto INTEGER NOT NULL DEFAULT 0,
      minutes TEXT, minutes_state TEXT, minutes_run TEXT, minutes_kind TEXT, minutes_error TEXT,
      created TEXT NOT NULL, updated TEXT NOT NULL, ended TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS meetings_code ON meetings (invite_code);
    CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY, meeting_id INTEGER NOT NULL, kind TEXT NOT NULL,
      name TEXT NOT NULL, llm TEXT, role TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'idle', run TEXT, turn TEXT, error TEXT, hand INTEGER NOT NULL DEFAULT 0, last_said TEXT, joined TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS participants_meeting ON participants (meeting_id, position);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, meeting_id INTEGER NOT NULL, round INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL, participant_id INTEGER, name TEXT NOT NULL, text TEXT NOT NULL, stance TEXT, turn TEXT, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_meeting ON messages (meeting_id, id);
    CREATE TABLE IF NOT EXISTS guests (token TEXT PRIMARY KEY, meeting_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, expires TEXT NOT NULL);
  `);
}

export function onUpdate() {
  onInstall();
}

function meta(key, fallback = null) {
  const r = one("SELECT value FROM meta WHERE key = ?", [key]);
  return r ? r.value : fallback;
}
function setMeta(key, value) {
  run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [key, String(value)]);
}

/** The LLMs the owner allows (Config -> LLMs it may use). Empty: every AI turn goes to the application's one LLM. */
function llms() {
  return Array.isArray(host.app.llms) ? host.app.llms : [];
}
/** The owner's names of those LLM workers (gateway 1.1.37: host.app.llm_names); an older gateway gives none. */
/** How the gateway runs (gateway 1.1.41, R56): "local" = only this computer - no website, so no invitations; an older
 *  gateway gives none = "relay". */
function mode() {
  return host.app.mode === "local" ? "local" : "relay";
}
function llmNames() {
  const n = host.app.llm_names;
  return n && typeof n === "object" ? n : {};
}
function checkLlm(llm) {
  const l = text(llm, 100);
  if (!l) return null;
  if (!llms().includes(l)) refuse(`"${l}" is not one of the LLMs allowed for AI Meetings (2nfro Desktop: the application's Config)`);
  return l;
}

function meeting(id) {
  return one("SELECT * FROM meetings WHERE id = ?", [Number(id) || 0]) || refuse("no such meeting");
}
function participant(m, id) {
  return one("SELECT * FROM participants WHERE id = ? AND meeting_id = ?", [Number(id) || 0, m.id]) || refuse("no such participant");
}
const active = (m, kind) => q("SELECT * FROM participants WHERE meeting_id = ? AND kind = ? AND state NOT IN ('left', 'removed') ORDER BY position, id", [m.id, kind]);
const busy = (m) => json(m.queue, []).length > 0 || !!one("SELECT 1 AS x FROM participants WHERE meeting_id = ? AND state = 'thinking'", [m.id]);
const touch = (m) => run("UPDATE meetings SET updated = ? WHERE id = ?", [now(), m.id]);
function changed(m) {
  touch(m);
  try { host.push({ type: "meeting", id: m.id }); } catch { /* no page open */ }
}

function addMessage(m, kind, p, body, extra = {}) {
  run("INSERT INTO messages (meeting_id, round, kind, participant_id, name, text, stance, turn, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [m.id, m.round, kind, p ? p.id : null, p ? p.name : extra.name || "", body, extra.stance || null, extra.turn || null, now()]);
}

// --- views -------------------------------------------------------------------------------------------------

function participantView(p, owner) {
  const v = { id: p.id, kind: p.kind, name: p.name, role: p.role, state: p.state, hand: !!p.hand };
  if (owner) Object.assign(v, { llm: p.llm, error: p.error, turn: p.turn });
  return v;
}

function messagesSince(m, since) {
  return q("SELECT id, round, kind, participant_id, name, text, stance, turn, at FROM messages WHERE meeting_id = ? AND id > ? ORDER BY id LIMIT 500",
    [m.id, Number(since) || 0]);
}

function meetingView(m, since, owner) {
  const v = {
    id: m.id, title: m.title, purpose: m.purpose, background: m.background, status: m.status, round: m.round,
    focus: m.focus, busy: busy(m), updated: m.updated,
    participants: q("SELECT * FROM participants WHERE meeting_id = ? AND state != 'removed' ORDER BY kind = 'human', position, id", [m.id]).map((p) => participantView(p, owner)),
    messages: messagesSince(m, since),
    minutes: m.minutes_state === "final" || owner ? m.minutes : null,
    minutes_state: owner ? m.minutes_state : m.minutes_state === "final" ? "final" : null,
  };
  if (owner) {
    Object.assign(v, { lang: m.lang, words: m.words, invite_on: !!m.invite_on, invite_code: m.invite_code ? showCode(m.invite_code) : null,
      queue: json(m.queue, []), digest: m.digest, minutes_kind: m.minutes_kind, minutes_error: m.minutes_error, llms: llms(), llm_names: llmNames(), mode: mode() });
  }
  return v;
}

function listView() {
  return q(`SELECT m.id, m.title, m.status, m.round, m.updated, m.invite_on,
      (SELECT COUNT(*) FROM messages x WHERE x.meeting_id = m.id) AS messages,
      (SELECT COUNT(*) FROM participants p WHERE p.meeting_id = m.id AND p.kind = 'ai' AND p.state != 'removed') AS ais,
      (SELECT COUNT(*) FROM participants p WHERE p.meeting_id = m.id AND p.kind = 'human' AND p.state NOT IN ('left', 'removed')) AS people
    FROM meetings m ORDER BY m.status = 'ended', m.updated DESC LIMIT 200`);
}

// --- the owner: meetings --------------------------------------------------------------------------------------

function saveMeeting(b) {
  const title = text(b.title, 120) || refuse("the meeting needs a title");
  const lang = ["auto", "en", "zh-Hant"].includes(b.lang) ? b.lang : "auto";
  const words = clampWords(b.words, 180);
  const list = Array.isArray(b.participants) ? b.participants : [];
  const ais = list.map((p) => ({ id: Number(p.id) || 0, name: text(p.name, 40), llm: checkLlm(p.llm), role: text(p.role, 300) }));
  if (ais.length > MAX_AI) refuse(`at most ${MAX_AI} AI participants`);
  if (ais.some((p) => !p.name)) refuse("every AI participant needs a name");
  const names = ais.map((p) => p.name.toLowerCase());
  if (new Set(names).size !== names.length) refuse("two participants have the same name");
  let id = Number(b.id) || 0;
  host.db.transaction(() => {
    if (id) {
      const m = meeting(id);
      if (m.status === "ended") refuse("the meeting has ended - open it again first");
      run("UPDATE meetings SET title = ?, purpose = ?, background = ?, lang = ?, words = ?, updated = ? WHERE id = ?",
        [title, text(b.purpose, 2000), text(b.background, 12000), lang, words, now(), id]);
    } else {
      run("INSERT INTO meetings (title, purpose, background, lang, words, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [title, text(b.purpose, 2000), text(b.background, 12000), lang, words, now(), now()]);
      id = one("SELECT last_insert_rowid() AS id").id;
    }
    const keep = new Set();
    ais.forEach((p, i) => {
      const old = p.id && one("SELECT * FROM participants WHERE id = ? AND meeting_id = ? AND kind = 'ai'", [p.id, id]);
      if (old) {
        run("UPDATE participants SET name = ?, llm = ?, role = ?, position = ?, state = CASE WHEN state = 'removed' THEN 'idle' ELSE state END WHERE id = ?",
          [p.name, p.llm, p.role, i, old.id]);
        keep.add(old.id);
      } else {
        run("INSERT INTO participants (meeting_id, kind, name, llm, role, position, joined) VALUES (?, 'ai', ?, ?, ?, ?, ?)", [id, p.name, p.llm, p.role, i, now()]);
        keep.add(one("SELECT last_insert_rowid() AS id").id);
      }
    });
    // Taken off the list: kept for the transcript's names, no more turns.
    for (const p of q("SELECT id FROM participants WHERE meeting_id = ? AND kind = 'ai'", [id])) {
      if (!keep.has(p.id)) run("UPDATE participants SET state = 'removed', run = NULL WHERE id = ?", [p.id]);
    }
    const m = meeting(id);
    const queue = json(m.queue, []).filter((x) => keep.has(x.p));
    run("UPDATE meetings SET queue = ? WHERE id = ?", [JSON.stringify(queue), id]);
  });
  const m = meeting(id);
  changed(m);
  return meetingView(m, 0, true);
}

function deleteMeeting(b) {
  const m = meeting(b.id);
  host.db.transaction(() => {
    for (const t of ["messages", "participants", "guests"]) run(`DELETE FROM ${t} WHERE meeting_id = ?`, [m.id]);
    run("DELETE FROM meetings WHERE id = ?", [m.id]);
  });
  return { ok: true };
}

function chairSays(b) {
  const m = meeting(b.id);
  if (m.status === "ended") refuse("the meeting has ended");
  const body = text(b.text, MAX_SAY) || refuse("write something first");
  addMessage(m, "chair", null, body, { name: "Chair" });
  // An instruction stays for the next turns until the chair changes or clears it.
  if (b.instruction) run("UPDATE meetings SET focus = ? WHERE id = ?", [body, m.id]);
  changed(m);
  return { ok: true };
}

const clampWords = (w, fallback) => Math.min(MAX_WORDS, Math.max(MIN_WORDS, Math.round(Number(w)) || fallback));

/** The chair changes the length of a turn during the meeting (the next turns use it). */
function setWords(b) {
  const m = meeting(b.id);
  if (m.status === "ended") refuse("the meeting has ended");
  const words = clampWords(b.words, m.words);
  run("UPDATE meetings SET words = ? WHERE id = ?", [words, m.id]);
  changed(m);
  return { words };
}

function clearFocus(b) {
  const m = meeting(b.id);
  run("UPDATE meetings SET focus = NULL WHERE id = ?", [m.id]);
  changed(m);
  return { ok: true };
}

// --- turns -------------------------------------------------------------------------------------------------

/** The transcript an AI turn gets: the secretary's running summary (if any), then the newest messages that fit. */
function transcript(m) {
  const rows = q("SELECT id, round, kind, name, text FROM messages WHERE meeting_id = ? AND id > ? ORDER BY id DESC LIMIT 400",
    [m.id, m.digest ? m.digest_upto : 0]);
  const out = [];
  let size = 0, cut = false;
  for (const r of rows) {
    size += r.text.length + r.name.length + 20;
    if (size > TRANSCRIPT_CHARS && out.length) { cut = true; break; }
    out.push({ round: r.round, speaker: r.kind === "chair" ? "Chair" : r.name, kind: r.kind === "ai" ? "AI participant" : r.kind === "human" ? "person" : r.kind, text: r.text });
  }
  out.reverse();
  return { earlier_summary: m.digest || null, earlier_part_left_out: cut, messages: out };
}

function ask(m, p, kind, from, words) {
  const people = q("SELECT name, kind, role FROM participants WHERE meeting_id = ? AND state NOT IN ('left', 'removed') ORDER BY kind = 'human', position, id", [m.id]);
  const data = {
    meeting: { title: m.title, purpose: m.purpose, background: m.background, round: m.round },
    participants: people.map((x) => ({ name: x.name, kind: x.kind === "ai" ? "AI" : "person", role: x.role || null })),
    you: p.name,
    transcript: transcript(m),
  };
  const request = { task: speechTask({ name: p.name, role: p.role, kind, words: words || m.words, exact: !!words, lang: m.lang, focus: m.focus, from }), schema: SPEECH_SCHEMA, data,
    tag: { meeting: m.id, participant: p.id, turn: kind, prompt: PROMPT_VERSION } };
  if (p.llm) request.llm = p.llm;
  try {
    const { run: r } = host.ai.run(request);
    run("UPDATE participants SET state = 'thinking', run = ?, turn = ?, error = NULL WHERE id = ?", [r, kind, p.id]);
  } catch (e) {
    run("UPDATE participants SET state = 'failed', run = NULL, error = ? WHERE id = ?", [text(e.message, 300), p.id]);
  }
}

/** The next turn of a discussion round, when nobody is speaking. */
function pump(m) {
  m = meeting(m.id);
  if (one("SELECT 1 AS x FROM participants WHERE meeting_id = ? AND state = 'thinking'", [m.id])) return;
  const queue = json(m.queue, []);
  while (queue.length) {
    const next = queue.shift();
    const p = one("SELECT * FROM participants WHERE id = ? AND meeting_id = ? AND state NOT IN ('left', 'removed')", [next.p, m.id]);
    run("UPDATE meetings SET queue = ? WHERE id = ?", [JSON.stringify(queue), m.id]);
    if (!p) continue;
    ask(meeting(m.id), p, next.kind, next.from, next.words);
    if (one("SELECT state FROM participants WHERE id = ?", [p.id]).state === "thinking") return;
  }
}

function startRound(b) {
  const m = meeting(b.id);
  if (m.status === "ended") refuse("the meeting has ended");
  if (busy(m)) refuse("someone is still speaking - wait, or press Stop");
  const kind = ["opening", "discussion", "final", "ask"].includes(b.kind) ? b.kind : refuse("which round?");
  const ais = active(m, "ai");
  if (!ais.length) refuse("add an AI participant first");
  // The opening is the chair's opening statement (the page fills in the purpose and the background; the chair edits it).
  const opening = kind === "opening" ? text(b.text, MAX_OPENING) : "";
  if (kind === "opening" && !opening) refuse("write the opening statement first");
  if (kind === "ask") {
    const p = participant(m, b.participant);
    if (p.kind !== "ai" || p.state === "removed") refuse("only an AI participant can be asked");
    // The chair's question (optional: without one the AI answers the chair's latest message) and its expected length.
    const question = text(b.text, MAX_SAY);
    if (question) addMessage(m, "chair", null, `@${p.name} ${question}`, { name: "Chair", turn: "ask" });
    const entry = { p: p.id, kind };
    if (b.words) entry.words = clampWords(b.words, m.words);
    run("UPDATE meetings SET queue = ? WHERE id = ?", [JSON.stringify([entry]), m.id]);
  } else {
    // How many discussion rounds before this one: each starts with the next participant.
    const before = one("SELECT COUNT(*) AS n FROM messages WHERE meeting_id = ? AND kind = 'system' AND turn = 'discussion'", [m.id]).n;
    run("UPDATE meetings SET round = round + 1 WHERE id = ?", [m.id]);
    const label = { opening: "Opening round", discussion: "Discussion round", final: "Closing statements" }[kind];
    addMessage(meeting(m.id), "system", null, label, { name: "", turn: kind });
    if (opening) addMessage(meeting(m.id), "chair", null, opening, { name: "Chair", turn: "opening" });
    if (kind === "discussion") {
      const k = before % ais.length;
      const order = [...ais.slice(k), ...ais.slice(0, k)];
      run("UPDATE meetings SET queue = ? WHERE id = ?", [JSON.stringify(order.map((p) => ({ p: p.id, kind }))), m.id]);
    } else {
      // Everyone at once: each request is made before any answer is in, so nobody sees the others' view.
      const fresh = meeting(m.id);
      for (const p of ais) ask(fresh, p, kind);
    }
  }
  pump(m);
  changed(m);
  return meetingView(meeting(m.id), Number(b.since) || 0, true);
}

function stop(b) {
  const m = meeting(b.id);
  // Answers still on their way are not used (their run no longer matches).
  run("UPDATE participants SET state = 'idle', run = NULL WHERE meeting_id = ? AND state = 'thinking'", [m.id]);
  run("UPDATE meetings SET queue = '[]' WHERE id = ?", [m.id]);
  addMessage(m, "system", null, "Stopped by the chair", { name: "", turn: "stop" });
  changed(m);
  return { ok: true };
}

function skip(b) {
  const m = meeting(b.id);
  const p = participant(m, b.participant);
  if (p.state === "thinking") run("UPDATE participants SET state = 'idle', run = NULL WHERE id = ?", [p.id]);
  pump(m);
  changed(m);
  return { ok: true };
}

export function onAiResult(r) {
  const tag = r.tag || {};
  if (tag.minutes) return minutesAnswered(r);
  const p = tag.participant && one("SELECT * FROM participants WHERE id = ?", [tag.participant]);
  if (!p || p.run !== r.run) return; // stopped, skipped or removed meanwhile
  const m = one("SELECT * FROM meetings WHERE id = ?", [p.meeting_id]);
  if (!m) return;
  if (r.state === "done") {
    const speech = text(r.answer?.speech, 12000) || "(said nothing)";
    addMessage(m, "ai", p, speech, { stance: text(r.answer?.stance, 200) || null, turn: p.turn });
    run("UPDATE participants SET state = 'idle', run = NULL, error = NULL WHERE id = ?", [p.id]);
    // Asked directly: that participant answers next (only in turns that see the others, at most MAX_REPLIES a round).
    if (["discussion", "ask", "reply"].includes(p.turn)) queueReplies(meeting(m.id), p, r.answer?.asks);
  } else {
    run("UPDATE participants SET state = 'failed', run = NULL, error = ? WHERE id = ?", [text(r.error || "no answer", 300), p.id]);
  }
  pump(m);
  changed(m);
}

function queueReplies(m, from, asks) {
  if (!Array.isArray(asks) || !asks.length) return;
  const ais = active(m, "ai");
  let left = MAX_REPLIES - one("SELECT COUNT(*) AS n FROM messages WHERE meeting_id = ? AND round = ? AND turn = 'reply'", [m.id, m.round]).n;
  let queue = json(m.queue, []);
  const front = [];
  for (const name of asks.slice(0, 3)) {
    const key = String(name ?? "").trim().toLowerCase();
    const p = ais.find((x) => x.id !== from.id && x.name.toLowerCase() === key);
    if (!p || left <= 0 || front.some((x) => x.p === p.id)) continue;
    // Their later turn in this round becomes this answer (nobody speaks twice for it).
    queue = queue.filter((x) => x.p !== p.id);
    front.push({ p: p.id, kind: "reply", from: from.name });
    left--;
  }
  if (front.length) run("UPDATE meetings SET queue = ? WHERE id = ?", [JSON.stringify([...front, ...queue]), m.id]);
}

// --- minutes (the secretary) -------------------------------------------------------------------------------

function writeMinutes(b) {
  const m = meeting(b.id);
  if (m.minutes_state === "writing") refuse("the secretary is still writing");
  const digest = !!b.digest;
  const all = q("SELECT id, round, kind, name, text FROM messages WHERE meeting_id = ? AND kind != 'system' ORDER BY id", [m.id]);
  if (!all.length) refuse("nothing has been said yet");
  // The minutes see the whole meeting (cut from the start if it is very long, with the running summary in front).
  let rows = all, size = all.reduce((n, x) => n + x.text.length, 0), cut = false;
  while (size > TRANSCRIPT_CHARS * 2 && rows.length > 1) { size -= rows[0].text.length; rows = rows.slice(1); cut = true; }
  const people = q("SELECT name, kind, role FROM participants WHERE meeting_id = ? AND state != 'removed' ORDER BY kind = 'human', position, id", [m.id]);
  const data = {
    meeting: { title: m.title, purpose: m.purpose, background: m.background },
    participants: people.map((x) => ({ name: x.name, kind: x.kind === "ai" ? "AI" : "person", role: x.role || null })),
    earlier_summary: cut ? m.digest : null,
    transcript: rows.map((x) => ({ round: x.round, speaker: x.kind === "chair" ? "Chair" : x.name, text: x.text })),
  };
  const request = { task: summaryTask({ lang: m.lang, digest }), schema: SUMMARY_SCHEMA, data, tag: { minutes: m.id, digest, upto: all[all.length - 1].id } };
  const llm = checkLlm(b.llm);
  if (llm) request.llm = llm;
  const { run: r } = host.ai.run(request);
  run("UPDATE meetings SET minutes_state = CASE WHEN ? THEN minutes_state ELSE 'writing' END, minutes_run = ?, minutes_kind = ?, minutes_error = NULL WHERE id = ?",
    [digest ? 1 : 0, r, digest ? "digest" : "minutes", m.id]);
  changed(m);
  return { ok: true };
}

function minutesAnswered(r) {
  const m = one("SELECT * FROM meetings WHERE id = ?", [r.tag.minutes]);
  if (!m || m.minutes_run !== r.run) return;
  if (r.state !== "done") {
    run("UPDATE meetings SET minutes_run = NULL, minutes_error = ?, minutes_state = CASE WHEN minutes_state = 'writing' THEN 'failed' ELSE minutes_state END WHERE id = ?",
      [text(r.error || "no answer", 300), m.id]);
  } else if (r.tag.digest) {
    run("UPDATE meetings SET minutes_run = NULL, digest = ?, digest_upto = ? WHERE id = ?", [text(r.answer.summary, 4000), r.tag.upto, m.id]);
  } else {
    run("UPDATE meetings SET minutes_run = NULL, minutes = ?, minutes_state = 'draft' WHERE id = ?", [text(r.answer.summary, 20000), m.id]);
  }
  changed(m);
}

function saveMinutes(b) {
  const m = meeting(b.id);
  const body = text(b.text, 20000);
  run("UPDATE meetings SET minutes = ?, minutes_state = ? WHERE id = ?", [body || null, body ? (b.final ? "final" : "draft") : null, m.id]);
  changed(m);
  return { ok: true };
}

function endMeeting(b) {
  const m = meeting(b.id);
  run("UPDATE participants SET state = 'idle', run = NULL WHERE meeting_id = ? AND state = 'thinking'", [m.id]);
  run("UPDATE meetings SET status = 'ended', ended = ?, queue = '[]', invite_on = 0 WHERE id = ?", [now(), m.id]);
  addMessage(m, "system", null, "Meeting ended", { name: "", turn: "end" });
  changed(m);
  return { ok: true };
}

function reopen(b) {
  const m = meeting(b.id);
  run("UPDATE meetings SET status = 'open', ended = NULL WHERE id = ?", [m.id]);
  changed(m);
  return { ok: true };
}

// --- invitations ---------------------------------------------------------------------------------------------

function newCode() {
  for (let i = 0; i < 5; i++) {
    const hex = host.crypto.random(10);
    let code = "";
    for (let j = 0; j < 20; j += 2) code += CODE_ALPHABET[parseInt(hex.slice(j, j + 2), 16) % 32];
    if (!one("SELECT 1 AS x FROM meetings WHERE invite_code = ?", [code])) return code;
  }
  refuse("could not make a code - try again");
}
const showCode = (c) => `${c.slice(0, 5)}-${c.slice(5)}`;
const normCode = (c) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

function invite(b) {
  const m = meeting(b.id);
  if (b.on && mode() === "local") refuse("inviting people needs a Connected gateway: this one runs on this computer only");
  if (m.status === "ended" && b.on) refuse("the meeting has ended");
  const code = b.renew || !m.invite_code ? newCode() : m.invite_code;
  host.db.transaction(() => {
    run("UPDATE meetings SET invite_code = ?, invite_on = ? WHERE id = ?", [code, b.on ? 1 : 0, m.id]);
    // A new code: those who joined stay; only new people need the new code.
  });
  changed(m);
  return { code: showCode(code), on: !!b.on };
}

function removeGuest(b) {
  const m = meeting(b.id);
  const p = participant(m, b.participant);
  if (p.kind !== "human") refuse("not an invited person");
  host.db.transaction(() => {
    run("UPDATE participants SET state = 'removed', hand = 0 WHERE id = ?", [p.id]);
    run("DELETE FROM guests WHERE participant_id = ?", [p.id]);
  });
  addMessage(m, "system", null, `${p.name} was removed by the chair`, { name: "", turn: "left" });
  changed(m);
  return { ok: true };
}

function lowerHand(b) {
  const m = meeting(b.id);
  run("UPDATE participants SET hand = 0 WHERE id = ? AND meeting_id = ?", [Number(b.participant) || 0, m.id]);
  changed(m);
  return { ok: true };
}

// --- invited people (the website) --------------------------------------------------------------------------

function tokenKey(token) {
  let secret = meta("token_secret");
  if (!secret) { secret = host.crypto.random(32); setMeta("token_secret", secret); }
  return host.crypto.hmac(secret, String(token)).hex;
}

function joinFailed() {
  const f = json(meta("join_fails"), { n: 0, since: 0 });
  const t = Date.now();
  setMeta("join_fails", JSON.stringify(t - f.since > JOIN_WINDOW_MS ? { n: 1, since: t } : { n: f.n + 1, since: f.since }));
}

function join(b) {
  const f = json(meta("join_fails"), { n: 0, since: 0 });
  if (f.n >= JOIN_FAILS && Date.now() - f.since < JOIN_WINDOW_MS) refuse("Too many wrong codes. Please try again in a few minutes.");
  const name = text(b.name, 40) || refuse("Please write your name.");
  const code = normCode(b.code);
  const m = code.length === 10 ? one("SELECT * FROM meetings WHERE invite_code = ? AND invite_on = 1 AND status = 'open'", [code]) : null;
  if (!m) { joinFailed(); refuse("This code is not valid (or the meeting is not open to join)."); }
  const taken = one("SELECT 1 AS x FROM participants WHERE meeting_id = ? AND state NOT IN ('left', 'removed') AND lower(name) = lower(?)", [m.id, name]);
  if (taken || name.toLowerCase() === "chair") refuse("That name is already used in this meeting - please choose another.");
  if (active(m, "human").length >= MAX_PEOPLE) refuse("This meeting is full.");
  const token = host.crypto.random(24);
  host.db.transaction(() => {
    run("INSERT INTO participants (meeting_id, kind, name, joined) VALUES (?, 'human', ?, ?)", [m.id, name, now()]);
    const pid = one("SELECT last_insert_rowid() AS id").id;
    run("INSERT INTO guests (token, meeting_id, participant_id, expires) VALUES (?, ?, ?, ?)",
      [tokenKey(token), m.id, pid, new Date(Date.now() + GUEST_DAYS * 86400000).toISOString()]);
    addMessage(m, "system", null, `${name} joined`, { name: "", turn: "joined" });
  });
  changed(m);
  return { token, meeting: m.id };
}

function guest(b) {
  const g = typeof b.token === "string" && one("SELECT * FROM guests WHERE token = ?", [tokenKey(b.token)]);
  if (!g || g.expires < now()) return null;
  const p = one("SELECT * FROM participants WHERE id = ? AND state NOT IN ('left', 'removed')", [g.participant_id]);
  const m = p && one("SELECT * FROM meetings WHERE id = ?", [g.meeting_id]);
  return m ? { m, p } : null;
}

function visitor(path, b) {
  if (path === "join") return join(b);
  const g = guest(b);
  if (!g) return { $response: { status: 401, headers: { "content-type": "text/plain; charset=utf-8" }, body: "Please join with the invitation code again." } };
  const { m, p } = g;
  if (path === "view") return { me: p.id, meeting: meetingView(m, b.since, false) };
  if (path === "say") {
    if (m.status !== "open") refuse("The meeting has ended.");
    const body = text(b.text, MAX_GUEST_SAY) || refuse("Write something first.");
    if (p.last_said && Date.now() - Date.parse(p.last_said) < GUEST_GAP_MS) refuse("A moment, please - one message every few seconds.");
    addMessage(m, "human", p, body);
    run("UPDATE participants SET last_said = ?, hand = 0 WHERE id = ?", [now(), p.id]);
    changed(m);
    return { ok: true };
  }
  if (path === "hand") {
    run("UPDATE participants SET hand = ? WHERE id = ?", [b.up ? 1 : 0, p.id]);
    changed(m);
    return { ok: true };
  }
  if (path === "leave") {
    host.db.transaction(() => {
      run("UPDATE participants SET state = 'left', hand = 0 WHERE id = ?", [p.id]);
      run("DELETE FROM guests WHERE participant_id = ?", [p.id]);
      addMessage(m, "system", null, `${p.name} left`, { name: "", turn: "left" });
    });
    changed(m);
    return { ok: true };
  }
  return null;
}

// --- requests ----------------------------------------------------------------------------------------------

const notFound = () => ({ $response: { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "not found" } });

export function handle(req) {
  if (req.who === "hook") return notFound();
  try {
    return route(req) ?? notFound();
  } catch (e) {
    if (e instanceof Refused) return { $response: { status: 400, headers: { "content-type": "text/plain; charset=utf-8" }, body: e.message } };
    throw e;
  }
}

function route(req) {
  const path = req.path.replace(/^\/+/, "");
  const get = req.method === "GET", qs = req.query || {};
  if (get && path === "who") return { who: req.who === "owner" ? "owner" : "visitor" };
  if (req.who !== "owner") {
    if (get) return null;
    const b = req.body ? (json(req.body, null) ?? refuse("bad request")) : {};
    return visitor(path, b);
  }
  if (get && path === "state") {
    cleanGuests();
    return { llms: llms(), llm_names: llmNames(), mode: mode(), meetings: listView() };
  }
  if (get && path === "meeting") return meetingView(meeting(qs.id), qs.since, true);
  if (get) return null;
  const b = req.body ? (json(req.body, null) ?? refuse("bad request")) : {};
  const routes = {
    "meetings/save": saveMeeting, "meetings/delete": deleteMeeting, say: chairSays, words: setWords, "focus/clear": clearFocus,
    round: startRound, stop, skip, "minutes/write": writeMinutes, "minutes/save": saveMinutes, end: endMeeting, reopen,
    invite, "guests/remove": removeGuest, "hands/lower": lowerHand,
  };
  return routes[path] ? routes[path](b) : null;
}

function cleanGuests() {
  run("DELETE FROM guests WHERE expires < ?", [now()]);
}
