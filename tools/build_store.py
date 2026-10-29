#!/usr/bin/env python3
"""Builds the store: for every packages/<id>/ (worker.toml), packs dist/<id>-<version>.tar.gz once
(reproducible: sorted, no times / owners, no caches), writes store.json (every version in dist/, with its
SHA-256) and signs it into store.json.sig. A package changed without a new version is refused (an archive
is never changed once published). Then commit and push packages/, dist/, store.json and store.json.sig.

  python3 tools/build_store.py               sign with the USB security key (Thetis): touch it when it blinks
  python3 tools/build_store.py --emergency   sign with the EMERGENCY file key (asks for its password)
  python3 tools/build_store.py --verify      only check the current store.json.sig (either kind)

The security key signs with Homebrew's OpenSSH (`ssh-keygen -Y sign`, namespace botgateway-store,
key ~/.botgateway-store/store_sk); tools/allowed_signers holds its public key for `ssh-keygen -Y verify`.
Requires: pip install cryptography   (Python 3.11+ for tomllib); brew install openssh"""
import base64, getpass, gzip, hashlib, io, json, os, pathlib, subprocess, sys, tarfile, tomllib
from cryptography.hazmat.primitives import serialization

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOME = pathlib.Path.home() / ".botgateway-store"
SK_KEY = HOME / "store_sk"                      # handle of the key inside the USB security key
EMERGENCY = [HOME / "emergency_store_key.pem", HOME / "signing_key.pem"]   # encrypted copy first
SSH_KEYGEN = "/opt/homebrew/bin/ssh-keygen"     # Apple's ssh-keygen can't use security keys
NAMESPACE = "botgateway-store"
EMERGENCY_PUBLIC = "nf8h5lmGo/kVj1YahP2c/55XRv2FINopAdTc9CmXhv8="
SKIP = {"__pycache__", ".DS_Store", ".git"}


def files_of(folder: pathlib.Path):
    return sorted(p for p in folder.rglob("*") if p.is_file() and not (SKIP & set(p.relative_to(folder).parts)) and p.suffix != ".pyc")


def pack(folder: pathlib.Path) -> bytes:
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for p in files_of(folder):
            info = tarfile.TarInfo(p.relative_to(folder).as_posix())
            data = p.read_bytes()
            info.size, info.mtime, info.mode = len(data), 0, 0o755 if p.stat().st_mode & 0o111 else 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            tar.addfile(info, io.BytesIO(data))
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(raw.getvalue())
    return out.getvalue()


def disclosure(m: dict):
    """What the Portal shows before an application is picked (app_hosting_requirements.txt 3.5,
    app_sandbox_requirements.txt 3): what it sends to the owner's bot and who may cause it, its login,
    what visitors of its website may do and which other websites it may reach. Taken from [app]; the
    gateway shows the same from the installed manifest and enforces ai / net / login."""
    app = m.get("app") or {}
    ai = None
    if app.get("ai_sends") or app.get("ai"):
        ai = {"sends": app.get("ai_sends", ""), "who": "visitors" if app.get("ai") == "visitors" else "owner"}
    return {"ai": ai, "login": app.get("login") or "none", "visitors": app.get("visitors") or None, "net": app.get("net", [])}


MAX_ICON = 16 * 1024


def icon_of(m: dict, tar):
    """An application's icon for the Portal: its emoji, or its .svg / .png file (at most 16 KB) as a data:
    address - inside the signed index, so the relay needs nothing else. None = the default icon."""
    icon = ((m.get("app") or {}).get("icon") or "").strip()
    if not icon.endswith((".svg", ".png")):
        return icon or None
    try:
        data = tar.extractfile(icon).read()
    except (KeyError, AttributeError):
        sys.exit(f"{m['id']} {m['version']}: icon '{icon}' is not in the package")
    if len(data) > MAX_ICON:
        sys.exit(f"{m['id']} {m['version']}: icon '{icon}' is {len(data) // 1024} KB, at most {MAX_ICON // 1024} KB")
    if icon.endswith(".png") and not data.startswith(b"\x89PNG\r\n\x1a\n") or icon.endswith(".svg") and b"<svg" not in data:
        sys.exit(f"{m['id']} {m['version']}: icon '{icon}' is not a PNG / SVG file")
    media = "image/png" if icon.endswith(".png") else "image/svg+xml"
    return f"data:{media};base64,{base64.b64encode(data).decode()}"


