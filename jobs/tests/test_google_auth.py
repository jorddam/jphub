import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from lib import google_auth  # noqa: E402

OPENSSL = google_auth.find_openssl()


def unb64(part):
    return base64.urlsafe_b64decode(part + b"=" * (-len(part) % 4))


@unittest.skipUnless(OPENSSL, "openssl not available")
class Assertion(unittest.TestCase):
    def test_signed_claim_verifies_against_the_public_key(self):
        with tempfile.TemporaryDirectory() as d:
            key, pub, sig, msg = (os.path.join(d, n) for n in ("k.pem", "p.pem", "sig", "msg"))
            subprocess.run([OPENSSL, "genrsa", "-out", key, "2048"], check=True, capture_output=True)
            subprocess.run([OPENSSL, "rsa", "-in", key, "-pubout", "-out", pub], check=True, capture_output=True)
            with open(key, encoding="ascii") as f:
                info = {"client_email": "jobs@example.iam.gserviceaccount.com", "private_key": f.read(),
                        "private_key_id": "abc"}
            token = google_auth.signed_assertion(info, google_auth.SHEETS_SCOPE, now=1_800_000_000)
            head, claims, signature = token.split(b".")
            self.assertEqual(json.loads(unb64(head)), {"alg": "RS256", "typ": "JWT", "kid": "abc"})
            self.assertEqual(json.loads(unb64(claims)), {
                "iss": "jobs@example.iam.gserviceaccount.com", "scope": google_auth.SHEETS_SCOPE,
                "aud": "https://oauth2.googleapis.com/token", "iat": 1_800_000_000, "exp": 1_800_003_600})
            with open(sig, "wb") as f:
                f.write(unb64(signature))
            with open(msg, "wb") as f:
                f.write(head + b"." + claims)
            out = subprocess.run([OPENSSL, "dgst", "-sha256", "-verify", pub, "-signature", sig, msg],
                                 capture_output=True)
            self.assertIn(b"Verified OK", out.stdout)


if __name__ == "__main__":
    unittest.main()
