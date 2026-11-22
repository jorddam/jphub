"""How each tab of the media library sheet maps to the hub's rows.

Columns are found by header name (first match, case-insensitive), never by
letter, so the sheet can gain or reorder columns without breaking the hub.
"""
import hashlib
import re

# Words the sheet's In Progress formula treats as "in use".
IN_USE = {"in progress", "in rotation", "reading", "playing", "watching", "listening"}
ON_HOLD = {"on hold", "paused"}
FINISHED = {"finished"}
DROPPED = {"dropped"}

# The only status words the hub may write.
WRITABLE_STATUS = {"In progress", "In rotation", "On hold", "Finished", "Dropped", "Not started", ""}

TABS = [
    {"tab": "Ebooks", "slug": "ebooks", "kind": "book",
     "title": ["Title (日本語)", "Title"], "status": "Status", "rating": ["My Rating (1-5)", "My Rating"],
     "fields": {"en": "English Title", "creator": "Author", "level": "Approx. JLPT", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Length", "tags": "Tags", "where": "Where",
                "ownership": "Ownership", "series": "Series / Vol.", "pages": "Print Pages"}},
    {"tab": "Novels", "slug": "novels", "kind": "book",
     "title": ["Title (日本語)"], "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"en": "English Title", "creator": "Author", "level": "Approx. JLPT", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Length", "tags": "Tags", "format": "Format / Edition",
                "pages": "Pages"}},
    {"tab": "Bunko", "slug": "bunko", "kind": "book",
     "title": ["Title (日本語)"], "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"en": "English Title", "creator": "Author", "level": "Approx. JLPT", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Length", "tags": "Tags", "format": "Format / Edition",
                "pages": "Pages"}},
    {"tab": "Nonfiction & Essays", "slug": "nonfiction", "kind": "book",
     "title": ["Title (日本語)"], "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"en": "English Title", "creator": "Author / Editor", "level": "Approx. JLPT",
                "genre": "Subject", "synopsis": "Synopsis", "length": "Length", "tags": "Tags",
                "format": "Type", "pages": "Pages"}},
    {"tab": "Manga", "slug": "manga", "kind": "manga", "series": True,
     "title": ["Title (日本語)"], "vol": "Vol.", "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"en": "English Title", "creator": "Author", "level": "Approx. JLPT", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Length", "tags": "Tags", "furigana": "Furigana"}},
    {"tab": "BookWalker Manga", "slug": "bookwalker", "kind": "manga", "series": True,
     "title": ["Title (日本語)"], "vol": "Vol.", "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"en": "English Title", "creator": "Author / Artist", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Length", "tags": "Tags", "link": "Link",
                "progress": "BookWalker Progress"}},
    {"tab": "Games (PC)", "slug": "games-pc", "kind": "game",
     "title": ["game"], "status": "status", "rating": [],
     "fields": {"appid": "id", "tier": "jp_tier", "score": "jp_score", "note": "jp_note",
                "hours": "hours", "last_played": "last_played", "length": "Length", "tags": "Tags"}},
    {"tab": "Games (PS3)", "slug": "games-ps3", "kind": "game",
     "title": ["Title (日本語)"], "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"en": "English Title", "creator": "Publisher (JP)", "level": "Approx. JLPT",
                "genre": "Genre", "synopsis": "Synopsis", "length": "Length", "tags": "Tags",
                "platform": "Platform"}},
    {"tab": "Online stories", "slug": "web", "kind": "web",
     "title": ["Title"], "status": "Status", "rating": [],
     "fields": {"creator": "Author", "level": "Level", "genre": "Genre", "synopsis": "Premise",
                "length": "Length", "tags": "Tags", "site": "Site", "link": "Start reading"}},
    {"tab": "YouTube", "slug": "video", "kind": "video",
     "title": ["Channel"], "status": "Status", "rating": ["My Rating (1-5)"],
     "fields": {"creator": "Handle", "synopsis": "Content", "note": "Notes", "length": "Length",
                "tags": "Tags", "link": "Link"}},
    {"tab": "Podcasts", "slug": "podcasts", "kind": "audio", "in_use_word": "In rotation",
     "title": ["Title"], "status": "Status", "rating": [],
     "fields": {"creator": "Publisher / Network", "level": "Approx JLPT", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Typical Length", "format": "Media Type",
                "link": "Link"}},
    {"tab": "Podcast Episodes", "slug": "episodes", "kind": "episode",
     "title": ["Title"], "status": None, "rating": [],
     "fields": {"creator": "Show", "ep": "Ep", "video_id": "Video ID", "link": "Link",
                "minutes": "Minutes", "level": "Level (as tagged)", "added": "Added"}},
    {"tab": "Wishlist", "slug": "wishlist", "kind": "wish",
     "title": ["Title (日本語)"], "status": None, "rating": [],
     "fields": {"en": "English Title", "creator": "Author", "level": "Approx. JLPT", "genre": "Genre",
                "synopsis": "Synopsis", "length": "Length", "tags": "Tags", "category": "Category"}},
]

