# Bot Gateway packages

Open-source (Apache-2.0) worker and application packages for the BotGateway app. The app installs them
from here only after the owner picked them in the Bot Gateway Portal and pressed Install on the gateway.

- `packages/<id>/` - a package: `worker.toml` (+ program files for worker packages). `type = "application"`
  marks an application: its own program (`server/main.js`, run in the gateway's sandbox) and pages (`web/`).
- `kit/` - the app kit: a JavaScript library for applications (collections, files, AI actions, the page).
  Copy `kit/server.js` into a package's `kit/` and `kit/web/*` into its `web/kit/`.
- Try an application before signing it: `gateway --dev-app packages/<id>` (http://127.0.0.1:47900/).
- `dist/<id>-<version>.tar.gz` - the published archives (never changed once published).
- `store.json` + `store.json.sig` - the signed index; the app refuses anything not signed with the store key.

Change logs: `packages/<id>/CHANGELOG.TXT` (what each version changed - not packed; it becomes the
version's "changes" in `store.json`, shown as "What's new" in the Portal and the gateway) and
`STORE_CHANGELOG.TXT` (this repository itself: kit/, tools/ ...). Publish a new version: write the
changes under the top (coming) version of its CHANGELOG.TXT, raise the package's `version`, run `python3 tools/build_store.py --only <id>`,
commit and push (the owner's `store_update.sh --package <id>` does all of it). The signing key is created once with `tools/store_keygen.py` and never leaves the owner's computer.
