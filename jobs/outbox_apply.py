"""Apply the change requests the apps left in outbox/pending/.

Each request is data, not a command: only the Status and Rating cells of the
known library tabs (and an article's Read box) can change, and a cell that
someone else changed since the app last saw it is left alone.
"""
import json
import os

from lib.library import (BY_TAB, WRITABLE_STATUS, cell, columns, series_status, status_class,
                         vol_sort_key)

KEEP_RESULTS = 200


def same_status(a, b):
    a, b = (a or "").strip().lower(), (b or "").strip().lower()
    blank = {"", "not started"}
    return a == b or (a in blank and b in blank)


def _rating_ok(v):
    if v in ("", None):
        return True
    try:
        n = float(v)
    except (TypeError, ValueError):
        return False
    return 1 <= n <= 5 and (n * 2) == int(n * 2)


def _validate(req):
    if not isinstance(req, dict):
        return "not an object"
    cfg = BY_TAB.get(req.get("tab"))
    if not cfg or not cfg.get("status"):
        return "tab not writable"
    title = (req.get("match") or {}).get("title")
    if not isinstance(title, str) or not title.strip():
        return "no title to match"
    change = req.get("set") or {}
    if req.get("op") not in (None, "next_volume"):
        return "unknown op"
    if not change and req.get("op") != "next_volume":
        return "nothing to set"
    if set(change) - {"Status", "Rating"}:
        return "only Status and Rating can be set"
    if "Status" in change and change["Status"] not in WRITABLE_STATUS:
        return "status word not allowed"
    if "Rating" in change and (not cfg.get("rating") or not _rating_ok(change["Rating"])):
        return "rating not allowed here"
    if req.get("scope") == "series" and not cfg.get("series"):
        return "tab has no series"
    return None


def _matches(values, cols, match):
    title = match["title"].strip()
    vol = match.get("vol")
    out = []
    for i, raw in enumerate(values[1:], start=2):
        if cell(raw, cols["title"]) != title:
            continue
        if vol not in (None, "") and cols["vol"] >= 0 and cell(raw, cols["vol"]) != str(vol).strip():
            continue
        out.append((i, raw))
    return out


def _apply_row(req, cfg, sheet, values, cols):
    found = _matches(values, cols, req["match"])
    if not found:
        return {"result": "row_missing"}
    hint = req.get("rowHint")
    pick = [f for f in found if f[0] == hint] or (found if len(found) == 1 else [])
    if not pick:
        return {"result": "ambiguous", "detail": "%d rows share this title" % len(found)}
    row, raw = pick[0]
    change = req.get("set") or {}
    current = cell(raw, cols["status"])
    wrote = False
    if "Status" in change and current != change["Status"]:
        expect = (req.get("expect") or {}).get("Status")
        if expect is not None and not same_status(current, expect):
            return {"result": "conflict", "current": current, "row": row}
        sheet.write_cells(cfg["tab"], row, cols["status"], [change["Status"]])
        wrote = True
    if "Rating" in change and cols["rating"] >= 0 and cell(raw, cols["rating"]) != str(change["Rating"]):
        sheet.write_cells(cfg["tab"], row, cols["rating"], [change["Rating"]])
        wrote = True
    return {"result": "applied" if wrote else "noop", "row": row}