BY_TAB = {t["tab"]: t for t in TABS}


def col_letter(index):
    """0 -> A, 25 -> Z, 26 -> AA."""
    out = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        out = chr(65 + rem) + out
    return out


def cell(row, i):
    if i is None or i < 0 or i >= len(row):
        return ""
    v = row[i]
    return "" if v is None else str(v).strip()


def find_col(headers, names):
    """Index of the first header matching any of names (case-insensitive), or -1."""
    if not names:
        return -1
    if isinstance(names, str):
        names = [names]
    low = [str(h or "").strip().lower() for h in headers]
    for name in names:
        want = name.strip().lower()
        if want in low:
            return low.index(want)
    return -1


def columns(cfg, headers):
    """Resolve every column the hub uses on this tab. -1 means the tab lacks it."""
    return {
        "title": find_col(headers, cfg["title"]),
        "vol": find_col(headers, cfg.get("vol")),
        "status": find_col(headers, cfg.get("status")),
        "rating": find_col(headers, cfg.get("rating")),
        "fields": {k: find_col(headers, v) for k, v in cfg["fields"].items()},
    }


def work_key(tab, title):
    """Same id the curator's catalog.py uses: sha1(tab|title), first 10 hex chars."""
    return hashlib.sha1((tab + "|" + title).encode("utf-8")).hexdigest()[:10]


def status_class(status):
    s = (status or "").strip().lower()
    if s in IN_USE:
        return "use"
    if s in ON_HOLD:
        return "hold"
    if s in FINISHED:
        return "done"
    if s in DROPPED:
        return "dropped"
    return "none"


def vol_sort_key(vol, order):
    m = re.match(r"\s*(\d+(?:\.\d+)?)", vol or "")
    return (0, float(m.group(1)), order) if m else (1, 0.0, order)


def snapshot_tab(cfg, values, at):
    """Turn a tab's raw values (header row first) into the hub's snapshot."""
    headers = values[0] if values else []
    cols = columns(cfg, headers)
    rows = []
    if cols["title"] >= 0:
        for i, raw in enumerate(values[1:], start=2):
            title = cell(raw, cols["title"])
            if not title:
                continue
            row = {"row": i, "key": work_key(cfg["tab"], title), "title": title}
            if cols["vol"] >= 0:
                row["vol"] = cell(raw, cols["vol"])
            if cols["status"] >= 0:
                row["status"] = cell(raw, cols["status"])
            if cols["rating"] >= 0:
                row["rating"] = cell(raw, cols["rating"])
            for name, idx in cols["fields"].items():
                v = cell(raw, idx)
                if v:
                    row[name] = v
            rows.append(row)
    return {
        "tab": cfg["tab"], "slug": cfg["slug"], "kind": cfg["kind"],
        "series": bool(cfg.get("series")), "inUseWord": cfg.get("in_use_word", "In progress"),
        "at": at, "count": len(rows),
        "statusCol": col_letter(cols["status"]) if cols["status"] >= 0 else None,
        "ratingCol": col_letter(cols["rating"]) if cols["rating"] >= 0 else None,
        "rows": rows,
    }


def series_status(volumes):
    """One status for a series from its volume rows (plan §5.5)."""
    classes = [status_class(v.get("status")) for v in volumes]
    if "use" in classes:
        return "In progress"
    if "hold" in classes:
        return "On hold"
    if classes and all(c == "done" for c in classes):
        return "Finished"
    if "dropped" in classes:
        return "Dropped"
    return ""
