import { h, $, clear, icon, topbar, setSync, ago, dayKey, SHIFT, local, setLocal, toast } from "./lib/core.js";
import * as data from "./lib/data.js";
import { TYPES, loadLibrary, inUse, statusLabel } from "./lib/library.js";
import { loadArticles, articlesDue, fetchNewArticles, loadSteam, loadJournal, loadHiroicho, loadShelf } from "./lib/sources.js";
import { LINES, DEPOT, STATIONS, LAUNCH } from "./lib/stations.js";
import { ICONS } from "./lib/icons.js";

topbar("home", "./");

// ---------- いま: everything in use, drawn from each app's own data ----------
function row({ href, title, sub, side, pct, color }) {
  return h("li", {}, h("a", { class: "rowi", href },
    h("span", { class: "t", text: title }),
    side ? h("span", { class: "side" }, side) : null,
    sub ? h("span", { class: "sub", text: sub }) : null,
    pct != null ? h("span", { class: "bar", style: color ? { "--c": `var(${color})` } : null }, h("i", { style: { width: Math.round(pct) + "%" } })) : null));
}
function panel(mark, title, color, moreHref, moreText, rows, emptyText) {
  return h("section", { class: "panel", style: { "--c": `var(${color})` } },
    h("header", {}, h("span", { class: "lmark", text: mark }), h("h2", { text: title }),
      moreHref ? h("a", { class: "more", href: moreHref, text: moreText }) : null),
    rows.length ? h("ul", { class: "rows" }, rows) : h("p", { class: "empty", text: emptyText }));
}
const join = (...parts) => parts.filter(Boolean).join(" · ");
const pctOf = s => { const m = /^(\d+)%$/.exec(s || ""); return m ? +m[1] : null; };

function workRow(w, steam) {
  const href = `library/?t=${w.type.id}&w=${encodeURIComponent(w.id)}`;
  if (w.type.id === "manga") {
    const pct = pctOf(w.progress);
    return row({ href, title: w.title, sub: join(w.creator, w.level, pct != null ? `BookWalker ${pct}%` : null),
      side: w.vol ? ["巻 ", h("b", { text: w.vol }), w.volsTotal > 1 ? ` / ${w.volsTotal}` : ""] : null, pct, color: w.type.c });
  }
  if (w.type.id === "games") {
    const hrs = steam.h30[w.appid];
    return row({ href, title: w.title, sub: join(w.tier ? `Tier ${w.tier}` : null, w.platform || "Steam", w.pendingId ? "同期中" : null),
      side: hrs ? [h("b", { text: String(hrs) }), " 時間 / 30日"] : null });
  }
  return row({ href, title: w.title, sub: join(w.creator, w.level || w.site, w.pendingId ? "同期中" : null) });
}

function renderNow(lib, steam) {
  const box = clear($("#now"));
  if (lib.empty) {
    box.append(h("p", { class: "empty" }, "ライブラリのデータがまだありません。", h("a", { href: "settings/", text: "設定" }), "で接続してください。"));
    return;
  }
  const using = inUse(lib.works);
  for (const type of TYPES) {
    let rows = using.filter(w => w.type === type).map(w => workRow(w, steam));
    if (type.id === "games") {
      // Games Steam says you're playing that the sheet doesn't mark yet.
      const marked = new Set(using.filter(w => w.appid).map(w => w.appid));
      for (const appid of steam.playing) {
        if (marked.has(appid)) continue;
        const g = steam.games[appid];
        rows.push(row({ href: `library/?t=games&q=${encodeURIComponent(g.name)}`, title: g.name, sub: "Steamの記録から",
          side: [h("b", { text: String(steam.h30[appid]) }), " 時間 / 30日"] }));
      }
    }
    if (!rows.length) continue;
    box.append(panel(type.ja[0], `${type.ja} · ${rows.length}`, type.c, `library/?t=${type.id}`, "すべて →", rows));
  }
  if (!box.children.length) box.append(h("p", { class: "empty", text: "いま進行中のものはありません。" }));
}

