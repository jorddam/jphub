// What each app contributes to the home page. Every function reads that app's own data
// and returns plain items; none of them talk to each other.

import * as data from "./data.js";

const monthOf = d => d.toISOString().slice(0, 7);

// The daily five: the newest batch (records added on the latest day) and recent ones.
export async function loadArticles() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const files = await Promise.all([monthOf(now), monthOf(prev)].map(m => data.read(`snapshots/articles/${m}.json`).catch(() => ({}))));
  const records = files.flatMap(f => f.data?.records || []).sort((a, b) => (b.added || "").localeCompare(a.added || ""));
  const day = r => (r.added || "").slice(0, 10);
  const today = records.length ? records.filter(r => day(r) === day(records[0])) : [];
  return { records, today, at: files[0]?.data?.at, stale: files.some(f => f.stale) };
}

export async function loadSteam() {
  const { data: led } = await data.read("snapshots/steam/ledger.json").catch(() => ({}));
  if (!led) return { playing: [], h30: {}, games: {} };
  return { at: led.at, games: led.games || {}, h30: led.h30 || {}, playing: led.playing || [] };
}

export async function loadJournal() {
  const { data: j } = await data.read("snapshots/notion/journal.json").catch(() => ({}));
  return (j?.entries || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function loadHiroicho() {
  const { data: d } = await data.read("snapshots/notion/hiroicho.json").catch(() => ({}));
  return d?.cards || [];
}

export async function loadGrammar() {
  const { data: d } = await data.read("snapshots/bunkei/points.json").catch(() => ({}));
  return d?.points || [];
}

export async function loadShelf() {
  const { data: d } = await data.read("snapshots/shelf/items.json").catch(() => ({}));
  const items = d?.items || [];
  const picks = items.filter(i => i.rec && i.status === "next").sort((a, b) =>
    (a.rec.slot || "").localeCompare(b.rec.slot || "") || (a.rec.rank || 9) - (b.rec.rank || 9));
  return { items, picks, at: d?.at };
}
