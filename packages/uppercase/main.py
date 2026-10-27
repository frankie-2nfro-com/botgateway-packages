"""Example worker package: the old built-in `uppercase`, as a Python program.

The gateway starts it once per job, writes the input as JSON to stdin and reads the result JSON
from stdout. A non-zero exit (e.g. an exception) is reported to the client as a failed job, with stderr.

Direct request (the client sends to worker "uppercase"):
  "hello rust"            ->  "HELLO RUST"
  {"text": "hello rust"}  ->  {"text": "HELLO RUST"}

As an action (in a reply part or a client report) the gateway sends an envelope:
  {"action_id": ..., "artifact_dir": "<the request's folder>", "params": {...}, "uses": ["hello.txt"], ...}
  -> params.text if given, else the text of the files in "uses" (read from artifact_dir)
  -> {"text": "HELLO WORLD", "from": "params.text" | ["hello.txt"]}

It is a worker package (worker.toml next to it): install it in the app under
App -> Worker packages, then + on "Uppercase (Python)" in a gateway's Workers tab.
"""
import json
import os
import sys


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


payload = json.load(sys.stdin)

if isinstance(payload, dict) and "action_id" in payload:
    # Action envelope.
    params = payload.get("params") or {}
    if isinstance(params.get("text"), str):
        print(json.dumps({"text": params["text"].upper(), "from": "params.text"}, ensure_ascii=False))
        sys.exit(0)
    folder = payload.get("artifact_dir") or os.environ.get("ARTIFACT_DIR", "")
    names = payload.get("uses") or []
    if not names:
        fail('as an action: give params {"text": "..."} or text files in "uses"')
    texts = []
    for name in names:
        if "/" in name or "\\" in name or name.startswith("."):
            fail(f"bad artifact name: {name}")
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                texts.append(f.read())
        except (OSError, UnicodeDecodeError) as e:
            fail(f"{name}: not a readable text file ({e})")
    print(json.dumps({"text": "\n".join(texts).upper(), "from": names}, ensure_ascii=False))
elif isinstance(payload, str):
    print(json.dumps(payload.upper(), ensure_ascii=False))
elif isinstance(payload, dict) and isinstance(payload.get("text"), str):
    print(json.dumps({**payload, "text": payload["text"].upper()}, ensure_ascii=False))
else:
    fail('expected plain text or {"text": "..."} (or use it as an action)')
