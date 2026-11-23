// ゲーム: the filters that help choose the next game, carried over from 次の一本.
// Each PC game takes its details (JLPT level, text volume, reading pace, OCR fit, vibe, Deck status)
// from static/games/meta.json. A game without details (PS3, a few PC rows) shows only while
// no filter that needs them is on.

import { h, local, setLocal } from "../lib/core.js";

const KEY = "jphub.gameFilters";
const OPTS = { core: false, jp: false, hideAlt: false, voice: false, hideDone: false, lo: 0, hi: 5, sort: "value" };
const saved = local(KEY, {});
export const f = { sel: saved.sel || {}, opt: { ...OPTS, ...saved.opt },
  open: saved.open ?? matchMedia("(min-width: 720px)").matches };
const save = () => setLocal(KEY, f);

// ---------- words ----------
const GENRE = { Shooter: "シューター", Puzzle: "パズル", Horror: "ホラー", "Story adventure": "アドベンチャー", RPG: "RPG",
  Strategy: "ストラテジー", Platformer: "プラットフォーマー", "Survival & sandbox": "サバイバル", Action: "アクション",
  Stealth: "ステルス", "Visual novel": "ノベルゲーム", "Racing & driving": "レース", "Builder & management": "経営・建設",
  "Roguelike & cards": "ローグライク・カード", Simulation: "シミュレーション", Other: "その他", "Casual & arcade": "カジュアル",
  "Rhythm & music": "音楽・リズム", Sports: "スポーツ", Fighting: "格闘", Soulslike: "ソウルライク", "Software & tools": "ツール" };
const OCR = { good: "OCRに向いている", press: "ボタンで送る会話", docs: "メモや資料が多い", legible: "文字が読みやすい", small: "文字が小さめ" };
const PACE = { wait: "自分のペースで読める", mix: "混在", flow: "字幕が流れていく" };
const CAST = { adult: "大人が中心", school: "学園もの" };
const SOURCE = { jpdb: "実測（jpdb）", est: "推定", rough: "おおまか" };
const TEXT = ["文字なし", "UIのみ", "少なめ", "ふつう", "多い", "とても多い"];
const FLAVOUR = { lit: "文学的", coll: "くだけた口語", dial: "方言", tech: "科学・技術", fant: "ファンタジー・古風", hist: "時代劇調",
  mil: "軍事・政治", crime: "犯罪・法律", kana: "かな多め", anime: "アニメ調", folk: "民俗・オカルト", net: "ネットスラング",
  docs: "文書・メモ", listen: "聞き取り中心", furi: "ふりがな", phil: "哲学的", comedy: "言葉遊び" };
const VIBE = { Spooky: "不気味", Mystery: "ミステリー", Dark: "ダーク", Cozy: "ほのぼの", Funny: "笑える", Emotional: "泣ける",
  Surreal: "シュール", Cinematic: "映画的", Thriller: "スリラー", Cerebral: "頭を使う" };
const SETTING = { "Japan-set": "日本が舞台", "Sci-fi": "SF", Cyberpunk: "サイバーパンク", Fantasy: "ファンタジー", Historical: "歴史",
  "Post-apocalyptic": "終末世界", Military: "ミリタリー", "Crime world": "裏社会" };
const PLAYS = { "Co-op": "協力プレイ", "Online only": "オンライン専用", "VR only": "VR専用", "VR optional": "VR対応",
  "Turn-based": "ターン制", "Open world": "オープンワールド", "Choices matter": "選択で変わる", "Female lead": "女性主人公" };
const LENGTH = { S: "短め", M: "中くらい", L: "長編", E: "気軽に遊べる" };
const ENERGY = { 1: "のんびり", 2: "ほどほど", 3: "激しい" };
const DECK = { verified: "確認済み", playable: "プレイ可能", unsupported: "非対応", unknown: "不明" };
const ORIGIN = { native: "日本語オリジナル", "native?": "おそらく日本語オリジナル", loc: "日本語ローカライズ", dub: "日本語吹き替え（翻訳台本）",
  mixed: "混在", "?": "不明", learner: "学習ツール", none: "日本語なし" };
const TOGGLES = [["core", "文章をしっかり読める作品だけ"], ["jp", "日本語で遊べる作品だけ"], ["voice", "日本語音声あり"],
  ["hideAlt", "重複・ベータ版・ツールを隠す"], ["hideDone", "クリア済み・やめた作品を隠す"]];
