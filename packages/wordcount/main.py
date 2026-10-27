"""Example worker package (worker.toml next to it): reads the payload JSON on stdin, prints the result JSON on stdout."""
import json
import sys

payload = json.load(sys.stdin)
text = payload.get("text", "")
print(json.dumps({"words": len(text.split()), "chars": len(text)}))
