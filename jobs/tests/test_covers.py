import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import covers  # noqa: E402

JPEG = bytes.fromhex(  # a valid 1x1 JPEG
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a"
    "1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f"
    "0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d010203"
    "00041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a343536373839"
    "3a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4"
    "a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa"
    "ffda0008010100003f00fbfcffd9")


def page(title, image="https://c.example/cover.jpg"):
    return '<meta property="og:title" content="%s"><meta property="og:image" content="%s">' % (title, image)


class FakeNet:
    def __init__(self, pages):
        self.pages, self.asked = pages, []

    def text(self, url):
        self.asked.append(url)
        for start, body in self.pages.items():
            if url.startswith(start):
                return body
        raise OSError("404 " + url)

    def get(self, url):
        self.asked.append(url)
        if url.endswith(".jpg"):
            return JPEG
        raise OSError("404 " + url)


class Matching(unittest.TestCase):
    def test_exact_title_beats_a_longer_one(self):
        hits = [("a", "黒い家　新装版"), ("b", "黒い家"), ("c", "クリムゾンの迷宮")]
        self.assertEqual(covers.pick(hits, covers.title_core("黒い家"), manga=False), "b")

    def test_full_width_and_brackets_are_ignored(self):
        self.assertEqual(covers.pick([("a", "ＧＯＴＨ　夜の章")], covers.title_core("GOTH 夜の章"), manga=False), "a")
        self.assertEqual(covers.title_core("リングシリーズ【4冊 合本版】"), "リングシリーズ")

    def test_manga_prefers_volume_one(self):
        hits = [("x", "MONSTER 完全版 デジタルVer. 別巻 なまえのないかいぶつ"), ("y", "MONSTER 完全版 デジタルVer.（１）")]
        self.assertEqual(covers.pick(hits, covers.title_core("MONSTER 完全版"), manga=True), "y")

    def test_a_book_does_not_take_the_comic_edition(self):
        hits = [("a", "容疑者Xの献身 (コミック)"), ("b", "容疑者Xの献身（文春文庫）")]
        self.assertEqual(covers.pick(hits, covers.title_core("容疑者Xの献身"), manga=False), "b")

    def test_nothing_with_the_title_means_no_match(self):
        self.assertIsNone(covers.pick([("a", "夢印 豪華版")], covers.title_core("MONSTER 完全版"), manga=True))


class Run(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        lib = os.path.join(self.dir, "snapshots", "library")
        os.makedirs(lib)
        snaps = {
            "ebooks": {"series": False, "rows": [
                {"key": "k-have", "title": "持っている本", "status": ""},
                {"key": "k-kuroi", "title": "黒い家", "creator": "貴志祐介", "status": ""},
                {"key": "k-reading", "title": "かがみの孤城", "creator": "辻村深月", "status": "In progress"},
                {"key": "k-none", "title": "どこにもない本", "creator": "誰か", "status": ""}]},
            "manga": {"series": True, "rows": [
                {"key": "k-mon", "title": "MONSTER 完全版", "vol": "2", "creator": "浦沢直樹", "status": "In progress"},
                {"key": "k-mon", "title": "MONSTER 完全版", "vol": "1", "creator": "浦沢直樹", "status": "Finished"}]},
            "games-pc": {"series": False, "rows": [{"key": "g1", "title": "Fata Morgana", "appid": "303310"},
                                                   {"key": "g2", "title": "Sprite Game", "appid": "42"}]},
            "bookwalker": {"series": True, "rows": [
                {"key": "k-bw", "title": "光が死んだ夏", "vol": "1", "link": "https://bookwalker.jp/de111/"}]},
        }
        for slug, snap in snaps.items():
            with open(os.path.join(lib, slug + ".json"), "w", encoding="utf-8") as f:
                json.dump(snap, f, ensure_ascii=False)
        os.makedirs(os.path.join(self.dir, "covers"))
        with open(os.path.join(self.dir, "covers", "index.json"), "w", encoding="utf-8") as f:
            json.dump({"items": {"k-have": "ebooks/k-have.jpg", "app:42": [0, 1, 2]}, "missing": {}}, f)
        self.net = FakeNet({
            "https://bookwalker.jp/search/?word=%E9%BB%92%E3%81%84%E5%AE%B6": "https://bookwalker.jp/deaaa/ https://bookwalker.jp/debbb/",
            "https://bookwalker.jp/search/?word=%E3%81%8B%E3%81%8C%E3%81%BF": "https://bookwalker.jp/deccc/",
            "https://bookwalker.jp/search/?word=MONSTER": "https://bookwalker.jp/deddd/",
            "https://bookwalker.jp/search/?word=%E3%81%A9%E3%81%93": "",
            "https://bookwalker.jp/deaaa/": page("黒い家　新装版"), "https://bookwalker.jp/debbb/": page("黒い家"),
            "https://bookwalker.jp/deccc/": page("かがみの孤城"), "https://bookwalker.jp/deddd/": page("MONSTER 完全版 デジタルVer.（１）"),
            "https://bookwalker.jp/de111/": page("光が死んだ夏（１）"),
        })

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def index(self):
        with open(os.path.join(self.dir, "covers", "index.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_fetches_what_is_missing_and_records_what_it_could_not_find(self):
        out = covers.run(self.dir, "2026-11-22T12:00:00Z", limit=20, net=self.net)
        idx = self.index()
        self.assertEqual(out["added"], 5)
        self.assertEqual(out["missed"], ["どこにもない本"])
        self.assertEqual(idx["items"]["k-kuroi"], "ebooks/k-kuroi.jpg")
        self.assertEqual(idx["items"]["k-mon"], "manga/k-mon.jpg")
        self.assertEqual(idx["items"]["k-bw"], "bookwalker/k-bw.jpg")
        self.assertEqual(idx["items"]["app:303310"], "games/303310.jpg")
        self.assertEqual(idx["items"]["app:42"], [0, 1, 2])
        self.assertTrue(os.path.getsize(os.path.join(self.dir, "covers", "ebooks", "k-kuroi.jpg")) > 100)
        self.assertEqual(idx["missing"]["k-none"]["n"], 1)
        self.assertFalse(any("k-have" in u or "/42/" in u for u in self.net.asked))

    def test_items_in_use_go_first_and_the_limit_holds(self):
        out = covers.run(self.dir, "2026-11-22T12:00:00Z", limit=2, net=self.net)
        self.assertEqual(sorted(self.index()["items"]), ["app:42", "k-have", "k-mon", "k-reading"])
        self.assertEqual(out["left"], 4)

    def test_a_miss_waits_two_weeks_then_stops_after_three_tries(self):
        covers.run(self.dir, "2026-11-22T12:00:00Z", limit=20, net=self.net)
        self.net.asked.clear()
        covers.run(self.dir, "2026-11-25T12:00:00Z", limit=20, net=self.net)
        self.assertEqual(self.net.asked, [])
        covers.run(self.dir, "2026-12-07T12:00:00Z", limit=20, net=self.net)
        covers.run(self.dir, "2026-12-22T12:00:00Z", limit=20, net=self.net)
        self.assertEqual(self.index()["missing"]["k-none"]["n"], 3)
        self.net.asked.clear()
        covers.run(self.dir, "2027-02-01T12:00:00Z", limit=20, net=self.net)
        self.assertEqual(self.net.asked, [])


if __name__ == "__main__":
    unittest.main()
