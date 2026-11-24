// Reading and writing the private data repo.
//
// Two backends with the same interface:
//   github — the real one: GitHub's contents API with the token from Settings.
//   dev    — on localhost: the dev server's /__data/ and /__run/ endpoints.
// Every read is cached in IndexedDB, so pages open with the last copy when offline.

import { local } from "./core.js";

const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const settings = () => local("jphub.gh", null);
export const mode = isLocal && !local("jphub.forceGithub", false) ? "dev" : (settings()?.token ? "github" : "none");

// ---------- cache ----------
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("jphub", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("cache", { keyPath: "path" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch(() => null);
  return dbp;
}
async function cacheGet(path) {
  const d = await db();
  if (!d) return null;
  return new Promise(res => {
    const rq = d.transaction("cache").objectStore("cache").get(path);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => res(null);
  });
}
async function cachePut(rec) {
  const d = await db();
  if (!d) return;
  await new Promise(res => {
    const tx = d.transaction("cache", "readwrite");
    tx.objectStore("cache").put(rec);
    tx.oncomplete = tx.onerror = () => res();
  });
}

// ---------- backends ----------
const GH = "https://api.github.com/repos/";
function ghHeaders(accept) {
  return { Authorization: "Bearer " + settings().token, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
}
const enc = path => path.split("/").map(encodeURIComponent).join("/");
const b64 = text => {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function fetchFile(path, etag) {
  if (mode === "dev") {
    return fetch("/__data/" + enc(path), { headers: etag ? { "If-None-Match": etag } : {}, cache: "no-store" });
  }
  const headers = ghHeaders("application/vnd.github.raw+json");
  if (etag) headers["If-None-Match"] = etag;
  return fetch(GH + settings().repo + "/contents/" + enc(path), { headers, cache: "no-store" });
}

// Read a JSON file. Returns { data, at, stale }. data is null when the file doesn't exist.
export async function read(path) {
  const cached = await cacheGet(path);
  if (mode === "none") return { data: cached?.data ?? null, at: cached?.at, stale: true };
  try {
    const res = await fetchFile(path, cached?.etag);
    if (res.status === 304 && cached) {
      cached.at = Date.now();
      cachePut(cached);
      return { data: cached.data, at: cached.at, stale: false };
    }
    if (res.status === 404) return { data: null, at: Date.now(), stale: false };
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const rec = { path, etag: res.headers.get("ETag"), data, at: Date.now() };
    cachePut(rec);
    return { data, at: rec.at, stale: false };
  } catch (e) {
    if (cached) return { data: cached.data, at: cached.at, stale: true, error: e };
    throw e;
  }
}

// Read a JSON file from another of Jordan's private repos (read-only): Gyokan's and Kikitori's sync files.
// The same token covers them. In dev, a folder named _<repo> in the sample data stands in.
export async function readFrom(repo, path) {
  if (mode === "none") return { data: null, stale: true };
  const key = repo + ":" + path;
  const cached = await cacheGet(key);
  try {
    let res;
    if (mode === "dev") res = await fetch(`/__data/_${repo.split("/").pop()}/${enc(path)}`, { cache: "no-store" });
    else {
      const headers = ghHeaders("application/vnd.github.raw+json");
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      res = await fetch(GH + repo + "/contents/" + enc(path), { headers, cache: "no-store" });
    }
    if (res.status === 304 && cached) return { data: cached.data, at: cached.at, stale: false };
    if (!res.ok) return { data: cached?.data ?? null, at: cached?.at, stale: !!cached, missing: res.status === 404, status: res.status };
    const data = await res.json();
    cachePut({ path: key, etag: res.headers.get("ETag"), data, at: Date.now() });
    return { data, at: Date.now(), stale: false };
  } catch (e) {
    return { data: cached?.data ?? null, at: cached?.at, stale: true };
  }
}

async function ghSha(path) {
  const res = await fetch(GH + settings().repo + "/contents/" + enc(path), { headers: ghHeaders("application/vnd.github+json"), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()).sha;
}

async function put(path, obj, sha, message) {
  const text = JSON.stringify(obj);
  if (mode === "dev") {
    const res = await fetch("/__data/" + enc(path), { method: "PUT", body: text });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return;
  }
  const body = { message, content: b64(text) };
  if (sha) body.sha = sha;
  const res = await fetch(GH + settings().repo + "/contents/" + enc(path), {
    method: "PUT", headers: ghHeaders("application/vnd.github+json"), body: JSON.stringify(body) });
  if (!res.ok) { const err = new Error("HTTP " + res.status); err.status = res.status; throw err; }
}

// Add a new file (an outbox request). Fails if offline; the caller keeps it queued.
export async function create(path, obj) {
  if (mode === "none") throw new Error("not connected");
  await put(path, obj, null, "request " + path.split("/").pop());
}

// Change a small state file: read the latest, apply change(data), write it back.
// If someone else wrote in between (409/422), re-read and try again.
export async function update(path, change) {
  if (mode === "none") throw new Error("not connected");
  for (let attempt = 0; ; attempt++) {
    const sha = mode === "github" ? await ghSha(path) : null;
    const { data } = await read(path);
    const next = change(data);
    try {
      await put(path, next, sha, "update " + path);
      await cachePut({ path, etag: null, data: next, at: Date.now() });
      return next;
    } catch (e) {
      if (attempt >= 2 || ![409, 422].includes(e.status)) throw e;
    }
  }
}

// Ask a background job to run now. In dev it runs at once; on GitHub it starts the workflow.
export async function runJob(name) {
  if (mode === "dev") {
    const res = await fetch("/__run/" + name, { method: "POST" });
    if (!res.ok) throw new Error("job failed");
    return res.json();
  }
  if (mode === "github") {
    const res = await fetch(GH + settings().repo + "/actions/workflows/" + name + ".yml/dispatches", {
      method: "POST", headers: ghHeaders("application/vnd.github+json"), body: JSON.stringify({ ref: "main" }) });
    if (!res.ok) throw new Error("HTTP " + res.status);
  }
  return null;
}

// Run a job and wait until it has finished (on GitHub about half a minute), so the page can read
// what it wrote. Resolves true when the job succeeded, false when it failed or took too long.
export async function runJobAndWait(name, { timeout = 150000, gap = 6000 } = {}) {
  if (mode !== "github") { await runJob(name); return mode === "dev"; }
  const url = GH + settings().repo + "/actions/workflows/" + name + ".yml/runs?per_page=1";
  const latest = async () => {
    const res = await fetch(url, { headers: ghHeaders("application/vnd.github+json"), cache: "no-store" });
    return res.ok ? (await res.json()).workflow_runs?.[0] || null : null;
  };
  const before = (await latest())?.id;
  await runJob(name);
  for (const end = Date.now() + timeout; Date.now() < end;) {
    await new Promise(r => setTimeout(r, gap));
    const run = await latest().catch(() => null);      // a run newer than the one we saw before asking
    if (run && run.id !== before && run.status === "completed") return run.conclusion === "success";
  }
  return false;
}

// A URL for an image stored in the data repo (covers). On GitHub it is fetched with the token.
const blobs = new Map();
export async function imageURL(path) {
  if (mode === "dev") return "/__data/" + enc(path);
  if (mode === "none") return null;
  if (!blobs.has(path)) blobs.set(path, fetchFile(path).then(async r => r.ok ? URL.createObjectURL(await r.blob()) : null).catch(() => null));
  return blobs.get(path);
}
