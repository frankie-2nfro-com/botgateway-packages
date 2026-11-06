// What the LLM is told. SPEC is myarcade_game_dev_spec.md, merged in by the build (server/spec.js).
import { SPEC } from "./spec.js";

export { SPEC };

// The answer of an LLM that gives one answer and has no tools (host.ai).
export const GAME_SCHEMA = {
  type: "object",
  required: ["game_json", "game_js", "cover_svg"],
  properties: {
    game_json: { type: "object", description: "the contents of game.json" },
    game_js: { type: "string", description: "the whole of game.js: plain JavaScript that runs as it is, one ES module" },
    cover_svg: { type: "string", description: "the whole of cover.svg" },
  },
};

export function aiTask({ description, comment, retry }) {
  const lines = [
    "Make an original browser game for MyArcade, following the specification in the data exactly.",
    "There is no build step: game_js must be plain JavaScript that runs as it is, with art drawn in code and sound by Web Audio. The pack is exactly game.json, game.js and cover.svg, so \"cover\" is \"cover.svg\" and game.js uses no asset files.",
    `The game: ${description}`,
    "Give text in en and zh-TW at least.",
  ];
  if (comment) lines.push(`This is a new version of the game in data.current. Keep what works. The owner asks: ${comment}`);
  if (retry) lines.push("Your last pack was refused by the checks in data.errors. Fix exactly those, and change nothing else. The pack is in data.current.");
  return lines.join("\n");
}

// The whole brief as one text, for a tool that is not connected to this gateway (a remote bot is its client, say): the owner
// pastes it, and brings the folder back with the file picker on the job.
export function fullPrompt({ job, description, comment, errors, current }) {
  const parts = [
    "Make an original browser game for MyArcade, following the specification below exactly.",
    `The game: ${description}`,
  ];
  if (comment) parts.push(`This is a new version of an existing game. Keep what works. The owner asks: ${comment}`);
  if (errors?.length) parts.push(`Your last pack was refused by MyArcade's checks. Fix exactly these:\n${errors.map((e) => `- ${e}`).join("\n")}`);
  parts.push(`Where to work: this text is all you get from MyArcade; it has no project, SDK or test tool for you. Work in the folder or project the owner has open here. If there is none, ask the owner to open a new empty one first.

Deliver: put the finished pack, with flat file names, in one folder called myarcade-job-${job}, at the top of that project. It holds only the pack: game.json, game.js, the cover and any assets, no source and no node_modules. Keep your source outside it. game.js must end up as one ES module with no imports: use npm and a bundler if they are available here, or write plain JavaScript if not. If you can't make image or sound files here, draw in code and synthesise sound instead, and say so. Then tell the owner the folder's full path: the owner uploads that folder to MyArcade, which runs its checks.

Test before you deliver: outside the pack, write a small HTML page with one canvas that calls mount(canvas, host) with a stand-in host as in section 4, and run it in a browser if you can. Before you finish, go through the "Done means" list and report each item honestly, saying which you could not run. If you can't write files here at all, say so at once, and give each file's whole text for the owner to save into that folder.`);
  if (current) parts.push(`The current game.json:\n${JSON.stringify(current.game_json)}\n\nThe current game.js${current.game_js === null ? " is too big to include: work from your own project." : `:\n${current.game_js}`}`);
  parts.push(`--- SPECIFICATION ---\n${SPEC}`);
  return parts.join("\n\n");
}

// Told to a local AI app or IDE that has the tools (arcade_job_get).
export const HOW_TO_DELIVER = `Work on your own project. Tell MyArcade how it is going with arcade_job_progress as you go; the owner watches.
Small pack: send each file's text with arcade_job_put_file (long files in parts), then arcade_job_done.
Built pack, or one with pictures or sounds (nothing but text goes through a tool): build it, copy the pack's files, flat, into a new folder inside the application's inbox folder, wait 10 seconds, then call arcade_job_import with that folder's name, then arcade_job_done.
arcade_job_done answers with errors to fix, or says the draft is ready. You can't publish: the owner tests the draft and decides.`;
