#!/usr/bin/env python3
"""The EMERGENCY store key (store_operation_manual.md 2.3 / 2.5).

  python3 tools/emergency_key.py encrypt   ~/.botgateway-store/signing_key.pem -> emergency_store_key.pem,
                                           encrypted with a password you choose (asked twice); checks it
  python3 tools/emergency_key.py check     opens emergency_store_key.pem (asks the password) and checks that
                                           it is the store's emergency key (public key built into the gateway)

After `encrypt`: copy emergency_store_key.pem to an encrypted USB stick and to the password manager, then
delete BOTH files from this Mac (the unencrypted signing_key.pem first). To sign in an emergency, copy the
encrypted file back to ~/.botgateway-store/ and run build_store.py --emergency; delete it again afterwards.
Requires: pip install cryptography"""
import base64, getpass, os, pathlib, sys
from cryptography.hazmat.primitives import serialization

HOME = pathlib.Path.home() / ".botgateway-store"
PLAIN = HOME / "signing_key.pem"
ENCRYPTED = HOME / "emergency_store_key.pem"
EMERGENCY_PUBLIC = "nf8h5lmGo/kVj1YahP2c/55XRv2FINopAdTc9CmXhv8="


def public_b64(key) -> str:
    raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def encrypt():
    if not PLAIN.exists():
        sys.exit(f"{PLAIN} not found")
    if ENCRYPTED.exists():
        sys.exit(f"{ENCRYPTED} exists already - move it away first")
    key = serialization.load_pem_private_key(PLAIN.read_bytes(), password=None)
    pw = getpass.getpass("new password for the emergency key (long, used nowhere else): ")
    if len(pw) < 16:
        sys.exit("use at least 16 characters")
    if getpass.getpass("again: ") != pw:
        sys.exit("the passwords differ")
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.BestAvailableEncryption(pw.encode()))
    fd = os.open(ENCRYPTED, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, pem)
    os.close(fd)
    check(pw)
    print(f"written: {ENCRYPTED}\nnow back it up (encrypted USB + password manager), then delete {PLAIN} and this file")


def check(pw=None):
    if not ENCRYPTED.exists():
        sys.exit(f"{ENCRYPTED} not found")
    pw = pw if pw is not None else getpass.getpass("password of the emergency key: ")
    try:
        key = serialization.load_pem_private_key(ENCRYPTED.read_bytes(), password=pw.encode())
    except Exception:
        sys.exit("FAILED - wrong password or not a key file")
    if public_b64(key) != EMERGENCY_PUBLIC:
        sys.exit("FAILED - this is not the store's emergency key")
    print("OK - the emergency key opens with this password and matches the gateway's built-in key")


if __name__ == "__main__":
    {"encrypt": encrypt, "check": lambda: check()}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
