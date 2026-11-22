import { h, $, clear, topbar, setSync, ago, toast } from "../lib/core.js";
import * as data from "../lib/data.js";
import { TYPES, loadLibrary, statusLabel, setStatus, setRating, nextVolume, dismiss, pending } from "../lib/library.js";
import { loadSteam, loadJournal, loadHiroicho } from "../lib/sources.js";

topbar("library");

const params = new URLSearchParams(location.search);
const state = { type: params.get("t") || "books", filter: "all", q: params.get("q") || "", open: params.get("w"), limit: 150 };
if (params.get("q") && !params.get("t")) state.type = "all";
let lib = { works: [] }, steam = { h30: {}, games: {}, playing: [] }, journal = [], cards = [];
let covers = null, games = null;

const TAB_JA = { Ebooks: "電子書籍", Novels: "単行本", Bunko: "文庫", "Nonfiction & Essays": "ノンフィクション", Manga: "紙のマンガ",
  "BookWalker Manga": "BookWalker", "Games (PC)": "PC · Steam", "Games (PS3)": "PS3", "Online stories": "ウェブ小説",
  YouTube: "YouTube", Podcasts: "ポッドキャスト", Wishlist: "ほしい物" };
const FILTERS = [["all", "すべて"], ["use", "進行中"], ["hold", "保留"], ["done", "完了"], ["none", "未着手"]];
const ORDER = { use: 0, hold: 1, none: 2, done: 3, dropped: 4 };
const join = (...p) => p.filter(Boolean).join(" · ");

// ---------- covers ----------
const seen = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { seen.unobserve(e.target); e.target._load?.(); }
}, { rootMargin: "300px" });

function cover(w) {
  const el = h("span", { class: "cover", text: w.title.slice(0, 1) });
  if (w.type?.id === "books" && covers?.[w.title]) {
    el._load = async () => {
      const url = await data.imageURL("covers/books/" + covers[w.title]);
      if (url) { el.textContent = ""; el.append(h("img", { class: "cover", src: url, alt: "" })); }
    };
    seen.observe(el);
  } else if (w.appid && games?.[w.appid]?.sp) {
    const [sheet, col, rowN] = games[w.appid].sp;
    el._load = async () => {
      const url = await data.imageURL(`covers/games/covers-${String(sheet).padStart(2, "0")}.webp`);
      if (!url) return;
      el.textContent = "";
      el.classList.add("sprite");
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = "1000% 1000%";
      el.style.backgroundPosition = `${col / 9 * 100}% ${rowN / 9 * 100}%`;
    };
    seen.observe(el);
  }
  return el;
}

// ---------- list ----------
function matches(w) {
  if (state.type !== "all" && w.type?.id !== state.type) return false;
  if (state.filter !== "all" && w.cls !== state.filter) return false;
  if (state.q) {
    const q = state.q.toLowerCase();
    if (![w.title, w.en, w.creator].some(s => (s || "").toLowerCase().includes(q))) return false;
  }
  return true;
}
function statusTag(w) {
  if (w.conflict) return h("span", { class: "tag jp pending", text: "シートと違います" });
  if (w.failed) return h("span", { class: "tag jp pending", text: "反映できません" });
  if (w.pendingId) return h("span", { class: "tag jp pending", text: "同期中" });
  if (w.cls === "none") return null;
  return h("span", { class: "tag jp " + w.cls, text: statusLabel(w.cls, w.type) });
}
function workRow(w) {
  const hrs = w.appid && steam.h30[w.appid];
  const sub = join(w.creator, w.series ? `全${w.volsTotal}巻${w.cls === "use" ? `・${w.vol}巻` : w.volsDone ? `・${w.volsDone}巻読了` : ""}` : null,
    TAB_JA[w.tab], w.tier ? `Tier ${w.tier}` : null, hrs ? `30日で${hrs}時間` : null, w.rating ? "★" + w.rating : null);
  return h("button", { class: "work", type: "button", onclick: () => openSheet(w.id) },
    cover(w), h("span", {}, h("span", { class: "t", text: w.title }), h("br"), h("span", { class: "sub", text: sub })),
    h("span", { class: "side" }, statusTag(w), w.level ? h("span", { class: "lvl", text: w.level }) : null));
}

