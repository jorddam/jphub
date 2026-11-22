"""Fetch cover art for library items that have none.

Runs after the sheet snapshot. For each work without a cover it tries one
source, chosen by the kind of item:

  PC games            Steam, by app id
  BookWalker manga    the item's own BookWalker link
  books, print manga  a BookWalker search for "title author"
  video, podcasts     the channel page's image

A cover is saved as covers/<tab>/<key>.jpg (at most 300 px wide) and recorded
in covers/index.json. A work that can't be matched is noted under "missing"
and retried a couple of times, two weeks apart. Web novels and PS3 games have
no good source and keep their text covers.
"""
import datetime
import html
import io
import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

from lib.library import status_class, vol_sort_key

UA = "Mozilla/5.0 (personal library cover fetcher)"
STEAM = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps"
SEARCH_TABS = {"ebooks", "novels", "bunko", "nonfiction", "manga"}
LINK_TABS = {"bookwalker", "video", "podcasts"}
ORDER = ["ebooks", "manga", "bookwalker", "novels", "bunko", "nonfiction", "games-pc", "video", "podcasts"]
MAX_WIDTH = 300
RETRY_DAYS = 14
MAX_TRIES = 3


class Net:
    """The network, kept in one place so tests can swap it out."""
    pause = 0.6

    def get(self, url):
        time.sleep(self.pause)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"})
        with urllib.request.urlopen(req, timeout=25) as res:
            return res.read()

    def text(self, url):
        return self.get(url).decode("utf-8", "ignore")


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    return re.sub(r"[\s・:：、。,.\-‐―—~〜!?()\[\]{}「」『』【】《》〈〉<>#/]", "", s)


def title_core(title):
    """The title without edition notes in brackets: 'リングシリーズ【4冊 合本版】' -> 'リングシリーズ'."""
    return norm(re.sub(r"【.*?】|（.*?）|\(.*?\)", "", title)) or norm(title)


def og(page, prop):
    m = re.search(r'<meta property="og:%s" content="([^"]+)"' % prop, page)
    return html.unescape(m.group(1)) if m else None


def pick(hits, core, manga):
    """Choose among (link, page title) search hits. Returns a link or None.

    The page title must contain the work's title. An exact match wins; for manga,
    volume 1 wins. A book never takes a コミック edition of the same story.
    """
    best = None
    for order, (link, title) in enumerate(hits):
        t = norm(title)
        if core not in t:
            continue
        if not manga and "コミック" in t and "コミック" not in core:
            continue
        rest = t[t.index(core) + len(core):] if t.startswith(core) else None
        if rest == "" or (manga and rest is not None and re.fullmatch(r"(デジタルver)?1", rest)):
            rank = 0
        elif rest is not None:
            rank = 1
        else:
            rank = 2
        if best is None or (rank, order) < best[0]:
            best = ((rank, order), link)
    return best[1] if best else None


def find_image(net, slug, work):
    """Returns (image bytes, where it came from). Raises LookupError when nothing fits."""
    if slug == "games-pc":
        if not work.get("appid"):
            raise LookupError("no Steam id")
        for name in ("library_600x900.jpg", "header.jpg"):
            url = "%s/%s/%s" % (STEAM, work["appid"], name)
            try:
                return net.get(url), url
            except Exception:
                continue
        try:    # newer games keep their art under hashed paths; the store API knows where
            info = json.loads(net.text("https://store.steampowered.com/api/appdetails?filters=basic&appids=%s"
                                       % work["appid"]))[str(work["appid"])]
            url = info["data"]["header_image"]
            return net.get(url), url
        except Exception:
            raise LookupError("no Steam art")
    if slug in LINK_TABS:
        link = work.get("link")
        if not link:
            raise LookupError("no link")
        image = og(net.text(link), "image")
        if not image:
            raise LookupError("page has no image")
        return net.get(image), image
    if slug in SEARCH_TABS:
        query = " ".join(x for x in (work["title"], (work.get("creator") or "").split(",")[0].split("(")[0].strip()) if x)
        page = net.text("https://bookwalker.jp/search/?" + urllib.parse.urlencode({"word": query}))
        links = list(dict.fromkeys(re.findall(r"https://bookwalker\.jp/de[0-9a-f-]+/", page)))[:6]
        if not links:
            raise LookupError("search found nothing")
        pages = {link: net.text(link) for link in links}
        link = pick([(l, og(p, "title") or "") for l, p in pages.items()], title_core(work["title"]), slug == "manga")
        if not link:
            raise LookupError("no result with this title")
        image = og(pages[link], "image")
        if not image:
            raise LookupError("page has no image")
        return net.get(image), link
    raise LookupError("no source for this kind of item")


