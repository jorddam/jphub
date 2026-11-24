// 地図: what you've read in nonfiction, as points.
//
// Source: Gyokan's sync file (read-only). The shape it is read in, and what happens to imperfect
// records, is written at the top of points.js, which does the reading; this file only fetches.

import * as data from "./data.js";
import { normalise } from "./points.js";

export * from "./points.js";

const GYOKAN_REPO = "jorddam/gyokan-sync";

// Returns { state, points, report, stale, at }.
//   state  "ok"      the file was read (points may still be empty: nothing saved yet)
//          "none"    no token on this device
//          "denied"  the token may not read Gyokan's sync repo
//          "missing" there is no sync file where it should be (GitHub also answers this for a repo the token can't see)
//          "foreign" a file is there, but it isn't Gyokan's
//          "error"   it could not be fetched and no earlier copy is saved on this device
//   stale  true when the points come from the copy saved on this device because the fetch failed
export async function loadPoints() {
  const none = state => ({ state, connected: false, points: [], report: null, stale: true });
  if (data.mode === "none") return none("none");
  const r = await data.readFrom(GYOKAN_REPO, "gyokan.json");
  if (!r.data) return none(r.status === 401 || r.status === 403 ? "denied" : r.status === 404 ? "missing" : "error");
  if (r.data.app !== "gyokan") return none("foreign");
  const { points, report } = normalise(r.data);
  if (report.skipped || report.unfiled) console.warn("地図: 読めなかった記録があります", report);
  return { state: "ok", connected: true, points, report, stale: !!r.stale, at: r.at };
}
