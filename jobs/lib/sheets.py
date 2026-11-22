"""Two ways to reach the media library sheet.

GoogleSheet talks to the real sheet from a GitHub Action.
FixtureSheet is a folder of JSON files with the same shape, for tests and
for running the whole loop on a PC with no credentials.
"""
import json
import os
import urllib.parse
import urllib.request

from .library import col_letter


class FixtureSheet:
    def __init__(self, folder):
        self.folder = folder

    def _path(self, tab):
        return os.path.join(self.folder, tab + ".json")

    def tabs(self):
        return sorted(f[:-5] for f in os.listdir(self.folder) if f.endswith(".json"))

    def read(self, tab):
        path = self._path(tab)
        if not os.path.exists(path):
            return []
        with open(path, encoding="utf-8") as f:
            return json.load(f)["values"]

    def write_cells(self, tab, row, col, values):
        """Write values (a list) into one row, starting at 0-based column col. row is 1-based."""
        data = self.read(tab)
        while len(data) < row:
            data.append([])
        line = data[row - 1]
        while len(line) < col + len(values):
            line.append("")
        for i, v in enumerate(values):
            line[col + i] = v
        with open(self._path(tab), "w", encoding="utf-8") as f:
            json.dump({"tab": tab, "values": data}, f, ensure_ascii=False, indent=0)


class GoogleSheet:
    """Sheets API v4 with a bearer token (minted in the workflow from the service account)."""

    BASE = "https://sheets.googleapis.com/v4/spreadsheets/"

    def __init__(self, spreadsheet_id, token):
        self.id = spreadsheet_id
        self.token = token

    def _call(self, method, url, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))

    def read(self, tab):
        rng = urllib.parse.quote("'%s'" % tab.replace("'", "''"), safe="")
        out = self._call("GET", self.BASE + self.id + "/values/" + rng
                         + "?valueRenderOption=FORMATTED_VALUE")
        return out.get("values", [])

    def write_cells(self, tab, row, col, values):
        a1 = "'%s'!%s%d:%s%d" % (tab.replace("'", "''"), col_letter(col), row,
                                 col_letter(col + len(values) - 1), row)
        self._call("PUT", self.BASE + self.id + "/values/" + urllib.parse.quote(a1, safe="")
                   + "?valueInputOption=USER_ENTERED", {"range": a1, "values": [values]})