def save_jpeg(data, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        with open(path, "wb") as f:      # without Pillow, keep the image as fetched
            f.write(data)
        return
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if im.width > MAX_WIDTH:
        im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
    im.save(path, "JPEG", quality=80, optimize=True, progressive=True)


def cover_key(slug, work):
    return "app:%s" % work["appid"] if slug == "games-pc" and work.get("appid") else work["key"]


def works_of(snapshot):
    """One entry per work. A series is represented by its first volume."""
    if not snapshot.get("series"):
        return list(snapshot["rows"])
    groups = {}
    for i, row in enumerate(snapshot["rows"]):
        groups.setdefault(row["key"], []).append((vol_sort_key(row.get("vol"), i), row))
    out = []
    for vols in groups.values():
        vols.sort(key=lambda v: v[0])
        work = dict(vols[0][1])
        if any(status_class(r.get("status")) == "use" for _, r in vols):
            work["status"] = "In progress"
        out.append(work)
    return out


def candidates(data_dir, index, today):
    """Works that still need a cover, the ones in use first."""
    items, missing = index.get("items", {}), index.get("missing", {})
    out = []
    for slug in ORDER:
        try:
            with open(os.path.join(data_dir, "snapshots", "library", slug + ".json"), encoding="utf-8") as f:
                snap = json.load(f)
        except (OSError, ValueError):
            continue
        for work in works_of(snap):
            key = cover_key(slug, work)
            if key in items:
                continue
            miss = missing.get(key)
            if miss and (miss.get("n", 0) >= MAX_TRIES or
                         (today - datetime.date.fromisoformat(miss["at"])).days < RETRY_DAYS):
                continue
            out.append((0 if status_class(work.get("status")) == "use" else 1, len(out), slug, key, work))
    out.sort(key=lambda c: c[:2])
    return [(slug, key, work) for _, _, slug, key, work in out]


def run(data_dir, now, limit=40, net=None):
    net = net or Net()
    path = os.path.join(data_dir, "covers", "index.json")
    try:
        with open(path, encoding="utf-8") as f:
            index = json.load(f)
    except (OSError, ValueError):
        index = {}
    items, missing = index.setdefault("items", {}), index.setdefault("missing", {})
    todo = candidates(data_dir, index, datetime.date.fromisoformat(now[:10]))
    added, missed = [], []

    def flush():
        index["at"] = now
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(index, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    for n, (slug, key, work) in enumerate(todo[:limit], start=1):
        if n % 10 == 0:
            flush()     # a long run that gets cut off keeps what it has found
        name = (key.split(":")[1] if key.startswith("app:") else key) + ".jpg"
        folder = "games" if slug == "games-pc" else slug
        try:
            data, origin = find_image(net, slug, work)
            save_jpeg(data, os.path.join(data_dir, "covers", folder, name))
            items[key] = "%s/%s" % (folder, name)
            missing.pop(key, None)
            added.append(work["title"])
        except Exception as e:      # one bad item must not stop the run
            prev = missing.get(key, {})
            missing[key] = {"n": prev.get("n", 0) + 1, "at": now[:10], "title": work["title"],
                            "why": str(e)[:80] or type(e).__name__}
            missed.append(work["title"])
    if added or missed:
        flush()
    return {"added": len(added), "missed": missed, "left": max(0, len(todo) - limit)}
