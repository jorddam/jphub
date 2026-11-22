import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import steam  # noqa: E402
from lib.sheets import FixtureSheet  # noqa: E402


def seen(**hours):
    return [{"appid": a, "name": "Game " + a, "recent_h": r, "total_h": t} for a, (r, t) in hours.items()]


class Ledger(unittest.TestCase):
    def test_first_sighting_counts_its_two_week_hours(self):
        led = steam.update_ledger({}, seen(a=(14.4, 40.0), b=(0.3, 0.9)), "2026-11-21")
        self.assertEqual(led["h30"], {"a": 14.4, "b": 0.3})
        self.assertEqual(led["playing"], ["a"])

    def test_later_days_add_the_growth_in_total_hours(self):
        led = steam.update_ledger({}, seen(a=(0.5, 10.0)), "2026-11-01")
        led = steam.update_ledger(led, seen(a=(1.2, 10.7)), "2026-11-05")
        self.assertEqual(led["h30"]["a"], 1.2)
        self.assertEqual(led["games"]["a"]["last_played"], "2026-11-05")
        self.assertEqual(led["playing"], ["a"])

    def test_a_game_gone_quiet_drops_off_after_three_weeks(self):
        led = steam.update_ledger({}, seen(a=(5.0, 50.0)), "2026-11-01")
        led = steam.update_ledger(led, seen(a=(0.0, 50.0)), "2026-11-25")
        self.assertEqual(led["h30"]["a"], 5.0)
        self.assertEqual(led["playing"], [])

    def test_old_play_ages_out_of_the_thirty_day_window(self):
        led = steam.update_ledger({}, seen(a=(5.0, 50.0)), "2026-09-01")
        led = steam.update_ledger(led, seen(a=(0.2, 50.2)), "2026-11-20")
        self.assertEqual(led["h30"].get("a", 0), 0)
        self.assertNotIn("2026-09-01", led["days"])

    def test_profile_page_parsing(self):
        xml = ("<mostPlayedGame><gameName><![CDATA[Dead Cells]]></gameName>"
               "<gameLink><![CDATA[https://steamcommunity.com/app/588650]]></gameLink>"
               "<hoursPlayed>14.9</hoursPlayed><hoursOnRecord>1,040</hoursOnRecord></mostPlayedGame>")
        orig = steam._get
        steam._get = lambda url: xml
        try:
            self.assertEqual(steam.fetch_profile_xml("1"), [
                {"appid": "588650", "name": "Dead Cells", "recent_h": 14.9, "total_h": 1040.0}])
        finally:
            steam._get = orig


class SheetUpdate(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.dir, "_sheet"))
        with open(os.path.join(self.dir, "_sheet", "Games (PC).json"), "w", encoding="utf-8") as f:
            json.dump({"tab": "Games (PC)", "values": [
                ["jp_tier", "game", "id", "hours", "last_played", "status"],
                ["S", "Fata Morgana", "303310", "", "", ""],
                ["", "Dead Cells", "588650", "30", "", "Finished"],
                ["", "Untouched", "111", "", "", ""]]}, f)
        self.sheet = FixtureSheet(os.path.join(self.dir, "_sheet"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_fills_playtime_and_starts_only_untouched_games(self):
        out = steam.run(self.dir, "2026-11-22T08:52:00Z", sheet=self.sheet, seen=[
            {"appid": "303310", "name": "Fata Morgana", "recent_h": 2.5, "total_h": 2.5},
            {"appid": "588650", "name": "Dead Cells", "recent_h": 14.9, "total_h": 40.5}])
        rows = self.sheet.read("Games (PC)")
        self.assertEqual(rows[1][3:], ["2.5", "2026-11-22", "In progress"])
        self.assertEqual(rows[2][3:], ["40.5", "2026-11-22", "Finished"])
        self.assertEqual(rows[3][3:], ["", "", ""])
        self.assertEqual(out["playing"], ["Dead Cells", "Fata Morgana"])


if __name__ == "__main__":
    unittest.main()
