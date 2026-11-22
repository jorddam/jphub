"""Run from the jphub folder:  py -3.9 -m unittest discover -s jobs/tests -v"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import library_snapshot  # noqa: E402
import outbox_apply  # noqa: E402
from lib.articles import FixtureArticles  # noqa: E402
from lib.library import BY_TAB, col_letter, series_status, snapshot_tab, work_key  # noqa: E402
from lib.sheets import FixtureSheet  # noqa: E402

NOW = "2026-11-22T12:00:00Z"
MANGA_HEAD = ["Title (日本語)", "Reading", "English Title", "Vol.", "Author", "Status", "My Rating (1-5)"]
WEB_HEAD = ["Rank", "Title", "Author", "Status", "Site", "Genre", "Style", "Characters", "Pages", "Status"]


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.dir, "_sheet"))
        self.sheet = FixtureSheet(os.path.join(self.dir, "_sheet"))
        self.put("Ebooks", [["Title (日本語)", "English Title", "Author", "Status", "My Rating (1-5)"],
                           ["かがみの孤城", "Lonely Castle in the Mirror", "辻村深月", "", ""],
                           ["キッチン", "Kitchen", "吉本ばなな", "On hold", ""],
                           ["秘密", "Secret", "東野圭吾", "", ""],
                           ["秘密", "Secret (another edition)", "東野圭吾", "", ""]])
        self.put("Manga", [MANGA_HEAD,
                          ["MONSTER 完全版", "", "", "1", "浦沢直樹", "Finished", ""],
                          ["MONSTER 完全版", "", "", "2", "浦沢直樹", "In progress", ""],
                          ["MONSTER 完全版", "", "", "3", "浦沢直樹", "", ""],
                          ["よつばと!", "", "", "2", "あずまきよひこ", "", ""],
                          ["よつばと!", "", "", "1", "あずまきよひこ", "", ""],
                          ["よつばと!", "", "", "10", "あずまきよひこ", "", ""]])
        self.put("Online stories", [WEB_HEAD,
                                   ["1", "横浜駅SF", "柞刈湯葉", "", "カクヨム", "SF", "", "", "", "Complete"]])
        self.put("Wishlist", [["Title (日本語)", "English Title"], ["黒牢城", "Kokurojo"]])

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def put(self, tab, values):
        with open(os.path.join(self.dir, "_sheet", tab + ".json"), "w", encoding="utf-8") as f:
            json.dump({"tab": tab, "values": values}, f, ensure_ascii=False)

    def col(self, tab, header_index):
        return [r[header_index] if len(r) > header_index else "" for r in self.sheet.read(tab)[1:]]

    def apply(self, **req):
        req.setdefault("target", "sheet")
        return outbox_apply.apply_sheet_request(req, self.sheet)


class RowWrites(Base):
    def test_sets_status_when_cell_is_as_the_app_saw_it(self):
        out = self.apply(tab="Ebooks", match={"title": "かがみの孤城"}, rowHint=2,
                         set={"Status": "In progress"}, expect={"Status": ""})
        self.assertEqual(out["result"], "applied")
        self.assertEqual(self.col("Ebooks", 3)[0], "In progress")

    def test_leaves_a_cell_changed_elsewhere_and_reports_it(self):
        out = self.apply(tab="Ebooks", match={"title": "キッチン"}, rowHint=3,
                         set={"Status": "In progress"}, expect={"Status": ""})
        self.assertEqual(out["result"], "conflict")
        self.assertEqual(out["current"], "On hold")
        self.assertEqual(self.col("Ebooks", 3)[1], "On hold")

    def test_blank_and_not_started_count_as_the_same(self):
        out = self.apply(tab="Ebooks", match={"title": "かがみの孤城"},
                         set={"Status": "In progress"}, expect={"Status": "Not started"})
        self.assertEqual(out["result"], "applied")

    def test_finds_the_book_again_when_rows_have_shifted(self):
        out = self.apply(tab="Ebooks", match={"title": "キッチン"}, rowHint=2,
                         set={"Status": "Finished", "Rating": 4}, expect={"Status": "On hold"})
        self.assertEqual(out["result"], "applied")
        self.assertEqual(out["row"], 3)
        self.assertEqual(self.sheet.read("Ebooks")[2][3:5], ["Finished", 4])
        self.assertEqual(self.col("Ebooks", 3)[0], "")

    def test_same_value_is_a_noop(self):
        out = self.apply(tab="Ebooks", match={"title": "キッチン"}, set={"Status": "On hold"})
        self.assertEqual(out["result"], "noop")

    def test_two_rows_with_one_title_need_a_row_hint(self):
        out = self.apply(tab="Ebooks", match={"title": "秘密"}, set={"Status": "In progress"})
        self.assertEqual(out["result"], "ambiguous")
        out = self.apply(tab="Ebooks", match={"title": "秘密"}, rowHint=5, set={"Status": "In progress"})
        self.assertEqual(out["result"], "applied")
        self.assertEqual(self.col("Ebooks", 3)[2:], ["", "In progress"])

    def test_missing_title(self):
        out = self.apply(tab="Ebooks", match={"title": "存在しない本"}, set={"Status": "Finished"})
        self.assertEqual(out["result"], "row_missing")

    def test_writes_my_status_column_not_the_story_status(self):
        out = self.apply(tab="Online stories", match={"title": "横浜駅SF"}, set={"Status": "In progress"})
        self.assertEqual(out["result"], "applied")
        row = self.sheet.read("Online stories")[1]
        self.assertEqual((row[3], row[9]), ("In progress", "Complete"))


class Rejections(Base):
    def test_only_status_and_rating_can_change(self):
        for bad in ({"set": {"Author": "x"}}, {"set": {"Status": "Whatever"}}, {"set": {"Rating": 9}},
                    {"set": {}}, {"set": {"Status": "Finished"}, "op": "delete_everything"}):
            out = self.apply(tab="Ebooks", match={"title": "キッチン"}, **bad)
            self.assertEqual(out["result"], "rejected", bad)
        before = self.sheet.read("Ebooks")
        self.assertEqual(before[2][2], "吉本ばなな")

    def test_tabs_without_a_status_column_are_read_only(self):
        self.assertEqual(self.apply(tab="Wishlist", match={"title": "黒牢城"},
                                    set={"Status": "Finished"})["result"], "rejected")
        self.assertEqual(self.apply(tab="In Progress", match={"title": "x"},
                                    set={"Status": "Finished"})["result"], "rejected")

    def test_series_scope_only_on_series_tabs(self):
        out = self.apply(tab="Ebooks", scope="series", match={"title": "秘密"}, set={"Status": "Finished"})
        self.assertEqual(out["result"], "rejected")


class Series(Base):
    def statuses(self, title):
        return [r[5] for r in self.sheet.read("Manga")[1:] if r[0] == title]

    def test_next_volume_finishes_current_and_starts_the_next(self):
        out = self.apply(tab="Manga", scope="series", op="next_volume", match={"title": "MONSTER 完全版"},
                         expect={"Status": "In progress"})
        self.assertEqual(out["result"], "applied")
        self.assertEqual(self.statuses("MONSTER 完全版"), ["Finished", "Finished", "In progress"])

    def test_next_volume_on_the_last_volume_finishes_the_series(self):
        for _ in range(2):
            self.apply(tab="Manga", scope="series", op="next_volume", match={"title": "MONSTER 完全版"})
        self.assertEqual(self.statuses("MONSTER 完全版"), ["Finished"] * 3)
        vols = [{"status": s} for s in self.statuses("MONSTER 完全版")]
        self.assertEqual(series_status(vols), "Finished")

    def test_starting_a_series_marks_volume_one_by_number_not_row_order(self):
        out = self.apply(tab="Manga", scope="series", match={"title": "よつばと!"},
                         set={"Status": "In progress"}, expect={"Status": ""})
        self.assertEqual(out["result"], "applied")
        rows = [r for r in self.sheet.read("Manga")[1:] if r[0] == "よつばと!"]
        self.assertEqual({r[3]: r[5] for r in rows}, {"2": "", "1": "In progress", "10": ""})

    def test_hold_moves_the_current_volume_only(self):
        self.apply(tab="Manga", scope="series", match={"title": "MONSTER 完全版"}, set={"Status": "On hold"})
        self.assertEqual(self.statuses("MONSTER 完全版"), ["Finished", "On hold", ""])

    def test_finishing_a_series_finishes_every_volume(self):
        self.apply(tab="Manga", scope="series", match={"title": "よつばと!"}, set={"Status": "Finished"})
        self.assertEqual(self.statuses("よつばと!"), ["Finished"] * 3)

    def test_series_conflict_when_the_sheet_moved_on(self):
        out = self.apply(tab="Manga", scope="series", match={"title": "MONSTER 完全版"},
                         set={"Status": "Dropped"}, expect={"Status": ""})
        self.assertEqual((out["result"], out["current"]), ("conflict", "In progress"))
        self.assertEqual(self.statuses("MONSTER 完全版"), ["Finished", "In progress", ""])


class Snapshot(Base):
    def test_keys_columns_and_fields(self):
        snap = snapshot_tab(BY_TAB["Online stories"], self.sheet.read("Online stories"), NOW)
        self.assertEqual(snap["statusCol"], "D")
        row = snap["rows"][0]
        self.assertEqual((row["row"], row["title"], row["creator"], row["site"]), (2, "横浜駅SF", "柞刈湯葉", "カクヨム"))
        self.assertEqual(row["key"], work_key("Online stories", "横浜駅SF"))
        self.assertEqual(len(row["key"]), 10)
        self.assertEqual([col_letter(i) for i in (0, 19, 25, 26)], ["A", "T", "Z", "AA"])

    def test_volumes_of_a_series_share_one_key(self):
        snap = snapshot_tab(BY_TAB["Manga"], self.sheet.read("Manga"), NOW)
        keys = {r["key"] for r in snap["rows"] if r["title"] == "MONSTER 完全版"}
        self.assertEqual(len(keys), 1)
        self.assertTrue(snap["series"])


class WholeRun(Base):
    def test_pending_requests_are_applied_logged_and_removed(self):
        os.makedirs(os.path.join(self.dir, "outbox", "pending"))
        os.makedirs(os.path.join(self.dir, "snapshots", "articles"))
        with open(os.path.join(self.dir, "snapshots", "articles", "2026-11.json"), "w", encoding="utf-8") as f:
            json.dump({"records": [{"id": "recA", "read": False}]}, f)
        reqs = [
            {"id": "o1", "target": "sheet", "tab": "Ebooks", "match": {"title": "かがみの孤城"},
             "set": {"Status": "In progress"}, "expect": {"Status": ""}},
            {"id": "o2", "target": "airtable", "match": {"id": "recA"}, "set": {"Read": True}},
            {"id": "o3", "target": "shell", "run": "rm -rf /"},
        ]
        for i, r in enumerate(reqs):
            with open(os.path.join(self.dir, "outbox", "pending", "%d.json" % i), "w", encoding="utf-8") as f:
                json.dump(r, f, ensure_ascii=False)
        with open(os.path.join(self.dir, "outbox", "pending", "9.json"), "w", encoding="utf-8") as f:
            f.write("{not json")
        library_snapshot.run(self.dir, self.sheet, NOW)
        results, touched = outbox_apply.run(self.dir, self.sheet, FixtureArticles(self.dir), NOW)
        self.assertEqual([r["result"] for r in results], ["applied", "applied", "rejected", "rejected"])
        self.assertEqual(touched, ["Ebooks"])
        self.assertEqual(os.listdir(os.path.join(self.dir, "outbox", "pending")), [])
        with open(os.path.join(self.dir, "outbox", "status.json"), encoding="utf-8") as f:
            self.assertEqual([r["id"] for r in json.load(f)["results"]], ["o1", "o2", "o3", "9"])
        with open(os.path.join(self.dir, "snapshots", "articles", "2026-11.json"), encoding="utf-8") as f:
            self.assertTrue(json.load(f)["records"][0]["read"])
        library_snapshot.run(self.dir, self.sheet, "2026-11-22T12:05:00Z", only_tabs=touched)
        with open(os.path.join(self.dir, "snapshots", "library", "ebooks.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["rows"][0]["status"], "In progress")


class Articles(Base):
    def test_feed_is_split_by_month_and_rewritten_only_when_changed(self):
        import articles_snapshot

        class Feed:
            def list_since(self, iso):
                self.since = iso
                return [{"id": "a", "added": "2026-11-22T18:20:12.000Z", "read": False},
                        {"id": "b", "added": "2026-10-30T10:00:00.000Z", "read": True},
                        {"id": "c", "added": "2026-11-21T11:14:50.000Z", "read": False}]
        feed = Feed()
        self.assertEqual(articles_snapshot.run(self.dir, feed, NOW), ["2026-10", "2026-11"])
        self.assertEqual(feed.since, "2026-10-01")
        with open(os.path.join(self.dir, "snapshots", "articles", "2026-11.json"), encoding="utf-8") as f:
            self.assertEqual([r["id"] for r in json.load(f)["records"]], ["a", "c"])
        self.assertEqual(articles_snapshot.run(self.dir, feed, "2026-11-22T13:00:00Z"), [])


if __name__ == "__main__":
    unittest.main()