export const SORTS = { value: "学習価値", recent: "最近プレイした", ocr: "OCRに向いている", easy: "やさしい順", hard: "むずかしい順",
  text: "日本語が多い", rating: "Steam評価", hours: "よく遊んだ", fresh: "あまり遊んでいない", newest: "新しい順", oldest: "古い順",
  az: "タイトル順", shuffle: "シャッフル" };

const pairs = o => Object.entries(o);
const played = w => w.hrs === 0 ? "0" : w.hrs < 2 ? "1" : "2";
const FACETS = [
  { k: "t", ja: "学習ティア", o: ["S", "A", "B", "C", "D"].map(x => [x, x]), get: w => w.tier || null },
  { k: "oc", ja: "OCR（Steam Deck）", o: pairs(OCR), get: w => w.g?.of, multi: true },
  { k: "pc", ja: "読むペース", o: pairs(PACE), get: w => w.g?.pc },
  { k: "ca", ja: "登場人物", o: pairs(CAST), get: w => w.g?.ca },
  { k: "lr", ja: "レベルの根拠", o: pairs(SOURCE), get: w => w.g?.lr },
  { k: "nw", ja: "ライブラリ", o: [["1", "ランク付けの後に追加"]], get: w => w.g?.nw ? "1" : null },
  { k: "tv", ja: "日本語の量", o: TEXT.map((x, i) => [String(i), x]), get: w => w.g?.tv },
  { k: "rg", ja: "日本語の傾向", o: pairs(FLAVOUR), get: w => w.g?.rg, multi: true },
  { k: "g", ja: "ジャンル", o: pairs(GENRE), get: w => w.g?.g, byCount: true },
  { k: "vb", ja: "雰囲気", o: pairs(VIBE), get: w => w.g?.vb, multi: true },
  { k: "se", ja: "舞台", o: pairs(SETTING), get: w => w.g?.se, multi: true },
  { k: "pl", ja: "遊び方", o: pairs(PLAYS), get: w => w.g?.pl, multi: true },
  { k: "ln", ja: "長さ", o: pairs(LENGTH), get: w => w.g?.ln },
  { k: "en", ja: "テンション", o: pairs(ENERGY), get: w => w.g?.en },
  { k: "pd", ja: "プレイ時間", o: [["0", "未プレイ"], ["1", "2時間未満"], ["2", "2時間以上"]], get: played },
  { k: "dk", ja: "Steam Deck", o: pairs(DECK), get: w => w.g?.dk },
];

// ---------- joining the details to the sheet's rows ----------
const fmt = v => "N" + (Math.round(v * 10) / 10).toFixed(1);
export function attach(works, meta, steam) {
  for (const w of works) {
    if (w.type?.id !== "games") continue;
    const led = steam.games[w.appid];
    w.hrs = Math.max(parseFloat(w.hours) || 0, led?.total_h || 0);
    w.last = led?.last_played || "";
    const g = w.appid ? meta[w.appid] : null;
    w.find = [w.title, w.note, w.tags, g?.dev, g && GENRE[g.g], g?.g, ...(g?.st || [])].filter(Boolean).join(" ").toLowerCase();
    if (!g) continue;
    w.g = g;
    w.genre = GENRE[g.g] || g.g;
    // ≈ a rough guess from Steam tags, ✓ measured from the script by jpdb, plain an estimate.
    w.level = g.lv == null ? "" : (g.lr === "rough" ? "≈" : g.lr === "jpdb" ? "✓" : "") + fmt(g.lv);
    w.sticker = g.o === "none" ? "EN" : w.level || "—";
  }
}

// What the detail sheet adds for a game.
export function facts(w) {
  const g = w.g;
  if (!g) return [];
  const list = (map, xs) => (xs || []).map(x => map[x] || x);
  const jp = g.o === "none" ? ORIGIN.none
    : [ORIGIN[g.o] || g.o, g.tv != null ? `文章量：${TEXT[g.tv]}` : null, g.jv ? "日本語音声あり" : "日本語音声なし"].filter(Boolean).join(" · ");
  return [
    ["日本語", jp],
    ["レベルの根拠", g.lv != null ? SOURCE[g.lr] : null],
    ["読むペース", g.o === "none" ? null : PACE[g.pc]],
    ["OCR", g.os ? [(g.of || []).includes("good") ? "向いている" : null, g.on].filter(Boolean).join(" · ") : null],
    ["登場人物", CAST[g.ca]],
    ["テンション", ENERGY[g.en]],
    ["Steam Deck", g.dk ? [DECK[g.dk] || g.dk, g.tl === "ok" ? "文字は読みやすい" : g.tl === "small" ? "文字が小さめ" : null].filter(Boolean).join(" · ") : null],
    ["Steam評価", g.us != null ? `${Math.round(g.us)}%${g.rn ? `（${g.rn.toLocaleString()}件）` : ""}` : null],
    ["開発", [g.dev, g.y].filter(Boolean).join(" · ")],
    ["特徴", [...list(FLAVOUR, g.rg), ...list(VIBE, g.vb), ...list(SETTING, g.se), ...list(PLAYS, g.pl)].join(" · ")],
  ].filter(r => r[1]);
}

