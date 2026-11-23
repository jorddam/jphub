// What each app contributes to the home page. Every function reads that app's own data
// and returns plain items; none of them talk to each other.

import * as data from "./data.js";
import { SHIFT, local, setLocal } from "./core.js";

const monthOf = d => d.toISOString().slice(0, 7);
// When the hub's current day began (it turns over at 4 a.m.).
const dayStart = (now = Date.now()) => { const d = new Date(now - SHIFT); d.setHours(0, 0, 0, 0); return d.getTime() + SHIFT; };

// The daily five: the newest batch (records added on the latest day) and recent ones.
export async function loadArticles() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const files = await Promise.all([monthOf(now), monthOf(prev)].map(m => data.read(`snapshots/articles/${m}.json`).catch(() => ({}))));
  const records = files.flatMap(f => f.data?.records || []).sort((a, b) => (b.added || "").localeCompare(a.added || ""));
  const day = r => (r.added || "").slice(0, 10);
  const today = records.length ? records.filter(r => day(r) === day(records[0])) : [];
  // fresh: the newest batch was added during the hub's current day.
  const fresh = !!records.length && new Date(records[0].added).getTime() >= dayStart();
  return { records, today, fresh, at: files[0]?.data?.at, stale: files.some(f => f.stale) };
}

// The crawl writes the day's five to Airtable around 6 a.m. and a GitHub job copies them here.
// GitHub's own timer for that job can run hours late or skip a slot, so the hub asks for the copy
// itself: when today's batch should exist and isn't here, at most once every half hour.
const ASKED = "jphub.articlesAsked";
export function articlesDue(feed, now = Date.now()) {
  if (data.mode === "none" || feed.fresh) return false;
  if (now < dayStart(now) + 2 * 3600 * 1000) return false;      // before 6 a.m. there is nothing to fetch yet
  return now - local(ASKED, 0) > 30 * 60 * 1000;
}

// Run the copy job, wait for it, and read again. Resolves with the new feed, or null when nothing changed.
export async function fetchNewArticles(feed) {
  setLocal(ASKED, Date.now());
  if (!await data.runJobAndWait("articles")) throw new Error("the articles job did not finish");
  const next = await loadArticles();
  return next.at !== feed.at || next.records.length !== feed.records.length ? next : null;
}

export async function loadSteam() {
  const { data: led } = await data.read("snapshots/steam/ledger.json").catch(() => ({}));
  if (!led) return { playing: [], h30: {}, games: {} };
  return { at: led.at, games: led.games || {}, h30: led.h30 || {}, playing: led.playing || [] };
}

// Per-game details from the game picker (level, text volume, pace, OCR fit…), keyed by Steam app id.
export async function loadGameMeta() {
  const { data: d } = await data.read("static/games/meta.json").catch(() => ({}));
  return d?.games || {};
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
