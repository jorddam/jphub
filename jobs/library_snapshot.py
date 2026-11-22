"""Copy every library tab into snapshots/library/ for the hub to read."""
import json
import os

from lib.library import TABS, snapshot_tab


def _load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def run(data_dir, sheet, now, only_tabs=None):
    """Snapshot the tabs (all, or only_tabs). A tab file is rewritten only when its rows changed."""
    out_dir = os.path.join(data_dir, "snapshots", "library")
    index_path = os.path.join(out_dir, "index.json")
    index = _load(index_path) or {"tabs": []}
    known = {t["slug"]: t for t in index.get("tabs", [])}
    changed = []
    for cfg in TABS:
        if only_tabs and cfg["tab"] not in only_tabs:
            continue
        values = sheet.read(cfg["tab"])
        if not values:
            continue
        snap = snapshot_tab(cfg, values, now)
        path = os.path.join(out_dir, cfg["slug"] + ".json")
        old = _load(path)
        if not old or old.get("rows") != snap["rows"] or old.get("statusCol") != snap["statusCol"]:
            _dump(path, snap)
            changed.append(cfg["tab"])
        else:
            snap["at"] = old.get("at", now)
        known[cfg["slug"]] = {"tab": cfg["tab"], "slug": cfg["slug"], "kind": cfg["kind"],
                              "series": snap["series"], "count": snap["count"],
                              "hasStatus": snap["statusCol"] is not None, "changedAt": snap["at"]}
    order = [c["slug"] for c in TABS]
    index = {"at": now, "tabs": [known[s] for s in order if s in known]}
    _dump(index_path, index)
    return changed