function renderToday(articles, journal, cards, shelf, checking) {
  const box = clear($("#today"));
  const read = articles.today.filter(a => a.read).length;
  // When today's five haven't arrived, say which day's these are instead of calling them today's.
  const day = new Date(articles.today[0]?.added || NaN);
  const name = articles.fresh || isNaN(day) ? "今日の5本" : `${day.getMonth() + 1}月${day.getDate()}日の5本`;
  box.append(panel("記", `${name} · ${read}/${articles.today.length} 既読${checking ? " · 新着を確認中…" : ""}`, "--m", "articles/", "読む →",
    articles.today.map(a => row({ href: "articles/", title: a.jp, sub: join(a.source, a.difficulty, a.length, a.read ? "既読" : null) })),
    "今日の記事はまだ届いていません。"));

  box.append(panel("ノ", "ノート", "--n", "notebook/", "開く →",
    journal.slice(0, 3).map(e => row({ href: "notebook/", title: e.work || "メモ",
      sub: (e.note || e.type) + (e.reply ? "　↩ キュレーターの返事あり" : "") })),
    "まだメモがありません。"));

  const today = dayKey();
  const due = cards.filter(c => c.review?.next && c.review.next <= today).length;
  const hiro = STATIONS.find(s => s.id === "hiroicho");
  box.append(panel("拾", `拾い帳 · 復習 ${due}枚`, "--r", hiro.url, "Claudeで開く ↗",
    cards.slice().sort((a, b) => (b.logged_on || "").localeCompare(a.logged_on || "")).slice(0, 3)
      .map(c => row({ href: `notebook/?n=${encodeURIComponent(c.id)}`, title: c.headword, sub: join(c.reading, c.gloss) })),
    "カードはまだありません。"));

  box.append(panel("棚", "積読の棚 · 候補", "--h", STATIONS.find(s => s.id === "tsundoku").url, "Claudeで開く ↗",
    shelf.picks.slice(0, 4).map(i => row({ href: `library/?q=${encodeURIComponent(i.title_ja)}`, title: i.title_ja,
      sub: join({ manga: "マンガ", game: "ゲーム", book: "本", web: "ウェブ小説", video: "動画" }[i.kind], i.rec.hook) })),
    "候補はまだありません。"));
}

// ---------- stations: pins, last-opened times, departure board ----------
const isWindows = /Windows/i.test(navigator.userAgent || "");
const byId = new Map(STATIONS.map(s => [s.id, s]));
let pins = local("jphub.pins", []).filter(id => byId.has(id));
let opened = local("jphub.opened", {});

const hrefFor = s => s.kind === "pc" ? (isWindows ? LAUNCH + encodeURIComponent(s.launch) : null) : s.url;
const external = s => s.kind !== "hub";
const openedToday = id => !!opened[id] && dayKey(opened[id]) === dayKey();
const daysSince = id => opened[id] ? Math.floor((Date.now() - opened[id]) / 86400000) : Infinity;
const colorOf = s => ({ "--c": `var(--${s.line.toLowerCase()})` });
const roundel = s => h("span", { class: "rd" }, icon(ICONS[s.id] || ICONS.library));
const PIN = '<path class="head" d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>';