def _apply_series(req, cfg, sheet, values, cols):
    """One status for the whole series; the sheet keeps marking the current volume."""
    found = _matches(values, cols, {"title": req["match"]["title"]})
    if not found:
        return {"result": "row_missing"}
    vols = sorted(found, key=lambda f: vol_sort_key(cell(f[1], cols["vol"]), f[0]))
    state = [{"row": r, "status": cell(raw, cols["status"])} for r, raw in vols]
    classes = [status_class(s["status"]) for s in state]
    derived = series_status(state)
    in_use = cfg.get("in_use_word", "In progress")
    want = (req.get("set") or {}).get("Status")
    next_volume = req.get("op") == "next_volume"

    expect = (req.get("expect") or {}).get("Status")
    if expect is not None and not same_status(derived, expect) and not same_status(derived, want):
        return {"result": "conflict", "current": derived}

    def first(*wanted):
        for kinds in wanted:
            for i, c in enumerate(classes):
                if c in kinds:
                    return i
        return None

    writes = []
    if next_volume:
        cur = first({"use"}, {"hold"})
        if cur is None:
            cur_next = first({"none", "dropped"})
            if cur_next is not None:
                writes.append((cur_next, in_use))
        else:
            writes.append((cur, "Finished"))
            for i in range(cur + 1, len(classes)):
                if classes[i] != "done":
                    writes.append((i, in_use))
                    break
    elif want == "Finished":
        writes = [(i, "Finished") for i, c in enumerate(classes) if c != "done"]
    elif want in (in_use, "In progress"):
        if first({"use"}) is None:
            target = first({"hold"}, {"none", "dropped"})
            if target is None:
                return {"result": "noop", "detail": "every volume is finished"}
            writes.append((target, in_use))
    elif want in ("On hold", "Dropped", "Not started", ""):
        target = first({"use"}, {"hold"}, {"none", "dropped"})
        if target is not None and state[target]["status"] != want:
            writes.append((target, want))
    else:
        return {"result": "rejected", "detail": "nothing to do for a series"}

    for i, word in writes:
        sheet.write_cells(cfg["tab"], state[i]["row"], cols["status"], [word])
    return {"result": "applied" if writes else "noop", "rows": [state[i]["row"] for i, _ in writes]}


def apply_sheet_request(req, sheet):
    problem = _validate(req)
    if problem:
        return {"result": "rejected", "detail": problem}
    cfg = BY_TAB[req["tab"]]
    values = sheet.read(cfg["tab"])
    if not values:
        return {"result": "row_missing", "detail": "tab is empty"}
    cols = columns(cfg, values[0])
    if cols["title"] < 0 or cols["status"] < 0:
        return {"result": "rejected", "detail": "title or status column not found"}
    if req.get("scope") == "series":
        return _apply_series(req, cfg, sheet, values, cols)
    return _apply_row(req, cfg, sheet, values, cols)


def apply_article_request(req, articles):
    rec = (req.get("match") or {}).get("id")
    change = req.get("set") or {}
    if not isinstance(rec, str) or set(change) != {"Read"} or not isinstance(change["Read"], bool):
        return {"result": "rejected", "detail": "only an article's Read box can be set"}
    return {"result": "applied" if articles.set_read(rec, change["Read"]) else "row_missing"}


def run(data_dir, sheet, articles, now):
    """Apply every pending request in order. Returns (results, tabs that changed)."""
    pending_dir = os.path.join(data_dir, "outbox", "pending")
    done_dir = os.path.join(data_dir, "outbox", "done")
    status_path = os.path.join(data_dir, "outbox", "status.json")
    os.makedirs(pending_dir, exist_ok=True)
    os.makedirs(done_dir, exist_ok=True)
    try:
        with open(status_path, encoding="utf-8") as f:
            status = json.load(f)
    except (OSError, ValueError):
        status = {"results": []}

    results, touched = [], set()
    for name in sorted(os.listdir(pending_dir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(pending_dir, name)
        try:
            with open(path, encoding="utf-8") as f:
                req = json.load(f)
        except (OSError, ValueError):
            req = None
        if not isinstance(req, dict):
            out = {"result": "rejected", "detail": "unreadable request"}
            req = {}
        elif req.get("target") == "sheet":
            out = apply_sheet_request(req, sheet)
            # After a conflict the snapshot is stale too, so refresh it and show what the sheet has.
            if out["result"] in ("applied", "conflict"):
                touched.add(req["tab"])
        elif req.get("target") == "airtable" and articles is not None:
            out = apply_article_request(req, articles)
        else:
            out = {"result": "rejected", "detail": "unknown target"}
        record = {"id": req.get("id") or name[:-5], "app": req.get("app"), "tab": req.get("tab"),
                  "title": (req.get("match") or {}).get("title"), "at": req.get("at"),
                  "appliedAt": now}
        record.update(out)
        results.append(record)
        with open(os.path.join(done_dir, now[:7] + ".jsonl"), "a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        os.remove(path)

    if results:
        status["results"] = (status.get("results", []) + results)[-KEEP_RESULTS:]
    status["at"] = now
    with open(status_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(status, f, ensure_ascii=False, separators=(",", ":"))
    return results, sorted(touched)