// ---------- filtering and sorting ----------
const levelOn = () => f.opt.lo > 0 || f.opt.hi < 5;
function passToggles(w, statusAll) {
  const g = w.g, o = f.opt;
  if (o.core && !g?.co) return false;
  if (o.hideAlt && g?.alt) return false;
  if (o.jp && g?.o === "none") return false;
  if (o.voice && !g?.jv) return false;
  if (o.hideDone && statusAll && (w.cls === "done" || w.cls === "dropped")) return false;
  return true;
}
const passLevel = w => !levelOn() || (w.g?.lv != null && w.g.lv >= f.opt.lo - 1e-9 && w.g.lv <= f.opt.hi + 1e-9);
function passFacet(w, fc) {
  const s = f.sel[fc.k];
  if (!s?.length) return true;
  const v = fc.get(w);
  return fc.multi ? (v || []).some(x => s.includes(String(x))) : v != null && s.includes(String(v));
}
// statusAll: the page's status chip is on すべて (only then does "hide finished" apply).
export const passes = (w, statusAll) => passToggles(w, statusAll) && passLevel(w) && FACETS.every(fc => passFacet(w, fc));
export const active = () => Object.values(f.sel).reduce((n, s) => n + s.length, 0) + (levelOn() ? 1 : 0)
  + TOGGLES.filter(([k]) => f.opt[k]).length;

const dice = new Map();
const roll = w => { if (!dice.has(w.id)) dice.set(w.id, Math.random()); return dice.get(w.id); };
const score = w => { const s = parseFloat(w.score); return Number.isFinite(s) ? s : w.g?.s ?? -1; };
const lv = (w, none) => w.g?.lv ?? none;
const CMP = {
  value: (a, b) => score(b) - score(a) || (b.g?.rn || 0) - (a.g?.rn || 0),
  recent: (a, b) => b.last.localeCompare(a.last) || b.hrs - a.hrs,
  ocr: (a, b) => (b.g?.os || 0) - (a.g?.os || 0) || score(b) - score(a),
  easy: (a, b) => (lv(a) == null) - (lv(b) == null) || lv(b, 0) - lv(a, 0) || (b.g?.tv ?? 0) - (a.g?.tv ?? 0),
  hard: (a, b) => (lv(a) == null) - (lv(b) == null) || lv(a, 9) - lv(b, 9) || (b.g?.tv ?? 0) - (a.g?.tv ?? 0),
  text: (a, b) => (b.g?.tv ?? -1) - (a.g?.tv ?? -1) || score(b) - score(a),
  rating: (a, b) => (b.g?.us ?? 0) - (a.g?.us ?? 0) || (b.g?.rn || 0) - (a.g?.rn || 0),
  hours: (a, b) => b.hrs - a.hrs,
  fresh: (a, b) => a.hrs - b.hrs || score(b) - score(a),
  newest: (a, b) => (b.g?.y || 0) - (a.g?.y || 0),
  oldest: (a, b) => (a.g?.y || 9999) - (b.g?.y || 9999),
  az: (a, b) => a.title.localeCompare(b.title, "ja"),
  shuffle: (a, b) => roll(a) - roll(b),
};
export const sorter = () => CMP[f.opt.sort] || CMP.value;
export function setSort(key) { f.opt.sort = key; if (key === "shuffle") dice.clear(); save(); }
export function setOpen(open) { f.open = open; save(); }
export function reset() { f.sel = {}; Object.assign(f.opt, OPTS, { sort: f.opt.sort }); save(); }