def main():
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    for folder in sorted((ROOT / "packages").iterdir()):
        if not (folder / "worker.toml").is_file():
            continue
        m = tomllib.loads((folder / "worker.toml").read_text())
        if m.get("id") != folder.name:
            sys.exit(f"{folder.name}: worker.toml id must be '{folder.name}'")
        if m.get("license") != "Apache-2.0":
            sys.exit(f"{folder.name}: license = \"Apache-2.0\" is required (store packages are open source)")
        data = pack(folder)
        target = dist / f"{m['id']}-{m['version']}.tar.gz"
        if target.exists():
            if target.read_bytes() != data:
                sys.exit(f"{target.name} exists but {folder.name} changed: give it a new version")
        else:
            target.write_bytes(data)
            print("packed", target.name)
    entries = []
    for a in sorted(dist.glob("*.tar.gz")):
        data = a.read_bytes()
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            m = tomllib.loads(tar.extractfile("worker.toml").read().decode())
            icon = icon_of(m, tar) if m.get("type") == "application" else None
        entries.append({"id": m["id"], "version": m["version"], "type": m.get("type", "worker"), "name": m["name"],
                        "about": m.get("about", ""), "author": m.get("author", ""), "license": m["license"],
                        "archive": f"dist/{a.name}", "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
        if m.get("type") == "application":
            entries[-1]["disclosure"] = disclosure(m)
            if icon:
                entries[-1]["icon"] = icon
    index = json.dumps({"store": 1, "packages": entries}, indent=1, sort_keys=True, ensure_ascii=False).encode() + b"\n"
    (ROOT / "store.json").write_bytes(index)
    sig = ROOT / "store.json.sig"
    if sig.exists():
        sig.unlink()
    if "--emergency" in sys.argv:
        path = next((p for p in EMERGENCY if p.exists()), None)
        if not path:
            sys.exit("no emergency key file in ~/.botgateway-store/ (copy it there from its offline backup first)")
        data = path.read_bytes()
        password = getpass.getpass(f"password of {path.name} (empty if it is not encrypted): ").encode() or None
        key = serialization.load_pem_private_key(data, password=password)
        sig.write_text(base64.b64encode(key.sign(index)).decode() + "\n")
        print(f"store.json: {len(entries)} package version(s), signed with the EMERGENCY key")
    else:
        if not SK_KEY.exists():
            sys.exit(f"{SK_KEY} is missing (see store_operation_manual.md: the security key)")
        print("touch the security key when it blinks ...")
        r = subprocess.run([SSH_KEYGEN, "-Y", "sign", "-f", str(SK_KEY), "-n", NAMESPACE, str(ROOT / "store.json")])
        if r.returncode != 0 or not sig.exists():
            sys.exit("signing with the security key failed (is it plugged in? did you touch it?)")
        print(f"store.json: {len(entries)} package version(s), signed with the security key")
    verify()


def verify():
    """Checks store.json.sig the way the gateway does (the security key via ssh-keygen -Y verify)."""
    index, sig = (ROOT / "store.json").read_bytes(), (ROOT / "store.json.sig").read_text()
    if sig.startswith("-----BEGIN SSH SIGNATURE-----"):
        r = subprocess.run([SSH_KEYGEN, "-Y", "verify", "-f", str(ROOT / "tools" / "allowed_signers"), "-I", NAMESPACE,
                            "-n", NAMESPACE, "-s", str(ROOT / "store.json.sig")], input=index, capture_output=True)
        ok = r.returncode == 0
        print(("OK - " if ok else "FAILED - ") + (r.stdout or r.stderr).decode().strip())
    else:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        try:
            Ed25519PublicKey.from_public_bytes(base64.b64decode(EMERGENCY_PUBLIC)).verify(base64.b64decode(sig.strip()), index)
            ok = True
            print("OK - signed with the emergency key")
        except Exception:
            ok = False
            print("FAILED - not signed with the emergency key")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    if "--verify" in sys.argv:
        verify()
    else:
        main()