function render() {
  const inType = lib.works.filter(w => state.type === "all" || w.type?.id === state.type);
  clear($("#types")).append(...TYPES.map(t => {
    const n = lib.works.filter(w => w.type === t).length;
    return n ? h("button", { class: "chip", type: "button", "aria-pressed": String(state.type === t.id),
      onclick: () => go({ type: t.id, limit: 150 }) }, t.ja, h("span", { class: "n", text: n })) : null;
  }));
  clear($("#filters")).append(...FILTERS.map(([id, ja]) => {
    const n = id === "all" ? inType.length : inType.filter(w => w.cls === id).length;
    return h("button", { class: "chip", type: "button", "aria-pressed": String(state.filter === id),
      onclick: () => go({ filter: id, limit: 150 }) }, ja, h("span", { class: "n", text: n }));
  }));
  const type = TYPES.find(t => t.id === state.type);
  const shown = lib.works.filter(matches).sort((a, b) => ORDER[a.cls] - ORDER[b.cls]);
  $("#listTitle").textContent = type ? type.ja : "検索結果";
  $("#count").textContent = `${shown.length}件`;
  const tools = clear($("#tools"));
  if (state.type === "books") tools.append(h("a", { href: "https://claude.ai/artifact/SbP6kVYxMH572m9FYKbYfT", target: "_blank", rel: "noopener", text: "AIで選ぶ ↗" }));
  const list = clear($("#list"));
  if (!shown.length) list.append(h("p", { class: "empty", text: lib.empty ? "データがありません。設定で接続してください。" : "該当するものはありません。" }));
  list.append(...shown.slice(0, state.limit).map(workRow));
  if (shown.length > state.limit) list.append(h("button", { class: "work", type: "button", onclick: () => go({ limit: state.limit + 300 }) },
    h("span", {}), h("span", { class: "sub", text: `さらに表示（残り${shown.length - state.limit}件）` }), h("span", {})));
  renderExtra();
}
async function go(change) {
  Object.assign(state, change);
  if (state.type === "games" && !games) {
    const g = (await data.read("static/games/data.json").catch(() => ({}))).data || [];
    games = Object.fromEntries(g.map(x => [String(x.i), x]));
  }
  render();
}