// ---------- the level slider (the book finder's: drag either end, or the bar to slide the window) ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = v => Math.round(v * 10) / 10;
function levelSlider(onMove, onDone) {
  const o = f.opt;
  const bars = Array.from({ length: 51 }, () => h("i"));
  const knob = label => h("div", { class: "r-thumb", role: "slider", tabindex: "0", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "5" },
    h("span", { class: "bub" }));
  const lo = knob("いちばん難しいレベル"), hi = knob("いちばんやさしいレベル");
  const fill = h("div", { class: "r-fill", role: "slider", tabindex: "0", "aria-label": "レベルの幅ごと動かす", "aria-valuemin": "0", "aria-valuemax": "5" });
  const track = h("div", { class: "r-track" }, h("div", { class: "r-line" }), fill, lo, hi);
  const range = h("div", { class: "range" }, track);
  const read = h("strong"), count = h("span", { class: "cnt" });
  const any = h("button", { class: "clr", type: "button", text: "解除", onclick: () => { o.lo = 0; o.hi = 5; save(); onDone(); } });
  const el = h("div", { class: "lv" },
    h("div", { class: "lv-hist", "aria-hidden": "true" }, bars), range,
    h("div", { class: "r-axis" }, h("div", {}, [0, 1, 2, 3, 4, 5].map(i => h("span", { style: { left: i * 20 + "%" }, text: "N" + i })))),
    h("div", { class: "r-ends" }, h("span", { text: "← むずかしい" }), h("span", { text: "やさしい →" })),
    h("div", { class: "lv-read" }, read, count, any));
  let bins = new Array(51).fill(0);

  function paint() {
    const pct = v => v / 5 * 100 + "%";
    lo.style.left = pct(o.lo); hi.style.left = pct(o.hi);
    fill.style.left = pct(o.lo); fill.style.width = pct(o.hi - o.lo);
    lo.firstChild.textContent = fmt(o.lo); hi.firstChild.textContent = fmt(o.hi);
    for (const [knobEl, v, text] of [[lo, o.lo, fmt(o.lo)], [hi, o.hi, fmt(o.hi)], [fill, r1((o.lo + o.hi) / 2), `${fmt(o.lo)}〜${fmt(o.hi)}`]]) {
      knobEl.setAttribute("aria-valuenow", v); knobEl.setAttribute("aria-valuetext", text);
    }
    const max = Math.max(1, ...bins);
    let inside = 0;
    bars.forEach((bar, i) => {
      const on = i / 10 >= o.lo - 1e-9 && i / 10 <= o.hi + 1e-9;
      if (on) inside += bins[i];
      bar.style.height = bins[i] ? 8 + bins[i] / max * 92 + "%" : "0";
      bar.classList.toggle("in", on);
    });
    read.textContent = levelOn() ? `${fmt(o.lo)} – ${fmt(o.hi)}` : "どのレベルでも";
    count.textContent = levelOn() ? `${inside}本` : "";
    any.hidden = !levelOn();
  }

  const valueAt = x => { const r = track.getBoundingClientRect(); return clamp(Math.round((x - r.left) / r.width * 50) / 10, 0, 5); };
  let drag = null;
  const start = (kind, e) => {
    drag = { kind, lo0: o.lo, hi0: o.hi, v0: valueAt(e.clientX) };
    try { range.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    e.preventDefault();
  };
  lo.addEventListener("pointerdown", e => start("lo", e));
  hi.addEventListener("pointerdown", e => start("hi", e));
  fill.addEventListener("pointerdown", e => start("mid", e));
  track.addEventListener("pointerdown", e => {      // a tap on the bare line moves the nearer end there
    if (e.target !== track && !e.target.classList.contains("r-line")) return;
    const v = valueAt(e.clientX);
    if (Math.abs(v - o.lo) <= Math.abs(v - o.hi)) { o.lo = Math.min(v, o.hi); start("lo", e); } else { o.hi = Math.max(v, o.lo); start("hi", e); }
    paint(); onMove();
  });
  range.addEventListener("pointermove", e => {
    if (!drag) return;
    const v = valueAt(e.clientX);
    if (drag.kind === "lo") o.lo = Math.min(v, o.hi);
    else if (drag.kind === "hi") o.hi = Math.max(v, o.lo);
    else { const w = drag.hi0 - drag.lo0; o.lo = clamp(r1(drag.lo0 + v - drag.v0), 0, r1(5 - w)); o.hi = r1(o.lo + w); }
    paint(); onMove();
  });
  const end = () => { if (drag) { drag = null; save(); onDone(); } };
  range.addEventListener("pointerup", end);
  range.addEventListener("pointercancel", end);
  const key = which => e => {
    const step = e.shiftKey ? 0.5 : 0.1;
    const d = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, Home: -5, End: 5 }[e.key];
    if (!d) return;
    e.preventDefault();
    if (which === "lo") o.lo = clamp(r1(o.lo + d), 0, o.hi);
    else if (which === "hi") o.hi = clamp(r1(o.hi + d), o.lo, 5);
    else { const w = r1(o.hi - o.lo); o.lo = clamp(r1(o.lo + d), 0, r1(5 - w)); o.hi = r1(o.lo + w); }
    save(); paint(); onMove();
  };
  lo.addEventListener("keydown", key("lo"));
  hi.addEventListener("keydown", key("hi"));
  fill.addEventListener("keydown", key("mid"));
  return { el, paint, setBins(b) { bins = b; paint(); } };
}

