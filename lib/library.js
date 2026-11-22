// The media library as the hub sees it: every tab of the sheet, grouped into works.
// A manga series is one work with many volume rows; it has one status (plan §5.5).

import { local, setLocal } from "./core.js";
import * as data from "./data.js";

export const TYPES = [
  { id: "books", ja: "本", slugs: ["ebooks", "novels", "bunko", "nonfiction"], c: "--h", use: "読書中", done: "読了" },
  { id: "manga", ja: "マンガ", slugs: ["manga", "bookwalker"], c: "--m", use: "読書中", done: "読了" },
  { id: "games", ja: "ゲーム", slugs: ["games-pc", "games-ps3"], c: "--j", use: "プレイ中", done: "クリア" },
  { id: "web", ja: "ウェブ小説", slugs: ["web"], c: "--r", use: "読書中", done: "読了" },
  { id: "audio", ja: "音声", slugs: ["podcasts"], c: "--n", use: "聴いている", done: "完了" },
  { id: "video", ja: "動画", slugs: ["video"], c: "--s", use: "視聴中", done: "完了" },
  { id: "wish", ja: "ほしい物", slugs: ["wishlist"], c: "--s" },
];
export const typeOf = slug => TYPES.find(t => t.slugs.includes(slug));

const IN_USE = new Set(["in progress", "in rotation", "reading", "playing", "watching", "listening"]);
export function statusClass(s) {
  s = (s || "").trim().toLowerCase();
  if (IN_USE.has(s)) return "use";
  if (s === "on hold" || s === "paused") return "hold";
  if (s === "finished") return "done";
  if (s === "dropped") return "dropped";
  return "none";
}
export function statusLabel(cls, type) {
  return { use: type?.use || "進行中", hold: "保留", done: type?.done || "完了", dropped: "やめた", none: "未着手" }[cls];
}

const volKey = (vol, i) => { const m = /^\s*(\d+(?:\.\d+)?)/.exec(vol || ""); return m ? [0, parseFloat(m[1]), i] : [1, 0, i]; };

function seriesStatus(vols) {
  const cls = vols.map(v => statusClass(v.status));
  if (cls.includes("use")) return "In progress";
  if (cls.includes("hold")) return "On hold";
  if (cls.length && cls.every(c => c === "done")) return "Finished";
  if (cls.includes("dropped")) return "Dropped";
  return "";
}

function buildWorks(snap) {
  const type = typeOf(snap.slug);
  const base = r => ({ ...r, tab: snap.tab, slug: snap.slug, kind: snap.kind, type, hasStatus: !!snap.statusCol,
    hasRating: !!snap.ratingCol, inUseWord: snap.inUseWord || "In progress" });
  // A book's "Series / Vol." text is only a label. `series` is true only for tabs with one row per volume.
  if (!snap.series) return snap.rows.map(r => ({ ...base(r), seriesName: r.series, series: false,
    cls: statusClass(r.status), id: r.key + ":" + r.row }));
  const groups = new Map();
  snap.rows.forEach((r, i) => { if (!groups.has(r.key)) groups.set(r.key, []); groups.get(r.key).push({ ...r, i }); });
  return [...groups.values()].map(rows => {
    rows.sort((a, b) => { const x = volKey(a.vol, a.i), y = volKey(b.vol, b.i); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    const status = seriesStatus(rows);
    const cls = rows.map(v => statusClass(v.status));
    let cur = cls.indexOf("use");
    if (cur < 0) cur = cls.indexOf("hold");
    if (cur < 0) cur = cls.findIndex(c => c !== "done");
    const head = rows[Math.max(cur, 0)];
    return { ...base(rows[0]), id: rows[0].key, series: true, vols: rows, status, cls: statusClass(status),
      vol: cur >= 0 ? head.vol : "", volsDone: cls.filter(c => c === "done").length, volsTotal: rows.length,
      progress: head.progress, link: head.link || rows[0].link, row: head.row };
  });
}

// Requests sent but not yet confirmed by the job. Shown at once, marked 同期中.
const PENDING = "jphub.pending";
export const pending = () => local(PENDING, {});

function overlay(work, p) {
  const o = p[work.id];
  if (!o) return work;
  const w = { ...work, pendingId: o.id, conflict: o.conflict, failed: o.failed };
  if (o.conflict || o.failed) return w;
  if (o.status !== undefined) { w.status = o.status; w.cls = statusClass(o.status); }
  if (o.rating !== undefined) w.rating = String(o.rating);
  if (o.next) w.volNote = "次の巻へ";
  return w;
}

export async function loadLibrary() {
  const index = await data.read("snapshots/library/index.json");
  if (!index.data) return { at: index.at, stale: index.stale, works: [], empty: true };
  const snaps = await Promise.all(index.data.tabs.map(t => data.read(`snapshots/library/${t.slug}.json`)));
  const p = await settle();
  const works = snaps.flatMap(s => s.data ? buildWorks(s.data) : []).map(w => overlay(w, p));
  return { at: index.data.at, stale: index.stale || snaps.some(s => s.stale), works, checked: index.at };
}

// Compare our pending requests with what the job has reported.
async function settle() {
  const p = pending();
  if (!Object.keys(p).length) return p;
  let results = [];
  try { results = (await data.read("outbox/status.json")).data?.results || []; } catch (e) { /* keep waiting */ }
  const byId = new Map(results.map(r => [r.id, r]));
  let changed = false;
  for (const [key, o] of Object.entries(p)) {
    const r = byId.get(o.id);
    if (!r || o.conflict || o.failed) continue;
    if (r.result === "applied" || r.result === "noop") delete p[key];
    else if (r.result === "conflict") p[key] = { ...o, conflict: { current: r.current || "" } };
    else p[key] = { ...o, failed: r.detail || r.result };
    changed = true;
  }
  if (changed) setLocal(PENDING, p);
  return p;
}

export function dismiss(work) {
  const p = pending();
  delete p[work.id];
  setLocal(PENDING, p);
}

const newId = () => "o_" + new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "_" + Math.random().toString(36).slice(2, 6);

async function send(work, req, optimistic) {
  req = { id: newId(), at: new Date().toISOString(), app: "hub", target: "sheet", tab: work.tab,
    match: { title: work.title }, ...req };
  if (work.series) req.scope = "series"; else req.rowHint = work.row;
  const p = pending();
  p[work.id] = { id: req.id, at: Date.now(), ...optimistic };
  setLocal(PENDING, p);
  await data.create(`outbox/pending/${req.id}.json`, req);
  if (data.mode === "dev") await data.runJob("outbox");   // on GitHub the push itself starts the job
  return req.id;
}

// word: one of the sheet's status words. force: overwrite what the sheet has now.
export function setStatus(work, word, force) {
  const expect = force ? work.conflict?.current ?? work.status : work.status;
  return send(work, { set: { Status: word }, expect: { Status: expect || "" } }, { status: word });
}
export function setRating(work, rating) {
  return send(work, { set: { Rating: rating } }, { rating });
}
export function nextVolume(work) {
  return send(work, { op: "next_volume", expect: { Status: work.status || "" } }, { next: true });
}

export const inUse = works => works.filter(w => w.cls === "use");
