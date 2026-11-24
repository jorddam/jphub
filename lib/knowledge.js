// 地図: what you've read in nonfiction, as points.
//
// Source: Gyokan's sync file (read-only). The shape it is read in, and what happens to imperfect
// records, is written at the top of points.js, which does the reading; this file only fetches.

import * as data from "./data.js";
import { normalise, applyEdits } from "./points.js";

export * from "./points.js";

const GYOKAN_REPO = "jorddam/gyokan-sync";
// Your own corrections to the map (a point moved or hidden, a topic renamed or merged) live in the hub's
// data repo, never in Gyokan's file. Shape: see points.js.
const EDITS = "state/knowledge.json";

// Save one correction. change(file) is given the newest saved copy and returns the new one, so a correction
// made on another device in the meantime is kept. Resolves with what was saved.
export function saveEdits(change) {
  return data.update(EDITS, file => change(file));
}

// Returns { state, points, base, edits, report, stale, at }.
//   points the points as corrected; base as Gyokan saved them; edits the corrections file (null when there is none)
//   state  "ok"      the file was read (points may still be empty: nothing saved yet)
//          "none"    no token on this device
//          "denied"  the token may not read Gyokan's sync repo
//          "missing" there is no sync file where it should be (GitHub also answers this for a repo the token can't see)
//          "foreign" a file is there, but it isn't Gyokan's
//          "error"   it could not be fetched and no earlier copy is saved on this device
//   stale  true when the points come from the copy saved on this device because the fetch failed
export async function loadPoints() {
  const none = state => ({ state, connected: false, points: [], base: [], edits: null, report: null, stale: true });
  if (data.mode === "none") return none("none");
  const [r, ed] = await Promise.all([data.readFrom(GYOKAN_REPO, "gyokan.json"), data.read(EDITS).catch(() => ({ data: null }))]);
  if (!r.data) return none(r.status === 401 || r.status === 403 ? "denied" : r.status === 404 ? "missing" : "error");
  if (r.data.app !== "gyokan") return none("foreign");
  const { points: base, report } = normalise(r.data);
  if (report.skipped || report.unfiled) console.warn("地図: 読めなかった記録があります", report);
  const edits = ed.data || null;
  return { state: "ok", connected: true, points: applyEdits(base, edits).points, base, edits, report, stale: !!r.stale, at: r.at };
}