// ---------- 音声: draw three episodes (the old Nihongo Dial) ----------
let dial = null, drawn = [];
async function renderExtra() {
  const box = clear($("#extra"));
  if (state.type !== "audio") return;
  if (!dial) dial = (await data.read("static/dial/episodes.json").catch(() => ({}))).data;
  if (!dial || state.type !== "audio") return;
  const chan = Object.fromEntries(dial.channels.map(c => [c.k, c.n]));
  const draw = () => {
    const pool = dial.videos.filter(v => v.k === "podcast");
    drawn = Array.from({ length: 3 }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    renderExtra();
  };
  box.append(h("section", { class: "panel", style: { "--c": "var(--n)" } },
    h("header", {}, h("span", { class: "lmark", text: "引" }), h("h2", { text: "今日の1本を引く" }),
      h("span", { class: "count", text: `${dial.videos.length}話から` }),
      h("button", { class: "btn primary more", type: "button", onclick: draw, text: "3本引く" })),
    drawn.length ? h("ul", { class: "rows" }, drawn.map(v => h("li", { class: "rowi" },
      h("span", { class: "t", text: v.t }),
      h("span", { class: "side" }, h("b", { text: String(Math.round(v.s / 60)) }), " 分"),
      h("span", { class: "sub" }, join(chan[v.c], v.l?.length ? "N" + v.l.join("·N") : null), "　",
        h("a", { href: "https://jorddam.github.io/kikitori/?yt=" + encodeURIComponent(v.i), target: "_blank", rel: "noopener", text: "聞き取りで開く ↗" }), "　",
        h("a", { href: "https://www.youtube.com/watch?v=" + encodeURIComponent(v.i), target: "_blank", rel: "noopener", text: "YouTube ↗" })))))
      : h("p", { class: "empty", text: "ボタンを押すと、ポッドキャストから3本選びます。聞き取りで開くと字幕つきで聞けます。" })));
}

// ---------- detail sheet ----------
const STATUS_BUTTONS = [["none", "Not started"], ["use", null], ["hold", "On hold"], ["done", "Finished"], ["dropped", "Dropped"]];

function closeSheet() {
  document.querySelector(".scrim")?.remove();
  document.querySelector(".sheet")?.remove();
  state.open = null;
}
async function act(promise, okText) {
  try { await promise; toast(okText); } catch (e) { toast("送信できませんでした。オンラインになったらもう一度。"); }
  await load();
}
function openSheet(id) {
  const w = lib.works.find(x => x.id === id);
  closeSheet();
  if (!w) return;
  state.open = id;
  const kv = [["作者", w.creator], ["シリーズ", w.seriesName], ["レベル", w.level], ["ジャンル", w.genre], ["長さ", w.length || w.format], ["場所", join(TAB_JA[w.tab], w.where, w.site, w.platform)],
    ["Steam", w.appid && steam.games[w.appid] ? `合計 ${steam.games[w.appid].total_h}時間 · 30日で ${steam.h30[w.appid] || 0}時間` : null],
    ["BookWalker", w.progress]].filter(r => r[1]);
  const notes = journal.filter(e => e.work === w.title).length + cards.filter(c => c.source === w.title).length;
  const wanted = pending()[w.id]?.status;

  const body = h("aside", { class: "sheet", role: "dialog", "aria-label": w.title },
    h("button", { class: "close", type: "button", onclick: closeSheet, text: "閉じる ✕" }),
    h("div", {}, h("h2", { text: w.title }), w.en ? h("p", { class: "en", text: w.en }) : null),

    w.conflict ? h("div", { class: "notice" },
      h("span", { text: `シートでは「${w.conflict.current || "空欄"}」になっています。` }),
      h("div", { class: "btnrow" },
        h("button", { class: "btn", type: "button", text: "シートに合わせる", onclick: () => { dismiss(w); load(); } }),
        h("button", { class: "btn primary", type: "button", text: "上書きする", onclick: () => act(setStatus(w, wanted, true), "上書きを送りました") }))) : null,
    w.failed ? h("div", { class: "notice bad" }, h("span", { text: `反映できませんでした（${w.failed}）。` }),
      h("div", { class: "btnrow" }, h("button", { class: "btn", type: "button", text: "閉じる", onclick: () => { dismiss(w); load(); } }))) : null,

    w.hasStatus ? h("div", { class: "field" },
      h("span", { class: "lab", text: w.series ? "状態（シリーズ全体）" : "状態" }),
      h("div", { class: "seg" }, STATUS_BUTTONS.map(([cls, word]) => h("button", { type: "button", "aria-pressed": String(w.cls === cls),
        text: statusLabel(cls, w.type), onclick: () => w.cls === cls ? null : act(setStatus(w, word ?? w.inUseWord), "シートに送りました") }))),
      w.pendingId && !w.conflict && !w.failed ? h("span", { class: "hint", text: "シートに反映中です（1分ほど）。" }) : null) : null,

    w.series ? h("div", { class: "field" },
      h("span", { class: "lab", text: `巻（${w.volsDone}/${w.volsTotal} 読了）` }),
      h("div", { class: "vols" }, w.vols.map(v => h("span", { class: "vol " + ({ "in progress": "use", finished: "done", "on hold": "hold" }[(v.status || "").toLowerCase()] || ""), text: v.vol || "—" }))),
      w.cls === "use" ? h("div", { class: "btnrow" }, h("button", { class: "btn primary", type: "button", text: `${w.vol}巻を読了 → 次の巻へ`,
        onclick: () => act(nextVolume(w), "次の巻へ進めました") })) : null) : null,

    w.hasRating && !w.series ? h("div", { class: "field" }, h("span", { class: "lab", text: "評価" }),
      h("div", { class: "seg" }, [1, 2, 3, 4, 5].map(n => h("button", { type: "button", "aria-pressed": String(String(w.rating) === String(n)),
        text: "★" + n, onclick: () => act(setRating(w, n), "評価を送りました") })))) : null,

    kv.length ? h("dl", { class: "kv" }, kv.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])) : null,
    w.synopsis ? h("p", { text: w.synopsis }) : null,
    w.note ? h("p", { class: "hint", text: w.note }) : null,

    h("div", { class: "btnrow" },
      w.link ? h("a", { class: "btn", href: w.link, target: "_blank", rel: "noopener", text: "開く ↗" }) : null,
      w.appid ? h("a", { class: "btn", href: `steam://rungameid/${encodeURIComponent(w.appid)}`, text: "Steamで起動" }) : null,
      w.tab === "Ebooks" ? h("a", { class: "btn", href: "https://jorddam.github.io/gyokan/", target: "_blank", rel: "noopener", text: "行間で読む ↗" }) : null,
      h("a", { class: "btn", href: `../notebook/?work=${encodeURIComponent(w.title)}`, text: notes ? `ノート ${notes}件` : "ノートを書く" })));
  document.body.append(h("div", { class: "scrim", onclick: closeSheet }), body);
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

// ---------- load ----------
let retry = 0;
async function load() {
  setSync("busy", "読み込み中…");
  try {
    [lib, steam, journal, cards] = await Promise.all([loadLibrary(), loadSteam(), loadJournal(), loadHiroicho()]);
    if (!covers) covers = (await data.read("covers/books.json").catch(() => ({}))).data || {};
    await go({});
    if (state.open) openSheet(state.open);
    const waiting = Object.values(pending()).some(p => !p.conflict && !p.failed);
    const label = data.mode === "dev" ? "サンプルデータ" : data.mode === "none" ? "未接続" : lib.stale ? "オフライン" : "同期済み";
    setSync(waiting ? "busy" : lib.stale || data.mode === "none" ? "bad" : "ok", `${label} · シート ${ago(lib.at)}`, load);
    // On GitHub a change takes about a minute to land; look again a few times.
    clearTimeout(retry);
    if (waiting && data.mode === "github") retry = setTimeout(load, 30000);
  } catch (e) {
    console.error(e);
    setSync("bad", "読み込めませんでした", load);
  }
}

let typing = 0;
$("#q").value = state.q;
$("#q").addEventListener("input", e => { clearTimeout(typing); typing = setTimeout(() => go({ q: e.target.value.trim(), limit: 150 }), 150); });
load();
