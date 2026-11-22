"""Turn a Google service-account key into a short-lived access token.

Standard OAuth JWT-bearer flow: sign a small claim with the account's private
key, exchange it for a token. Python's standard library can't sign RS256, so
the signing is done by the openssl program (present on GitHub's runners and in
Git for Windows). The key never leaves this process except into a temp file
that is deleted straight away.
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

TOKEN_URL = "https://oauth2.googleapis.com/token"
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def find_openssl():
    found = shutil.which("openssl")
    if found:
        return found
    for path in (r"C:\Program Files\Git\usr\bin\openssl.exe", r"C:\Program Files\Git\mingw64\bin\openssl.exe"):
        if os.path.exists(path):
            return path
    return None


def sign_rs256(private_key_pem, message):
    openssl = find_openssl()
    if not openssl:
        raise RuntimeError("openssl not found; it is needed to sign the Google token request")
    fd, key_path = tempfile.mkstemp(suffix=".pem")
    try:
        with os.fdopen(fd, "w", encoding="ascii", newline="\n") as f:
            f.write(private_key_pem)
        out = subprocess.run([openssl, "dgst", "-sha256", "-sign", key_path],
                             input=message, capture_output=True, check=True)
        return out.stdout
    finally:
        os.remove(key_path)


def signed_assertion(info, scope, now=None):
    now = int(now if now is not None else time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    if info.get("private_key_id"):
        header["kid"] = info["private_key_id"]
    claims = {"iss": info["client_email"], "scope": scope, "aud": TOKEN_URL, "iat": now, "exp": now + 3600}
    body = _b64url(json.dumps(header, separators=(",", ":")).encode()) + b"." + \
        _b64url(json.dumps(claims, separators=(",", ":")).encode())
    return body + b"." + _b64url(sign_rs256(info["private_key"], body))


def access_token(service_account_json, scope=SHEETS_SCOPE):
    info = json.loads(service_account_json)
    form = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": signed_assertion(info, scope).decode("ascii")}).encode("ascii")
    req = urllib.request.Request(TOKEN_URL, data=form, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))["access_token"]
