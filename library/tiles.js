// Manga, games, web novels, audio, video and the wishlist as covers on a table:
// what's in use laid out first, then everything else in a grid.

import { h } from "../lib/core.js";
import { statusLabel } from "../lib/library.js";
import { coverEl } from "./shelf.js";

const SQUARE = new Set(["audio", "video"]);   // channel art is square
const join = (...p) => p.filter(Boolean).join(" · ");
const pctOf = s => { const m = /^(\d+)%$/.exec(s || ""); return m ? +m[1] : null; };

function line(w, steam) {
  if (w.series) return w.volsTotal > 1 ? `${w.cls === "use" ? w.vol + "巻 · " : ""}全${w.volsTotal}巻` : (w.vol ? w.vol + "巻" : "");
  if (w.appid) return join(w.tier ? "Tier " + w.tier : null, steam.h30[w.appid] ? `30日で${steam.h30[w.appid]}時間` : null);
  return join(w.level, w.site, w.rating ? "★" + w.rating : null);
}

function tile(w, { onOpen, steam }) {
  const badge = w.conflict ? "シートと違います" : w.failed ? "反映できません" : w.pendingId ? "同期中"
    : w.cls === "none" ? null : statusLabel(w.cls, w.type);
  const done = w.series && w.volsTotal > 1 ? w.volsDone / w.volsTotal * 100 : pctOf(w.progress);
  const sub = line(w, steam);
  return h("button", { class: `tile ${w.cls}${SQUARE.has(w.type?.id) ? " sq" : ""}`, type: "button", "data-id": w.id,
    title: [w.title, w.en].filter(Boolean).join(" · "), onclick: () => onOpen(w.id) },
    h("span", { class: "art" }, coverEl(w),
      badge ? h("span", { class: "badge" + (w.pendingId ? " wait" : ""), text: badge }) : null,
      done != null && done > 0 ? h("span", { class: "prog" }, h("i", { style: { width: Math.round(done) + "%" } })) : null),
    h("span", { class: "t", text: w.title }),
    sub ? h("span", { class: "s", text: sub }) : null);
}

// root: where to draw. works: already filtered to one type and sorted. opts: { onOpen, steam, limit, onMore, type }
export function renderTiles(root, works, opts) {
  const using = works.filter(w => w.cls === "use"), rest = works.filter(w => w.cls !== "use");
  const shown = rest.slice(0, opts.limit);
  const room = h("div", { class: "bookroom tableroom" });
  if (using.length) room.append(h("section", { class: "nightstand" },
    h("div", { class: "ns-head" }, h("h2", {}, statusLabel("use", opts.type), h("span", { text: "Now" })),
      h("span", { class: "ns-count", text: `${using.length}件` })),
    h("div", { class: "tiles now" }, using.map(w => tile(w, opts)))));
  room.append(h("section", { class: "case" },
    h("div", { class: "case-head" }, h("h2", { text: opts.type?.ja || "" }),
      h("span", { class: "n" }, h("b", { text: String(rest.length) }), " 件")),
    rest.length ? h("div", { class: "tiles" }, shown.map(w => tile(w, opts)))
      : h("p", { class: "ns-empty", text: using.length ? "ほかにはありません。" : "該当するものはありません。" }),
    rest.length > shown.length ? h("div", { class: "btnrow" },
      h("button", { class: "btn", type: "button", text: `さらに表示（残り${rest.length - shown.length}件）`, onclick: opts.onMore })) : null));
  root.replaceChildren(room);
}
