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

// Told to a local AI app or IDE that has the tools (arcade_job_get).
export const HOW_TO_DELIVER = `Work on your own project. Tell MyArcade how it is going with arcade_job_progress as you go; the owner watches.
Small pack: send each file's text with arcade_job_put_file (long files in parts), then arcade_job_done.
Built pack, or one with pictures or sounds (nothing but text goes through a tool): build it, copy the pack's files, flat, into a new folder inside the application's inbox folder, wait 10 seconds, then call arcade_job_import with that folder's name, then arcade_job_done.
arcade_job_done answers with errors to fix, or says the draft is ready. You can't publish: the owner tests the draft and decides.`;
