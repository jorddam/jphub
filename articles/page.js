import { h, $, clear, topbar, setSync, ago, toast, local, setLocal } from "../lib/core.js";
import * as data from "../lib/data.js";
import { loadArticles, articlesDue, fetchNewArticles } from "../lib/sources.js";

topbar("articles");

const state = { filter: "all" };
let feed = { records: [] };
const PENDING = "jphub.readPending";

// Read marks sent but not yet confirmed. They show at once and clear when the feed agrees.
function withPending(records) {
  const p = local(PENDING, {});
  let changed = false;
  const out = records.map(r => {
    if (!(r.id in p)) return r;
    if (!!r.read === p[r.id]) { delete p[r.id]; changed = true; return r; }
    return { ...r, read: p[r.id], pending: true };
  });
  if (changed) setLocal(PENDING, p);
  return out;
}

async function setRead(rec, value) {
  const p = local(PENDING, {});
  p[rec.id] = value;
  setLocal(PENDING, p);
  render();
  const id = "o_" + new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "_" + Math.random().toString(36).slice(2, 6);
  try {
    await data.create(`outbox/pending/${id}.json`, { id, at: new Date().toISOString(), app: "articles", target: "airtable",
      match: { id: rec.id }, set: { Read: value } });
    if (data.mode === "dev") await data.runJob("outbox");
  } catch (e) {
    delete p[rec.id];
    setLocal(PENDING, p);
    toast("送信できませんでした。オンラインになったらもう一度。");
  }
  await load();
}

function card(a) {
  const vocab = String(a.vocab || "").split("\n").map(s => s.trim()).filter(Boolean);
  return h("article", { class: "art" + (a.read ? " read" : "") },
    h("h3", {}, h("a", { href: a.url, target: "_blank", rel: "noopener", text: a.jp })),
    a.en ? h("span", { class: "en", text: a.en }) : null,
    h("div", { class: "meta" }, a.source ? h("span", { class: "tag jp", text: a.source }) : null,
      a.category ? h("span", { class: "tag jp", text: a.category.split(" / ")[0] }) : null,
      a.difficulty ? h("span", { class: "tag", text: a.difficulty }) : null,
      a.length ? h("span", { class: "tag", text: a.length }) : null),
    a.hook ? h("p", { class: "hook", text: a.hook }) : null,
    vocab.length ? h("details", {}, h("summary", { text: `単語 ${vocab.length}` }), h("ul", { class: "vocab" }, vocab.map(v => h("li", { text: v })))) : null,
    h("div", { class: "foot2" },
      h("a", { class: "btn", href: a.url, target: "_blank", rel: "noopener", text: "読む ↗" }),
      h("button", { class: "btn" + (a.read ? "" : " primary"), type: "button", text: a.read ? (a.pending ? "既読（同期中）" : "未読に戻す") : "既読にする",
        onclick: () => setRead(a, !a.read) })));
}

function render() {
  const records = withPending(feed.records);
  const unread = records.filter(r => !r.read).length;
  clear($("#filters")).append(...[["all", "すべて", records.length], ["unread", "未読", unread]].map(([id, ja, n]) =>
    h("button", { class: "chip", type: "button", "aria-pressed": String(state.filter === id), onclick: () => { state.filter = id; render(); } },
      ja, h("span", { class: "n", text: n }))));
  const shown = records.filter(r => state.filter === "all" || !r.read);
  $("#count").textContent = feed.at ? `取得 ${ago(feed.at)}` : "";
  const days = clear($("#days"));
  if (!shown.length) days.append(h("p", { class: "empty", text: records.length ? "未読はありません。" : "記事がまだありません。" }));
  const byDay = new Map();
  for (const r of shown) { const d = (r.added || "").slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); }
  for (const [d, list] of byDay) {
    const date = new Date(d + "T12:00:00");
    const label = isNaN(date) ? d : `${date.getMonth() + 1}月${date.getDate()}日（${"日月火水木金土"[date.getDay()]}）`;
    days.append(h("section", {}, h("h2", { class: "dayh", text: `${label} · ${list.filter(r => r.read).length}/${list.length} 既読` }),
      h("div", { class: "arts" }, list.map(card))));
  }
}

function showSync() {
  if (checking) return setSync("busy", "新しい記事を確認中…（1分ほど）");
  setSync(data.mode === "none" || feed.stale ? "bad" : "ok",
    data.mode === "dev" ? "サンプルデータ" : data.mode === "none" ? "未接続" : "同期済み", () => check(true));
}
async function load() {
  if (!checking) setSync("busy", "読み込み中…");
  try {
    feed = await loadArticles();
    render();
    showSync();
  } catch (e) {
    console.error(e);
    setSync("bad", "読み込めませんでした", load);
  }
}

// Fetch the newest batch from the Reading Feed: the 更新 button, and on opening when today's five are missing.
let checking = false;
async function check(manual) {
  if (checking) return;
  if (data.mode === "none") return load();
  checking = true;
  showSync();
  let next = null, failed = false;
  try { next = await fetchNewArticles(feed); } catch (e) { console.error(e); failed = true; }
  checking = false;
  if (next) { feed = next; render(); toast("新しい記事が届きました"); }
  else if (failed) toast("確認できませんでした。少ししてからもう一度。");
  else if (manual) toast("新しい記事はまだありません");
  showSync();
}

load().then(() => { if (articlesDue(feed)) check(false); });
