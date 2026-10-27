#!/usr/bin/env python3
"""Creates the store signing key (Ed25519) once, OUTSIDE this repository:
~/.botgateway-store/signing_key.pem (owner-only). Prints the PUBLIC key (base64) - it is built into the
BotGateway app, which refuses packages not signed with this key. Back the private key up somewhere safe:
without it no new package version can be published; whoever has it can sign packages.
Requires: pip install cryptography"""
import base64, os, pathlib
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

KEY = pathlib.Path.home() / ".botgateway-store" / "signing_key.pem"

def public_b64(key) -> str:
    raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()

if KEY.exists():
    key = serialization.load_pem_private_key(KEY.read_bytes(), password=None)
    print("key exists:", KEY)
else:
    KEY.parent.mkdir(mode=0o700, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    fd = os.open(KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, pem)
    os.close(fd)
    print("created:", KEY, "(back it up; never commit it)")
print("public key:", public_b64(key))
