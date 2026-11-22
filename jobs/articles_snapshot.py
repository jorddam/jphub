"""Copy the Airtable Reading Feed (the daily five) into snapshots/articles/<YYYY-MM>.json."""
import datetime
import json
import os


def run(data_dir, feed, now, months_back=1):
    today = datetime.date.fromisoformat(now[:10])
    first = (today.replace(day=1) - datetime.timedelta(days=28 * months_back)).replace(day=1)
    by_month = {}
    for rec in feed.list_since(first.isoformat()):
        added = rec.get("added") or ""
        if added[:7]:
            by_month.setdefault(added[:7], []).append(rec)
    out_dir = os.path.join(data_dir, "snapshots", "articles")
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for month, records in sorted(by_month.items()):
        records.sort(key=lambda r: r.get("added") or "", reverse=True)
        path = os.path.join(out_dir, month + ".json")
        try:
            with open(path, encoding="utf-8") as f:
                old = json.load(f).get("records")
        except (OSError, ValueError):
            old = None
        if old != records:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                json.dump({"month": month, "at": now, "records": records}, f, ensure_ascii=False, separators=(",", ":"))
            written.append(month)
    return written