// ---------- the panel ----------
const panels = new WeakMap();
// root: the panel element. pool: the games that pass the page's own filters (status chip, search).
// ctx: { statusAll, onChange (draw the page again) }
export function renderFilters(root, pool, ctx) {
  let p = panels.get(root);
  if (!p) {
    let wait = 0;
    p = { ctx, head: h("div", { class: "fac-top" }), toggles: h("div", { class: "chips" }), facets: h("div", { class: "facs" }) };
    // The slider stays in place across redraws, so a drag or a held arrow key is never interrupted.
    p.slider = levelSlider(() => { clearTimeout(wait); wait = setTimeout(() => p.ctx.onChange(), 120); }, () => { clearTimeout(wait); p.ctx.onChange(); });
    root.append(p.head, h("div", { class: "fac" }, h("div", { class: "fac-h" }, h("span", { class: "lab", text: "日本語" })), p.toggles),
      h("div", { class: "fac" }, h("div", { class: "fac-h" }, h("span", { class: "lab", text: "JLPTレベル" })), p.slider.el), p.facets);
    panels.set(root, p);
  }
  p.ctx = ctx;
  const change = fn => () => { fn(); save(); ctx.onChange(); };
  const base = pool.filter(w => passToggles(w, ctx.statusAll));
  const shown = base.filter(w => passLevel(w) && FACETS.every(fc => passFacet(w, fc)));

  p.head.replaceChildren(h("h2", { text: "絞り込み" }), h("span", { class: "cnt", text: `${shown.length}本` }),
    ...(active() ? [h("button", { class: "clr", type: "button", text: "すべて解除", onclick: change(reset) })] : []));
  const core = pool.filter(w => w.g?.co).length;
  p.toggles.replaceChildren(...TOGGLES.map(([k, ja]) => h("button", { class: "chip", type: "button", "aria-pressed": String(!!f.opt[k]),
    onclick: change(() => { f.opt[k] = !f.opt[k]; }) }, ja, k === "core" ? h("span", { class: "n", text: core }) : null)));

  // The bars show where the games sit that pass everything except the level window itself.
  const bins = new Array(51).fill(0);
  for (const w of base) if (w.g?.lv != null && FACETS.every(fc => passFacet(w, fc))) bins[clamp(Math.round(w.g.lv * 10), 0, 50)]++;
  p.slider.setBins(bins);

  p.facets.replaceChildren(...FACETS.map(fc => {
    // A facet's counts ignore its own selection, so picking one value still shows what the others would add.
    const others = base.filter(w => passLevel(w) && FACETS.every(x => x === fc || passFacet(w, x)));
    const n = {};
    for (const w of others) { const v = fc.get(w); for (const x of fc.multi ? v || [] : [v]) if (x != null) n[x] = (n[x] || 0) + 1; }
    const sel = f.sel[fc.k] || [];
    let opts = fc.o.filter(([v]) => n[v] || sel.includes(String(v)));
    if (fc.byCount) opts = opts.sort((a, b) => (n[b[0]] || 0) - (n[a[0]] || 0));
    if (!opts.length) return null;
    return h("div", { class: "fac" },
      h("div", { class: "fac-h" }, h("span", { class: "lab", text: fc.ja }),
        sel.length ? h("button", { class: "clr", type: "button", text: "解除", onclick: change(() => { f.sel[fc.k] = []; }) }) : null),
      h("div", { class: "chips" }, opts.map(([v, ja]) => h("button", { class: "chip" + (n[v] ? "" : " z"), type: "button",
        "aria-pressed": String(sel.includes(String(v))),
        onclick: change(() => { const s = new Set(sel); s.has(String(v)) ? s.delete(String(v)) : s.add(String(v)); f.sel[fc.k] = [...s]; }) },
        ja, h("span", { class: "n", text: n[v] || 0 })))));
  }).filter(Boolean));
}
