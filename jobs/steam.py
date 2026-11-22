"""Steam playtime: keep a daily ledger and mark games being played.

Jordan's rule: a game counts as "currently playing" with about an hour or more
of play in the last 30 days (and some play in the last 21).

Source: the public profile page (no key), which lists only the few most-played
recent games. With STEAM_API_KEY set, the Web API is used instead and covers
every game played in the last two weeks.
"""
import datetime
import json
import os
import re
import urllib.request

from lib.library import BY_TAB, cell, columns, status_class

MIN_HOURS_30D = 1.0
ACTIVE_DAYS = 21
KEEP_DAYS = 45


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (playtime-ledger)"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", "replace")


def profile_id(data_dir):
    """The Steam profile to read: STEAM_PROFILE, or steamProfile in the data repo's config/ids.json."""
    if os.environ.get("STEAM_PROFILE"):
        return os.environ["STEAM_PROFILE"]
    try:
        with open(os.path.join(data_dir, "config", "ids.json"), encoding="utf-8") as f:
            return json.load(f).get("steamProfile")
    except (OSError, ValueError):
        return None


def fetch_profile_xml(profile):
    """[{appid, name, recent_h, total_h}] from the public profile's most-played list."""
    body = _get("https://steamcommunity.com/profiles/%s/?xml=1" % profile)
    out = []
    for block in re.findall(r"<mostPlayedGame>(.*?)</mostPlayedGame>", body, re.S):
        def tag(name):
            m = re.search(r"<%s>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</%s>" % (name, name), block, re.S)
            return m.group(1).strip() if m else ""
        app = re.search(r"/app/(\d+)", tag("gameLink"))
        if not app:
            continue
        num = lambda s: float(s.replace(",", "") or 0)  # noqa: E731
        out.append({"appid": app.group(1), "name": tag("gameName"),
                    "recent_h": num(tag("hoursPlayed")), "total_h": num(tag("hoursOnRecord"))})
    return out


def fetch_web_api(key, profile):
    body = _get("https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/"
                "?key=%s&steamid=%s&count=0" % (key, profile))
    games = json.loads(body).get("response", {}).get("games", [])
    return [{"appid": str(g["appid"]), "name": g.get("name", ""),
             "recent_h": round(g.get("playtime_2weeks", 0) / 60.0, 1),
             "total_h": round(g.get("playtime_forever", 0) / 60.0, 1)} for g in games]


def _day(iso):
    return datetime.date.fromisoformat(iso[:10])


def update_ledger(ledger, seen, today):
    """Fold today's sighting into the ledger and recompute the 30-day figures. today: YYYY-MM-DD."""
    ledger = ledger or {}
    games = ledger.setdefault("games", {})
    days = ledger.setdefault("days", {})
    ledger.setdefault("since", today)
    row = days.setdefault(today, {})
    t = _day(today)
    for g in seen:
        prev = games.get(g["appid"], {})
        grew = prev.get("total_h") is not None and g["total_h"] > prev["total_h"]
        first = g["appid"] not in games
        last = prev.get("last_played")
        if grew or (first and g["recent_h"] > 0):
            last = today
        games[g["appid"]] = {"name": g["name"] or prev.get("name", ""), "total_h": g["total_h"],
                             "recent_h": g["recent_h"], "last_played": last,
                             "first_seen": prev.get("first_seen", today),
                             "seed_h": prev.get("seed_h", g["recent_h"] if first else 0)}
        row[g["appid"]] = g["total_h"]

    for d in [d for d in days if (t - _day(d)).days > KEEP_DAYS]:
        del days[d]

    window = sorted(d for d in days if 0 <= (t - _day(d)).days <= 30)
    h30, playing = {}, []
    for appid, g in games.items():
        marks = [days[d][appid] for d in window if appid in days[d]]
        hours = (marks[-1] - marks[0]) if marks else 0.0
        # A game first seen inside the window arrived with play we never saw day by day.
        if (t - _day(g["first_seen"])).days <= 30:
            hours += g.get("seed_h", 0)
        hours = round(max(hours, 0.0), 1)
        if hours > 0:
            h30[appid] = hours
        recent = g.get("last_played") and (t - _day(g["last_played"])).days <= ACTIVE_DAYS
        if hours >= MIN_HOURS_30D and recent:
            playing.append(appid)
    ledger["h30"] = h30
    ledger["playing"] = sorted(playing, key=lambda a: -h30.get(a, 0))
    return ledger


def update_sheet(ledger, sheet):
    """Fill hours and last_played in Games (PC); start games that pass the rule. Returns what changed."""
    cfg = BY_TAB["Games (PC)"]
    values = sheet.read(cfg["tab"])
    if not values:
        return []
    cols = columns(cfg, values[0])
    f = cols["fields"]
    if f["appid"] < 0:
        return []
    changed = []
    for i, raw in enumerate(values[1:], start=2):
        g = ledger["games"].get(cell(raw, f["appid"]))
        if not g:
            continue
        hours = ("%.1f" % g["total_h"]).rstrip("0").rstrip(".")
        if f["hours"] >= 0 and cell(raw, f["hours"]) != hours:
            sheet.write_cells(cfg["tab"], i, f["hours"], [hours])
            changed.append((i, "hours"))
        if f["last_played"] >= 0 and g.get("last_played") and cell(raw, f["last_played"]) != g["last_played"]:
            sheet.write_cells(cfg["tab"], i, f["last_played"], [g["last_played"]])
            changed.append((i, "last_played"))
        appid = cell(raw, f["appid"])
        if (appid in ledger["playing"] and cols["status"] >= 0
                and status_class(cell(raw, cols["status"])) == "none"):
            sheet.write_cells(cfg["tab"], i, cols["status"], ["In progress"])
            changed.append((i, "status"))
    return changed


def run(data_dir, now, sheet=None, seen=None):
    path = os.path.join(data_dir, "snapshots", "steam", "ledger.json")
    try:
        with open(path, encoding="utf-8") as f:
            ledger = json.load(f)
    except (OSError, ValueError):
        ledger = {}
    if seen is None:
        profile = profile_id(data_dir)
        if not profile:
            raise SystemExit("no Steam profile: set STEAM_PROFILE or steamProfile in config/ids.json")
        key = os.environ.get("STEAM_API_KEY")
        seen = fetch_web_api(key, profile) if key else fetch_profile_xml(profile)
    ledger = update_ledger(ledger, seen, now[:10])
    ledger["at"] = now
    ledger["source"] = "web-api" if os.environ.get("STEAM_API_KEY") else "profile-page"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(ledger, f, ensure_ascii=False, separators=(",", ":"))
    changed = update_sheet(ledger, sheet) if sheet is not None else []
    return {"seen": len(seen), "playing": [ledger["games"][a]["name"] for a in ledger["playing"]],
            "sheetCells": len(changed)}
