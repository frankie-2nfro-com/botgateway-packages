# Bot Gateway packages

Open-source (Apache-2.0) worker and application packages for the BotGateway app. The app installs them
from here only after the owner picked them in the Bot Gateway Portal and pressed Install on the gateway.

- `packages/<id>/` - a package: `worker.toml` (+ program files for worker packages). `type = "application"`
  marks an application (data, a page, LLM actions); otherwise it is a worker package.
- `dist/<id>-<version>.tar.gz` - the published archives (never changed once published).
- `store.json` + `store.json.sig` - the signed index; the app refuses anything not signed with the store key.

Publish a new version: change the package, raise its `version`, run `python3 tools/build_store.py`, commit
and push. The signing key is created once with `tools/store_keygen.py` and never leaves the owner's computer.
