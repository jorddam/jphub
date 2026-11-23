"""Local stand-in for GitHub Pages + the private data repo + the Actions.

  py -3.9 jphub/tools/dev_server.py --port 8765

  /jphub/...        the hub's files, at the same path as on GitHub Pages
  /__data/...       GET / PUT / DELETE files in jphub-data-sample (the data repo)
  /__run/<job>      POST: run a job (snapshot, outbox, steam) against the sample sheet

It listens on 127.0.0.1 only and is for development; nothing here is deployed.
"""
import argparse
import hashlib
import json
import mimetypes
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = os.path.dirname(HERE)
JOBS = {"snapshot", "outbox", "steam", "articles"}   # articles is a no-op here: it needs the Airtable token
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")


def inside(root, rel):
    path = os.path.normpath(os.path.join(root, rel))
    return path if path == root or path.startswith(root + os.sep) else None


class Handler(BaseHTTPRequestHandler):
    data_dir = ""

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def send(self, code, body=b"", ctype="application/json", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def resolve(self):
        parts = urlsplit(self.path)
        path = unquote(parts.path)
        if path.startswith("/__data/"):
            return "data", inside(self.data_dir, path[len("/__data/"):].replace("/", os.sep)), parts.query
        if path.startswith("/__run/"):
            return "run", path[len("/__run/"):], parts.query
        if path == "/jphub" or path.startswith("/jphub/"):
            return "hub", inside(HUB, path[len("/jphub/"):].replace("/", os.sep)), parts.query
        return "other", path, parts.query

    def do_GET(self):
        kind, target, query = self.resolve()
        if kind == "other":
            return self.send(302, extra={"Location": "/jphub/"})
        if kind == "run" or target is None:
            return self.send(404, b'{"error":"not found"}')
        if os.path.isdir(target):
            if kind == "data":
                names = sorted(n for n in os.listdir(target) if not n.startswith("."))
                return self.send(200, json.dumps(names).encode("utf-8"))
            if not urlsplit(self.path).path.endswith("/"):
                return self.send(302, extra={"Location": urlsplit(self.path).path + "/"})
            target = os.path.join(target, "index.html")
        if not os.path.isfile(target):
            return self.send(404, b'{"error":"not found"}')
        with open(target, "rb") as f:
            body = f.read()
        etag = '"%s"' % hashlib.sha1(body).hexdigest()
        if self.headers.get("If-None-Match") == etag:
            return self.send(304, extra={"ETag": etag})
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json", "text/javascript"):
            ctype += "; charset=utf-8"
        self.send(200, body, ctype, {"ETag": etag})

    do_HEAD = do_GET

    def do_PUT(self):
        kind, target, _ = self.resolve()
        if kind != "data" or target is None or os.path.isdir(target):
            return self.send(400, b'{"error":"bad path"}')
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(body)
        self.send(200, b'{"ok":true}', extra={"ETag": '"%s"' % hashlib.sha1(body).hexdigest()})

    def do_DELETE(self):
        kind, target, _ = self.resolve()
        if kind != "data" or target is None or not os.path.isfile(target):
            return self.send(404, b'{"error":"not found"}')
        os.remove(target)
        self.send(200, b'{"ok":true}')

    def do_POST(self):
        kind, job, _ = self.resolve()
        if kind != "run" or job not in JOBS:
            return self.send(404, b'{"error":"unknown job"}')
        proc = subprocess.run([sys.executable, os.path.join(HUB, "jobs", "run.py"), job,
                               "--data", self.data_dir, "--fixture"],
                              capture_output=True, timeout=120)
        if proc.returncode:
            return self.send(500, json.dumps({"error": proc.stderr.decode("utf-8", "replace")[-2000:]}).encode())
        self.send(200, proc.stdout.strip() or b"{}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--data", default=os.path.join(os.path.dirname(HUB), "jphub-data-sample"))
    args = p.parse_args()
    Handler.data_dir = os.path.abspath(args.data)
    print("hub:  http://localhost:%d/jphub/\ndata: %s" % (args.port, Handler.data_dir), flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