function tags(s) {
  const t = [];
  if (openedToday(s.id)) t.push(h("span", { class: "tag jp use", text: "今日 ✓" }));
  if (s.skill) t.push(h("span", { class: "tag jp", text: s.skill }));
  if (s.level) t.push(h("span", { class: "tag", text: s.level }));
  if (s.note) t.push(h("span", { class: "tag jp", text: s.note }));
  if (s.kind === "claude") t.push(h("span", { class: "tag", text: "Claude" }));
  if (s.kind === "web") t.push(h("span", { class: "tag k-web", text: "Web" }));
  if (s.kind === "pc") t.push(h("span", { class: "tag k-pc", text: "PC" }));
  if (s.kind === "pc" && !isWindows) t.push(h("span", { class: "tag jp", text: "Windowsで起動" }));
  return t;
}
function station(s) {
  const href = hrefFor(s);
  const inner = [roundel(s), h("span", { class: "txt" },
    h("span", { class: "nm", text: s.name }), h("span", { class: "en", text: s.en }),
    h("span", { class: "bl", text: s.blurb }), h("span", { class: "tags" }, tags(s)))];
  const link = href
    ? h("a", { class: "stn", href, "data-id": s.id, target: external(s) ? "_blank" : null, rel: external(s) ? "noopener" : null },
        inner, h("span", { class: "go", text: s.kind === "pc" ? "起動 ↗" : external(s) ? "開く ↗" : "開く →" }))
    : h("div", { class: "stn off" }, inner);
  const on = pins.includes(s.id);
  const pin = h("button", { type: "button", class: "pin", "data-pin": s.id, "aria-pressed": String(on),
    "aria-label": `${s.name}を${on ? "ピン留めから外す" : "ピン留め"}` }, icon(PIN));
  return h("li", { style: colorOf(s) }, link, pin);
}

