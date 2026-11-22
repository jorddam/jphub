"""Entry point for the hub's background jobs.

  python jobs/run.py snapshot --data <data repo folder>
  python jobs/run.py outbox   --data <data repo folder>
  python jobs/run.py steam    --data <data repo folder>

With --fixture the jobs use the JSON stand-in sheet in <data>/_sheet instead of
Google, so the whole loop can run on a PC with no credentials.
In a GitHub Action the credentials come from the environment:
  GOOGLE_SA_JSON, SHEET_ID, AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLE
"""
import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import library_snapshot  # noqa: E402
import outbox_apply  # noqa: E402
from lib.articles import AirtableArticles, FixtureArticles  # noqa: E402
from lib.sheets import FixtureSheet, GoogleSheet  # noqa: E402


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def adapters(args):
    if args.fixture:
        return FixtureSheet(os.path.join(args.data, "_sheet")), FixtureArticles(args.data)
    sheet = None
    if os.environ.get("GOOGLE_SA_JSON"):
        from lib.google_auth import access_token
        sheet = GoogleSheet(os.environ["SHEET_ID"], access_token(os.environ["GOOGLE_SA_JSON"]))
    elif os.environ.get("GOOGLE_ACCESS_TOKEN"):
        sheet = GoogleSheet(os.environ["SHEET_ID"], os.environ["GOOGLE_ACCESS_TOKEN"])
    elif args.job in ("snapshot", "outbox"):
        raise SystemExit("GOOGLE_SA_JSON and SHEET_ID are required for this job")
    articles = None
    if os.environ.get("AIRTABLE_TOKEN"):
        articles = AirtableArticles(os.environ["AIRTABLE_TOKEN"], os.environ["AIRTABLE_BASE"],
                                    os.environ["AIRTABLE_TABLE"])
    return sheet, articles


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("job", choices=["snapshot", "outbox", "steam", "articles", "covers"])
    p.add_argument("--data", required=True)
    p.add_argument("--fixture", action="store_true")
    p.add_argument("--limit", type=int, default=int(os.environ.get("COVERS_LIMIT") or 40))
    args = p.parse_args(argv)
    now = now_iso()

    if args.job == "covers":      # needs no credentials: it reads the snapshots and public pages
        import covers
        print(json.dumps(covers.run(args.data, now, limit=args.limit), ensure_ascii=False))
        return 0

    sheet, articles = adapters(args)
    if args.job == "steam":
        import steam
        out = steam.run(args.data, now, sheet=sheet)
        if out["sheetCells"]:
            library_snapshot.run(args.data, sheet, now, only_tabs=["Games (PC)"])
        print(json.dumps(out, ensure_ascii=False))
    elif args.job == "articles":
        import articles_snapshot
        if isinstance(articles, FixtureArticles) or articles is None:
            print(json.dumps({"skipped": "needs AIRTABLE_TOKEN"}))
        else:
            print(json.dumps({"months": articles_snapshot.run(args.data, articles, now)}))
    elif args.job == "snapshot":
        changed = library_snapshot.run(args.data, sheet, now)
        print(json.dumps({"changed": changed}, ensure_ascii=False))
    else:
        results, touched = outbox_apply.run(args.data, sheet, articles, now)
        if touched:
            library_snapshot.run(args.data, sheet, now, only_tabs=touched)
        print(json.dumps({"results": results, "resnapshot": touched}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
