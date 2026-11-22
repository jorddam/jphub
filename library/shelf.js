// 本 as a reading room: a nightstand of covers and shelves of spines.
// The look and the rules (spine width by length, colour by genre family) come from 次の一冊.

import { h } from "../lib/core.js";
import * as covers from "../lib/covers.js";

const FAMILIES = [
  ["horror", "ホラー", "Horror"], ["mystery", "ミステリ", "Mystery & crime"], ["sf", "SF", "Sci-fi"], ["literary", "文芸", "Literary"],
  ["fantasy", "ファンタジー", "Fantasy & LN"], ["nonfic", "ノンフィクション", "Nonfiction"], ["classic", "古典", "Classics"], ["other", "その他", "Other"],
];
const FAM_IDX = Object.fromEntries(FAMILIES.map((f, i) => [f[0], i]));
const LENGTH_W = { "drop-in": 11, "one evening": 13, "a weekend": 16, "a few weeks": 19, "long haul": 25 };
const CASES = [["Ebooks", "電子書籍"], ["Bunko", "文庫"], ["Novels", "単行本"], ["Nonfiction & Essays", "ノンフィクション"]];

export function family(w) {
  const test = s => {
    s = (s || "").toLowerCase();
    if (/nonfiction|essay|popular[ -]science|memoir|criticism|philosophy|sociology|history|science\b/.test(s) && !/science fiction/.test(s)) return "nonfic";
    if (/\bclassic/.test(s)) return "classic";
    if (/horror|イヤミス/.test(s)) return "horror";
    if (/\bsf\b|science fiction|space opera|dystopi/.test(s)) return "sf";
    if (/myster|crime|thriller|suspense|noir|caper|spy/.test(s)) return "mystery";
    if (/light novel|fantasy|isekai/.test(s)) return "fantasy";
    if (/literary|short stor|drama|romance|coming of age|\bya\b|fiction|stories|fable/.test(s)) return "literary";
    return null;
  };
  return test(w.genre) || test(w.tags) || (w.tab === "Nonfiction & Essays" ? "nonfic" : "other");
}
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
const levelOf = w => { const m = /N(\d(?:\.\d)?)/.exec(w.level || ""); return m ? parseFloat(m[1]) : 9; };

// A cover: the picture when there is one, the title set vertically on genre colour when there isn't.
export function coverEl(w) {
  const text = h("div", { class: "cov cov-t c-" + family(w), "aria-hidden": "true" }, h("span", { text: w.title }));
  covers.show(text, w, url => {
    const img = h("img", { class: "cov c-" + family(w), src: url, alt: "" });
    img.addEventListener("error", () => img.replaceWith(text));
    text.replaceWith(img);
  });
  return text;
}

function spine(w, { onOpen, dim, selected }) {
  const width = LENGTH_W[(w.length || "").toLowerCase()] || 15;
  const height = 90 + (hash(w.key) % 28) + (width >= 22 ? 6 : 0);
  return h("button", { type: "button", "data-id": w.id, title: [w.title, w.en, w.level].filter(Boolean).join(" · "),
    class: `spine c-${family(w)}${dim ? " out" : ""}${w.cls === "done" ? " done" : ""}${w.pendingId ? " pending" : ""}${selected === w.id ? " sel" : ""}`,
    style: { "--w": width + "px", "--h": height + "px" }, "aria-label": [w.title, w.en, w.level].filter(Boolean).join(", "),
    onclick: () => onOpen(w.id) }, h("span", { class: "sp-body" }, h("span", { class: "sp-title", text: w.title })));
}
function divider(fam) {
  const [, ja, en] = FAMILIES[FAM_IDX[fam]];
  return h("div", { class: "divider c-" + fam, role: "separator", "aria-label": en }, h("span", { class: "dv-body" }, h("b", { text: ja }), h("i", { text: en })));
}

function nightstand(reading, hold, onOpen) {
  const tile = w => h("button", { class: "ns-tile", type: "button", onclick: () => onOpen(w.id) }, coverEl(w),
    h("span", { class: "t", text: w.title }), w.level ? h("span", { class: "lvl2", text: w.level }) : null);
  return h("section", { class: "nightstand" },
    h("div", { class: "ns-head" }, h("h2", {}, "読書中", h("span", { text: "Reading now" })),
      h("span", { class: "ns-count", text: `${reading.length}冊を読書中${hold.length ? ` · ${hold.length}冊は一休み` : ""}` })),
    reading.length + hold.length
      ? h("div", { class: "ns-strip" }, reading.map(tile), hold.length ? h("span", { class: "ns-sep", text: "一休み" }) : null, hold.map(tile))
      : h("p", { class: "ns-empty", text: "いま読んでいる本はありません。棚から一冊どうぞ。" }));
}

// root: where to draw. works: every book. opts: { onOpen, query, sort, onSort, selected }
export function renderBookroom(root, works, opts) {
  const q = (opts.query || "").toLowerCase();
  const hit = w => !q || [w.title, w.en, w.creator].some(s => (s || "").toLowerCase().includes(q));
  const reading = works.filter(w => w.cls === "use"), hold = works.filter(w => w.cls === "hold");
  const order = (a, b) => {
    const fa = FAM_IDX[family(a)], fb = FAM_IDX[family(b)];
    if (opts.sort === "genre" && fa !== fb) return fa - fb;
    return levelOf(a) - levelOf(b) || fa - fb || a.row - b.row;
  };
  const room = h("div", { class: "bookroom" }, nightstand(reading, hold, opts.onOpen));

  for (const [tab, ja] of CASES) {
    const onShelf = works.filter(w => w.tab === tab && w.cls !== "use" && w.cls !== "hold").sort(order);
    if (!onShelf.length) continue;
    const shelf = h("div", { class: "shelf" });
    let fam = null;
    for (const w of onShelf) {
      if (opts.sort === "genre" && family(w) !== fam) { fam = family(w); shelf.append(divider(fam)); }
      shelf.append(spine(w, { onOpen: opts.onOpen, dim: !hit(w), selected: opts.selected }));
    }
    const used = [...new Set(onShelf.map(family))].sort((a, b) => FAM_IDX[a] - FAM_IDX[b]);
    room.append(h("section", { class: "case" },
      h("div", { class: "case-head" }, h("h2", { text: ja }),
        h("span", { class: "n" }, "棚に ", h("b", { text: String(onShelf.length) }), " 冊", q ? ` · ${onShelf.filter(hit).length}冊が一致` : "")),
      shelf,
      h("div", { class: "shelf-foot" },
        h("div", { class: "legend" }, used.map(f => h("span", { class: "c-" + f }, h("i"), FAMILIES[FAM_IDX[f]][1]))),
        h("div", { class: "sortbar" }, "並び",
          h("button", { type: "button", "aria-pressed": String(opts.sort === "genre"), text: "ジャンル", onclick: () => opts.onSort("genre") }),
          h("button", { type: "button", "aria-pressed": String(opts.sort !== "genre"), text: "レベル", onclick: () => opts.onSort("level") })))));
  }
  root.replaceChildren(room);
}