function departures() {
  const now = new Date(), hour = now.getHours(), dow = new Date(now.getTime() - SHIFT).getDay();
  const out = [];
  const add = (id, why) => {
    const s = byId.get(id);
    if (!s || !hrefFor(s) || openedToday(id) || out.some(o => o.s === s)) return;
    out.push({ s, why });
  };
  add("articles", "今日の5本が届いています");
  add("media-score", "今日の点数を見る");
  add("hiroicho", "今日の復習");
  if (hour >= 19 || hour < 4) add("yobanashi", "夜の屋上が開いています");
  if (dow === 1 || dow === 4) add("tsundoku", "月・木は棚の入れ替え日");
  if (daysSince("casefiles") >= 7) add("casefiles", "今週のケースファイル");
  STATIONS.filter(s => s.line !== DEPOT && s.line !== "H")
    .map((s, i) => ({ s, i, t: opened[s.id] || 0 })).sort((a, b) => a.t - b.t || a.i - b.i)
    .forEach(({ s }) => {
      const d = daysSince(s.id);
      if (d === Infinity) add(s.id, "まだ乗っていません"); else if (d >= 3) add(s.id, `${d}日ぶり`);
    });
  return out.slice(0, 3);
}
function renderBoard() {
  const now = new Date();
  $("#clock").textContent = `${"日月火水木金土"[now.getDay()]}曜 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const deps = departures();
  clear($("#blist")).append(...deps.map((d, i) => h("li", {}, h("a", { class: "dep", style: colorOf(d.s), href: hrefFor(d.s), "data-id": d.s.id,
    target: external(d.s) ? "_blank" : null, rel: external(d.s) ? "noopener" : null },
    h("span", { class: "ord", text: ["先発", "次発", "次々発"][i] }), roundel(d.s),
    h("span", { class: "txt" }, h("span", { class: "nm", text: d.s.name }), h("span", { class: "why", text: d.why })),
    h("span", { class: "go", text: external(d.s) ? "開く ↗" : "開く →" })))));
  $("#blist").hidden = !deps.length;
  $("#bempty").hidden = !!deps.length;
}
function renderStations() {
  const pinned = $("#pinned");
  pinned.hidden = !pins.length;
  clear(pinned).append(h("header", { class: "lh", style: { "--c": "var(--ink)" } }, h("span", { class: "lmark", text: "★" }), h("div", {}, h("h2", { text: "ピン留め" }))),
    h("ul", { class: "stations" }, pins.map(id => station(byId.get(id)))));
  clear($("#map")).append(...LINES.map(L => {
    const list = STATIONS.filter(s => s.line === L.id);
    const done = list.filter(s => openedToday(s.id)).length;
    return h("section", { class: "line", style: { "--c": `var(--${L.id.toLowerCase()})` } },
      h("header", { class: "lh" }, h("span", { class: "lmark", text: L.id }),
        h("div", {}, h("h2", { text: L.ja }), h("p", { text: L.sub + (L.id === "M" ? ` · 今日 ${done}/${list.length}` : "") }))),
      h("ul", { class: "stations" }, list.flatMap(s => [s.sub ? h("li", { class: "sub", text: s.sub }) : null, station(s)])));
  }));
  const depot = STATIONS.filter(s => s.line === DEPOT);
  clear($("#depot")).append(
    h("summary", { class: "lh", style: { "--c": "var(--s)" } }, h("span", { class: "lmark", text: "S" }),
      h("div", {}, h("h2", { text: "書庫" }), h("p", { text: `資料とリスト · ${depot.length}件` })), h("span", { class: "chev", text: "開く ▾" })),
    h("ul", { class: "stations", style: { "--c": "var(--s)" } }, depot.map(station)));
  renderBoard();
}

// Pins and last-opened times follow you across devices through state/hub.json.
let saveTimer = 0;
function saveState() {
  setLocal("jphub.pins", pins);
  setLocal("jphub.opened", opened);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => data.update("state/hub.json", remote => mergeState(remote, true)).catch(() => {}), 1500);
}
function mergeState(remote, mineWins) {
  const r = remote || {};
  const merged = { ...(r.opened || {}) };
  for (const [id, t] of Object.entries(opened)) merged[id] = Math.max(merged[id] || 0, t);
  return { pins: mineWins ? pins : (r.pins || pins), opened: merged, updatedAt: Date.now() };
}
document.addEventListener("click", e => {
  const pin = e.target.closest("button.pin");
  if (pin) {
    const id = pin.dataset.pin;
    pins = pins.includes(id) ? pins.filter(x => x !== id) : [...pins, id];
    saveState();
    renderStations();
    return;
  }
  const a = e.target.closest("a[data-id]");
  if (a) setTimeout(() => { opened = { ...opened, [a.dataset.id]: Date.now() }; saveState(); renderStations(); }, 0);
});

// ---------- load ----------
async function load() {
  setSync("busy", "読み込み中…");
  try {
    const [lib, steam, articles, journal, cards, shelf, hub] = await Promise.all([
      loadLibrary(), loadSteam(), loadArticles(), loadJournal(), loadHiroicho(), loadShelf(),
      data.read("state/hub.json").catch(() => ({}))]);
    if (hub.data) {
      const m = mergeState(hub.data, false);
      pins = (m.pins || []).filter(id => byId.has(id));
      opened = m.opened;
      setLocal("jphub.pins", pins);
      setLocal("jphub.opened", opened);
    }
    renderNow(lib, steam);
    renderToday(articles, journal, cards, shelf);
    renderStations();
    // Today's five should be here by now and aren't: ask for them, and show them when they land.
    if (!asking && articlesDue(articles)) {
      asking = true;
      renderToday(articles, journal, cards, shelf, true);
      fetchNewArticles(articles).catch(() => null).then(next => {
        asking = false;
        renderToday(next || articles, journal, cards, shelf);
        if (next) toast("新しい記事が届きました");
      });
    }
    const label = data.mode === "dev" ? "サンプルデータ" : data.mode === "none" ? "未接続" : lib.stale ? "オフライン" : "同期済み";
    setSync(data.mode === "none" || lib.stale ? "bad" : "ok", `${label} · シート ${ago(lib.at)}`, refresh);
  } catch (e) {
    console.error(e);
    setSync("bad", "読み込めませんでした", load);
  }
}
let asking = false;
// 更新: copy the sheet and the Reading Feed again, wait for both, then read. One after the other,
// because the jobs share a queue on GitHub.
async function refresh() {
  setSync("busy", "更新中…（1分ほど）");
  for (const job of ["snapshot", "articles"]) {
    try { await data.runJobAndWait(job); } catch (e) { /* show what we have */ }
  }
  await load();
}

renderStations();
load();
setInterval(renderBoard, 60000);
