"""The Airtable Reading Feed: the real table, and a file-backed stand-in for tests."""
import glob
import json
import os
import urllib.error
import urllib.parse
import urllib.request

FIELDS = {
    "jp": "fldX1JPttxMNOV54M", "en": "fldGnSlagx4CICkMB", "url": "fldJ77qu5JRr8ySpv",
    "source": "fldLqaprqVFMVcceJ", "author": "fldcueyrcyCerIhYW", "published": "fldo5Z5s9XD4uCgvQ",
    "summary": "fldNmXGi1Ze6Nq8nE", "hook": "fldfUDRZtaoIF9oEB", "category": "fldyrs4S6mU9hchIx",
    "difficulty": "fldRrRmTuV8Y1oMxz", "length": "fldx27EAaKQBwR0kE", "vocab": "fldADPsofSz9BhvuZ",
    "read": "fldvwREjH8jMmJUcD", "added": "fldt9EvOjAnN62PdN",
}


def month_files(data_dir):
    return sorted(glob.glob(os.path.join(data_dir, "snapshots", "articles", "*.json")))


class FixtureArticles:
    """Marks an article read straight in the snapshot files."""

    def __init__(self, data_dir):
        self.data_dir = data_dir

    def set_read(self, record_id, value):
        for path in month_files(self.data_dir):
            with open(path, encoding="utf-8") as f:
                month = json.load(f)
            for rec in month.get("records", []):
                if rec.get("id") == record_id:
                    rec["read"] = value
                    with open(path, "w", encoding="utf-8", newline="\n") as f:
                        json.dump(month, f, ensure_ascii=False, separators=(",", ":"))
                    return True
        return False


class AirtableArticles:
    """Airtable REST API. Needs a token limited to the Reading Feed base."""

    def __init__(self, token, base_id, table_id):
        self.token, self.base, self.table = token, base_id, table_id

    def _call(self, method, url, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": "Bearer " + self.token, "Content-Type": "application/json",
            "User-Agent": "jphub-jobs/1"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # Airtable's error body says which permission or id is wrong; it holds no secret.
            raise SystemExit("Airtable answered %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:400]))

    def set_read(self, record_id, value):
        url = "https://api.airtable.com/v0/%s/%s/%s" % (self.base, self.table, record_id)
        self._call("PATCH", url, {"fields": {FIELDS["read"]: bool(value)}})
        return True

    def list_since(self, iso_date):
        """Every record added on or after iso_date, as the hub's article rows."""
        out, offset = [], None
        formula = "IS_AFTER({Added}, DATEADD('%s', -1, 'days'))" % iso_date
        while True:
            q = {"returnFieldsByFieldId": "true", "pageSize": "100", "filterByFormula": formula}
            if offset:
                q["offset"] = offset
            page = self._call("GET", "https://api.airtable.com/v0/%s/%s?%s" % (
                self.base, self.table, urllib.parse.urlencode(q)))
            for rec in page.get("records", []):
                f = rec.get("fields", {})
                row = {"id": rec["id"]}
                for name, fid in FIELDS.items():
                    v = f.get(fid)
                    row[name] = v.get("name") if isinstance(v, dict) else v
                row["read"] = bool(row.get("read"))
                out.append(row)
            offset = page.get("offset")
            if not offset:
                return out
