// 地図 — what you've read, drawn as a mind map.
//
// 読んだこと in the middle; branches run out to both sides and end in points, one per thing learned.
// Two ways to arrange the same points: by 分野 (field → topic → point) or by 本 (book → chapter → point).
// Drag to move, pinch or scroll to zoom, tap a branch to fold it, tap a point to read it.

import { h, $, clear, topbar, setSync, local, setLocal, toast } from "../lib/core.js";
import * as data from "../lib/data.js";
import { FIELDS, KINDS, FRESH_DAYS, fieldOf, kindJa, loadPoints, buildTree, related, matches, capList,
  applyEdits, editPoint, editTopic, saveEdits, tidy, fold } from "../lib/knowledge.js";

topbar("notebook");

const NS = "http://www.w3.org/2000/svg";
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "text") el.textContent = v; else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clip = (t, n) => t.length > n ? t.slice(0, n - 1) + "…" : t;

const svg = $("#map"), box = $("#mapbox"), panel = $("#panel");
const gView = s("g"), gLinks = s("g"), gTies = s("g"), gNodes = s("g");
gView.append(gLinks, gTies, gNodes);
svg.append(gView);

// Sizes per kind of node. up/down: how far it reaches above and below the line its branch arrives on.
const BRANCH = { size: 15, weight: 700, up: 17, down: 17, pad: 14, gapX: 56, gapY: 26 };
const TWIG = { size: 14, weight: 700, up: 22, down: 11, gapX: 44, gapY: 12 };
const M = {
  root: { size: 17, weight: 900, up: 23, down: 23, pad: 22, max: 12 },
  field: { ...BRANCH, max: 14 }, book: { ...BRANCH, max: 18 },
  topic: { ...TWIG, max: 16 }, chapter: { ...TWIG, max: 18 }, group: { ...TWIG, max: 18 },
  point: { size: 13, weight: 500, up: 12, down: 12, gapX: 36, gapY: 2, max: 24 },
  more: { size: 12.5, weight: 600, up: 12, down: 12, gapX: 36, gapY: 2, max: 20 },
};
const isPill = n => n.type === "field" || n.type === "book";
const isBranch = n => n.type !== "point" && n.type !== "root" && n.type !== "more";
// An open branch shows its newest CAP points and one line for the rest ("ほか N点"), which opens them all.
const CAP = 8;
// How far out the map may go (全体 on a very large map), and the smallest size at which it is still readable.
const MIN_K = 0.02, READ_K = 0.5;

const state = { lens: local("jphub.mapLens", "field") === "book" ? "book" : "field", q: "", sel: null };
let book = { state: "ok", points: [], report: null, stale: false };
let base = [], edits = null;             // the points as Gyokan saved them, and your corrections to them
let hiddenPts = [], rules = [];          // what those corrections come to: points hidden, topic rules in force
let panelMode = null;                    // "edits" while the panel lists the corrections instead of a point
let byPoint = new Map();                 // point id → point
let root = null, byId = new Map(), parentOf = new Map(), pointNode = new Map(), branches = [];
let open = new Set();                    // branches the reader has opened (remembered per view)
let forced = new Set();                  // branches held open by a search
let full = new Set();                    // branches showing every point, not only the newest (until they are closed)
let kept = new Set();                    // points that were chosen: they stay in view even when older than the newest few
let found = new Set();                   // points the search matched: shown while the search is on
let lit = null;                          // when set, only these nodes are at full strength
const cam = { x: 0, y: 0, k: 1, to: null };
let moved = false;                       // has the reader moved the map since it was last fitted?
let refit = null;                        // the view to return to when the window changes size and the map hasn't been moved
const els = new Map();                  // node id → { g, link, x, y } as drawn right now
const still = matchMedia("(prefers-reduced-motion: reduce)"), wideScreen = matchMedia("(min-width: 900px)");

// ---------- measuring ----------
const ctx = document.createElement("canvas").getContext("2d");
let family = getComputedStyle(document.body).fontFamily;
function measure(n) {
  const T = M[n.type];
  n.text = clip(n.label, T.max);
  ctx.font = `${T.weight} ${T.size}px ${family}`;
  const tw = ctx.measureText(n.text).width;
  if (n.type === "root") n.w = tw + T.pad * 2;
  else if (isPill(n)) n.w = tw + 10 + String(n.count).length * 7.5 + T.pad * 2;
  else if (n.type === "point" || n.type === "more") n.w = 18 + tw;
  else n.w = tw + 30;
}

// ---------- the tree for the current view ----------
const openKey = () => "jphub.mapOpen." + state.lens;
const isOpen = n => n.type === "root" || open.has(n.id) || forced.has(n.id);
function saveOpen() { setLocal(openKey(), { open: [...open], known: branches.map(n => n.id) }); }

function setTree() {
  root = buildTree(book.points, state.lens);
  byId = new Map(); parentOf = new Map(); pointNode = new Map();
  (function walk(n, parent) {
    byId.set(n.id, n);
    if (parent) parentOf.set(n.id, parent);
    if (n.point) pointNode.set(n.point.id, n);
    measure(n);
    for (const k of n.kids) walk(k, n);
  })(root, null);
  branches = [...byId.values()].filter(isBranch);
  // What was open last time stays open. A branch that is new since then starts open when it sits next to
  // the middle or holds something read this week, so new reading shows itself.
  const saved = local(openKey(), null), known = new Set(saved?.known || []);
  open = new Set((saved?.open || []).filter(id => byId.has(id)));
  for (const n of branches) {
    if (known.has(n.id)) continue;
    if (parentOf.get(n.id) === root || n.fresh || book.points.length <= 30) open.add(n.id);
  }
  for (const e of els.values()) { e.g.remove(); e.link?.remove(); }
  els.clear();
}

// What an open branch shows. A long list of points, or of the parts a long topic was split into, is cut to
// its newest few plus any that must be seen (chosen, found by the search, opened, or read this week),
// with one line standing for the rest. Fields, books, topics and chapters themselves are never hidden.
function visible(n) {
  if (!isOpen(n)) return [];
  const type = n.kids[0]?.type;
  if ((type !== "point" && type !== "group") || full.has(n.id)) return n.kids;
  // During a search the short list is the matches alone, so the result stays small enough to read.
  const { show, hidden } = capList(n.kids, state.q ? 0 : CAP, k => k.point ? kept.has(k.point.id) || found.has(k.point.id) : kept.has(k.id) || isOpen(k) || (!state.q && k.fresh > 0));
  if (!hidden) return n.kids;
  if (state.q) return show;       // no "ほか" lines among search results
  if (!n.more) n.more = { id: "m:" + n.id, type: "more", label: "", kids: [], count: 0, fresh: 0, color: n.color, owner: n };
  const seen = new Set(show), label = `ほか ${n.kids.reduce((a, k) => a + (seen.has(k) ? 0 : k.count), 0)}点`;
  if (n.more.label !== label) { n.more.label = label; measure(n.more); }
  byId.set(n.more.id, n.more); parentOf.set(n.more.id, n);
  return [n.more, ...show];
}

// ---------- layout: a tidy tree growing out to both sides ----------
function layout() {
  const span = n => {
    const T = M[n.type];
    n.vis = visible(n);
    n.sub = n.vis.reduce((a, k, i) => a + span(k) + (i ? M[k.type].gapY : 0), 0);
    n.span = Math.max(T.up + T.down, n.sub);
    return n.span;
  };
  const place = (n, x, top, dir) => {
    const T = M[n.type];
    n.dir = dir; n.tx = x; n.ty = top + n.span / 2 + (T.up - T.down) / 2;
    let y = top + (n.span - n.sub) / 2;
    n.vis.forEach((k, i) => {
      if (i) y += M[k.type].gapY;
      place(k, x + dir * (n.w + M[k.type].gapX), y, dir);
      y += k.span;
    });
  };
  root.vis = root.kids; root.dir = 1; root.tx = 0; root.ty = 0;
  const half = Math.ceil(root.kids.length / 2);
  for (const [dir, side] of [[1, root.kids.slice(0, half)], [-1, root.kids.slice(half)]]) {
    const total = side.reduce((a, k, i) => a + span(k) + (i ? M[k.type].gapY : 0), 0);
    let y = -total / 2;
    side.forEach((k, i) => {
      if (i) y += M[k.type].gapY;
      place(k, dir * (root.w / 2 + M[k.type].gapX), y, dir);
      y += k.span;
    });
  }
}
function shown() {
  const out = [];
  (function walk(n) { out.push(n); for (const k of n.vis) walk(k); })(root);
  return out;
}

// ---------- drawing ----------
function dot(n, cx) {
  const c = n.color, kind = n.point.kind;
  if (kind === "claim") return s("circle", { cx, cy: 0, r: 4, class: "hollow", stroke: c, "stroke-width": 2 });
  if (kind === "concept") return s("rect", { x: cx - 3.8, y: -3.8, width: 7.6, height: 7.6, fill: c, transform: `rotate(45 ${cx} 0)` });
  if (kind === "example") return s("rect", { x: cx - 4, y: -4, width: 8, height: 8, rx: 1.5, fill: c });
  return s("circle", { cx, cy: 0, r: 4.5, fill: c });
}
function paint(e) {
  const n = e.n, T = M[n.type], dir = n.dir;
  const opened = isOpen(n) && n.kids.length > 0, dim = !!lit && !lit.has(n.id), sel = !!n.point && n.point.id === state.sel;
  // Dimming is only a class, so choosing a point on a big map doesn't rebuild every node.
  const cls = `${n.type}${dim ? " dim" : ""}${sel ? " sel" : ""}`;
  if (e.cls !== cls) { e.cls = cls; e.g.setAttribute("class", "nd " + cls); e.link?.setAttribute("class", `ln ${n.type}${dim ? " dim" : ""}`); }
  // Draw a node again only when something about it has changed: on a big map most of it hasn't.
  const sig = [dir, n.text, n.w, n.count, n.fresh > 0, opened, sel].join("|");
  if (e.sig === sig) return;
  e.sig = sig; e.dirty = true;
  const g = clear(e.g);
  const left = n.type === "root" ? -n.w / 2 : dir > 0 ? 0 : -n.w, anchor = dir > 0 ? "start" : "end";
  g.dataset.id = n.id;
  g.setAttribute("tabindex", "0");
  g.setAttribute("role", "button");
  g.setAttribute("aria-label", n.type === "point" ? n.label : n.type === "root" ? "読んだこと（全体を表示）" : n.type === "more" ? `${n.label}を表示` : `${n.label} ${n.count}点`);
  if (isBranch(n)) g.setAttribute("aria-expanded", String(opened));
  g.append(s("rect", { class: "hit", x: left - 3, y: -T.up, width: n.w + 6, height: T.up + T.down, rx: 8 }));
  if (n.text !== n.label) g.append(s("title", { text: n.label }));

  if (n.type === "root") {
    g.append(s("rect", { class: "core", x: left, y: -T.up, width: n.w, height: T.up + T.down, rx: T.up }),
      s("text", { "text-anchor": "middle", dy: ".35em", text: n.text }));
  } else if (isPill(n)) {
    g.append(s("rect", { x: left, y: -T.up, width: n.w, height: T.up + T.down, rx: T.up, fill: n.color, "fill-opacity": opened ? 0.13 : 0.26,
        stroke: n.color, "stroke-width": 1.5 }),
      s("text", { x: left + T.pad, dy: ".35em", fill: n.color, text: n.text }),
      s("text", { class: "cnt", x: left + n.w - T.pad, "text-anchor": "end", dy: ".35em", text: n.count }));
  } else if (n.type === "point") {
    if (n.point.id === state.sel) g.append(s("circle", { class: "selring", cx: dir * 7, cy: 0, r: 9 }));
    else if (n.fresh) g.append(s("circle", { class: "halo", cx: dir * 7, cy: 0, r: 8.5, stroke: n.color }));
    g.append(dot(n, dir * 7), s("text", { x: dir * 18, "text-anchor": anchor, dy: ".35em", text: n.text }));
  } else if (n.type === "more") {
    g.append(s("circle", { class: "ring", cx: dir * 7, cy: 0, r: 5 }), s("text", { x: dir * 18, "text-anchor": anchor, dy: ".35em", text: n.text }));
  } else {
    // A topic: its name written on the branch, and a bead at the end that folds it.
    g.append(s("line", { x1: 0, y1: 0, x2: dir * (n.w - 20), y2: 0, stroke: n.color, "stroke-width": 2.6, "stroke-linecap": "round" }),
      s("text", { x: dir * 2, y: -8, "text-anchor": anchor, text: n.text }),
      s("circle", { class: "bead" + (opened ? " open" : ""), cx: dir * (n.w - 10), cy: 0, r: 10, fill: n.color, stroke: n.color, "stroke-width": 1.6 }));
    if (!opened) g.append(s("text", { class: "bn", x: dir * (n.w - 10), "text-anchor": "middle", dy: ".35em", text: n.count }));
  }
  if (!opened && n.fresh && isBranch(n)) g.append(s("circle", { class: "newdot", cx: dir * (n.w + 9), cy: 0, r: 3.5 }));
  e.link?.setAttribute("stroke", n.color);
}

const outX = e => e.x + (e.n.type === "root" ? 0 : e.n.dir * e.n.w);
function curve(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, f = v => v.toFixed(1);
  return `M${f(x1)} ${f(y1)}C${f(mx)} ${f(y1)} ${f(mx)} ${f(y2)} ${f(x2)} ${f(y2)}`;
}
function applyCam() {
  gView.setAttribute("transform", `translate(${cam.x.toFixed(1)} ${cam.y.toFixed(1)}) scale(${cam.k.toFixed(4)})`);
  svg.classList.toggle("far", cam.k < READ_K);       // points lose their words
  svg.classList.toggle("vfar", cam.k < 0.26);        // and then the topics do
}

// Dashed lines from the chosen point to the points it shares a keyword with.
let ties = [];
function setTies() {
  clear(gTies); ties = [];
  const p = byPoint.get(state.sel), from = p && pointNode.get(p.id);
  if (!from || !els.has(from.id)) return;
  for (const r of related(book.points, p, 40)) {
    const to = pointNode.get(r.point.id);
    if (!to || !els.has(to.id)) continue;
    const path = s("path", { class: "tie" });
    gTies.append(path);
    ties.push({ a: els.get(from.id), b: els.get(to.id), path });
  }
}
function drawTies() {
  for (const t of ties) {
    const x1 = t.a.x + t.a.n.dir * 7, x2 = t.b.x + t.b.n.dir * 7, y1 = t.a.y, y2 = t.b.y;
    const bend = clamp(Math.hypot(x2 - x1, y2 - y1) * 0.18, 12, 90), f = v => v.toFixed(1);
    const nx = -(y2 - y1), ny = x2 - x1, len = Math.hypot(nx, ny) || 1;
    t.path.setAttribute("d", `M${f(x1)} ${f(y1)}Q${f((x1 + x2) / 2 + nx / len * bend)} ${f((y1 + y2) / 2 + ny / len * bend)} ${f(x2)} ${f(y2)}`);
  }
}

// Move everything from where it is to where the layout wants it.
let raf = 0;
function animate(ms = 260) {
  cancelAnimationFrame(raf);
  if (still.matches || document.hidden) ms = 0;
  // Only what has somewhere to go is touched on each frame; on a big map most of it is standing still.
  for (const e of els.values()) {
    e.x0 = e.x; e.y0 = e.y;
    e.go = e.born || e.dirty || e.x !== e.n.tx || e.y !== e.n.ty;
    e.dirty = false;
  }
  const going = [...els.values()].filter(e => e.go), links = [...els.values()].filter(e => e.link && (e.go || els.get(e.parent.id).go));
  if (cam.to) Object.assign(cam.to, { x0: cam.x, y0: cam.y, k0: cam.k });
  const t0 = performance.now();
  const frame = now => {
    const t = ms ? clamp((now - t0) / ms, 0, 1) : 1, k = 1 - Math.pow(1 - t, 3);
    for (const e of going) {
      e.x = e.x0 + (e.n.tx - e.x0) * k; e.y = e.y0 + (e.n.ty - e.y0) * k;
      e.g.setAttribute("transform", `translate(${e.x.toFixed(1)} ${e.y.toFixed(1)})`);
      if (e.born) { e.g.setAttribute("opacity", k.toFixed(2)); e.link?.setAttribute("opacity", k.toFixed(2)); }
    }
    for (const e of links) {
      const p = els.get(e.parent.id);
      e.link.setAttribute("d", curve(p.n.type === "root" ? p.x + e.n.dir * p.n.w / 2 : outX(p), p.y, e.x, e.y));
    }
    drawTies();
    if (cam.to) { const c = cam.to; cam.x = c.x0 + (c.x - c.x0) * k; cam.y = c.y0 + (c.y - c.y0) * k; cam.k = c.k0 + (c.k - c.k0) * k; applyCam(); }
    if (t < 1) { raf = requestAnimationFrame(frame); return; }
    cam.to = null;
    // Land exactly, so a node that has arrived is not taken for one still on its way next time.
    for (const e of going) { e.x = e.n.tx; e.y = e.n.ty; if (e.born) { e.born = false; e.g.removeAttribute("opacity"); e.link?.removeAttribute("opacity"); } }
  };
  frame(t0);
}

function draw(ms) {
  layout();
  const seen = new Set();
  (function walk(n, parent) {
    seen.add(n.id);
    let e = els.get(n.id);
    if (!e) {
      const from = parent && els.get(parent.id);
      e = { g: s("g"), link: parent ? s("path") : null, x: from ? from.x : n.tx, y: from ? from.y : n.ty, born: !!from };
      els.set(n.id, e);
      gNodes.append(e.g);
      if (e.link) gLinks.append(e.link);
    }
    e.n = n; e.parent = parent;
    paint(e);
    for (const k of n.vis) walk(k, n);
  })(root, null);
  for (const [id, e] of els) if (!seen.has(id)) { e.g.remove(); e.link?.remove(); els.delete(id); }
  setTies();
  animate(ms);
}

// ---------- the camera ----------
function area() {
  // The part of the box the reading panel leaves free: it sits at the side on wide screens, at the bottom otherwise.
  const W = box.clientWidth, H = box.clientHeight, on = !panel.hidden;
  return { W: on && wideScreen.matches ? W - 364 : W, H: on && !wideScreen.matches ? H - panel.offsetHeight : H };
}
function boundsOf(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of list) {
    const T = M[n.type], l = n.type === "root" ? -n.w / 2 : n.dir > 0 ? n.tx : n.tx - n.w;
    x0 = Math.min(x0, l); x1 = Math.max(x1, l + n.w); y0 = Math.min(y0, n.ty - T.up); y1 = Math.max(y1, n.ty + T.down);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function camFor(list, maxK = 1.1, minK = MIN_K) {
  const b = boundsOf(list), a = area(), pad = 36;
  const k = clamp(Math.min((a.W - pad * 2) / (b.w || 1), (a.H - pad * 2) / (b.h || 1)), minK, maxK);
  return { k, x: a.W / 2 - k * (b.x0 + b.w / 2), y: a.H / 2 - k * (b.y0 + b.h / 2) };
}
const allCam = () => camFor(shown());
// Where the map opens: all of it while that is still readable; once it has outgrown the window,
// the middle and its first branches at a readable size, with the rest a drag (or 全体) away.
function homeCam() {
  const c = allCam();
  return c.k >= READ_K ? c : camFor([root, ...root.vis], 1.1, 0.34);
}
// Shift the view just enough to bring these nodes on screen, when they fit.
function nudgeTo(list, base = cam.to || cam) {
  const b = boundsOf(list), a = area(), pad = 24, k = base.k;
  let { x, y } = base;
  if (b.w * k <= a.W - pad * 2) x += Math.max(0, pad - (b.x0 * k + x)) - Math.max(0, b.x1 * k + x - (a.W - pad));
  if (b.h * k <= a.H - pad * 2) y += Math.max(0, pad - (b.y0 * k + y)) - Math.max(0, b.y1 * k + y - (a.H - pad));
  return { x, y, k };
}
function zoomAt(mx, my, factor) {
  const k = clamp(cam.k * factor, MIN_K, 2.6);
  cam.to = null; moved = true;
  cam.x = mx - (mx - cam.x) * k / cam.k; cam.y = my - (my - cam.y) * k / cam.k; cam.k = k;
  applyCam();
}
function fit() { cam.to = allCam(); moved = false; refit = allCam; animate(320); }

// ---------- what a tap does ----------
function toggle(n) {
  const was = { x: n.tx, y: n.ty };
  moved = true;
  if (isOpen(n)) { open.delete(n.id); forced.delete(n.id); full.delete(n.id); } else open.add(n.id);
  kept.add(n.id);                 // a branch you have touched stays in view when its list is cut short
  saveOpen();
  layout();
  // The branch you tapped stays under your finger; the rest of the map makes room around it.
  cam.to = { x: cam.x - (n.tx - was.x) * cam.k, y: cam.y - (n.ty - was.y) * cam.k, k: cam.k };
  if (isOpen(n)) cam.to = nudgeTo([n, ...n.vis]);
  draw();
}
// "ほか N点": show every point of that branch. Closing the branch brings back the short list.
function showAll(more) {
  const n = more.owner, was = { x: n.tx, y: n.ty };
  moved = true;
  full.add(n.id);
  layout();
  cam.to = { x: cam.x - (n.tx - was.x) * cam.k, y: cam.y - (n.ty - was.y) * cam.k, k: cam.k };
  draw();
}
function setLit() {
  let pts = null;
  if (state.sel && byPoint.has(state.sel)) { const p = byPoint.get(state.sel); pts = [p, ...related(book.points, p, 40).map(r => r.point)]; }
  else if (state.q) pts = book.points.filter(p => matches(p, state.q));
  lit = pts && new Set(["root"]);
  for (const p of pts || []) for (let n = pointNode.get(p.id); n; n = parentOf.get(n.id)) lit.add(n.id);
  return pts;
}
function select(id, travel = false, ms) {
  state.sel = id && byPoint.has(id) ? id : null;
  if (state.sel) { kept.add(state.sel); panelMode = null; }
  const n = state.sel && pointNode.get(state.sel);
  if (n) { for (let p = parentOf.get(n.id); p; p = parentOf.get(p.id)) open.add(p.id); saveOpen(); }
  setLit();
  showPanel();
  layout();
  if (n) {
    // Go to the point when asked to, or when the map is too far out to read it; otherwise only make sure it is on screen.
    const a = area(), k = Math.max(cam.k, 0.85);
    cam.to = travel || cam.k < 0.7 ? { k, x: a.W / 2 - k * (n.tx + n.dir * n.w / 2), y: a.H / 2 - k * n.ty } : nudgeTo([n]);
    moved = true;
  }
  draw(ms);
}
function activate(id) {
  const n = byId.get(id);
  if (!n) return;
  if (n.type === "root") fit(); else if (n.type === "point") select(n.point.id); else if (n.type === "more") showAll(n); else toggle(n);
}
let beforeSearch = null;                 // where the map was when the search began, to go back to when it ends
function search(q) {
  if (q && !state.q) beforeSearch = { x: (cam.to || cam).x, y: (cam.to || cam).y, k: (cam.to || cam).k };
  state.q = q; state.sel = null;
  forced = new Set();
  const hits = setLit();
  found = new Set(q ? hits.map(p => p.id) : []);
  if (q) for (const p of hits) for (let n = parentOf.get(pointNode.get(p.id).id); n; n = parentOf.get(n.id)) forced.add(n.id);
  showPanel();
  layout();
  if (q && hits.length) cam.to = camFor(hits.map(p => pointNode.get(p.id)), 1, 0.12);
  else if (!q && beforeSearch) { cam.to = beforeSearch; beforeSearch = null; }
  draw();
  stats(q ? hits.length : null);
}

// ---------- the reading panel ----------
const dateJa = t => { if (!t) return ""; const d = new Date(t); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
function showPanel() {
  const p = byPoint.get(state.sel);
  if (!p) {
    if (panelMode === "edits" && editCount()) showEdits(); else { panelMode = null; panel.hidden = true; }
    return;
  }
  const f = fieldOf(p.field), rel = related(book.points, p);
  const where = [p.chapter || (p.ch != null ? "§" + p.ch : ""), p.pos != null ? Math.round(p.pos * 100) + "%" : ""].filter(Boolean).join(" · ");
  clear(panel).append(...[
    h("button", { class: "close", type: "button", text: "閉じる ✕", onclick: () => select(null) }),
    h("div", { class: "crumb" }, h("span", { class: "sw", style: { background: f.c } }), h("span", { text: `${f.ja} › ${p.topic}` }),
      p.kind ? h("span", { class: "tag jp", text: kindJa(p.kind) }) : null),
    p.was ? h("p", { class: "was", text: `もとは ${fieldOf(p.was.field).ja} › ${p.was.topic}` }) : null,
    h("h2", { text: p.head }),
    p.text && p.text !== p.head ? h("p", { class: "say", text: p.text }) : null,
    p.quote ? h("blockquote", { class: "src", text: p.quote }) : null,
    h("dl", { class: "kv" }, h("dt", { text: "本" }), h("dd", { text: [p.book, p.author].filter(Boolean).join(" · ") }),
      where ? [h("dt", { text: "場所" }), h("dd", { text: where })] : null,
      p.at ? [h("dt", { text: "読んだ日" }), h("dd", { text: dateJa(p.at) })] : null),
    p.keys.length ? h("div", { class: "field" }, h("span", { class: "lab", text: "キーワード" }),
      h("div", { class: "chips" }, p.keys.map(k => h("button", { class: "chip", type: "button", text: k, onclick: () => { $("#q").value = k; search(k); } })))) : null,
    rel.length ? h("div", { class: "field" }, h("span", { class: "lab", text: `つながり（${rel.length}）` }),
      h("ul", { class: "rel" }, rel.map(r => h("li", {}, h("button", { type: "button", onclick: () => select(r.point.id, true) },
        h("span", { class: "sw", style: { background: fieldOf(r.point.field).c } }), h("span", { class: "t", text: r.point.head }),
        h("span", { class: "m", text: `${r.shared.join("・")} — ${r.point.book}` })))))) : null,
    p.summary ? h("details", { class: "sum" }, h("summary", { text: "この回の要約" }), h("p", { text: p.summary })) : null,
    h("div", { class: "btnrow" }, h("a", { class: "btn", href: "./?work=" + encodeURIComponent(p.book), text: "この本のノート" })),
    editRow(p),
  ].filter(Boolean));
  panel.hidden = false;
  panel.scrollTop = 0;
}

// ---------- your corrections: move a point, fix a topic, hide a point ----------
// They are saved in the hub's own data (state/knowledge.json) and laid over what Gyokan saved; Gyokan's file is never written.
function recompute() {
  const r = applyEdits(base, edits);
  book.points = r.points; hiddenPts = r.hidden; rules = r.rules;
  byPoint = new Map(book.points.map(p => [p.id, p]));
}
const editCount = () => hiddenPts.length + rules.length + book.points.filter(p => p.own).length;

// Draw the map again after a correction, without sending the reader back to the start. selId: the point to show afterwards.
function redraw(selId) {
  recompute();
  if (!book.points.length) { start(); return; }
  state.q = ""; $("#q").value = ""; found = new Set(); forced = new Set(); beforeSearch = null;
  setTree();
  stats(null);
  if (selId && byPoint.has(selId)) { select(selId, true, 0); return; }
  state.sel = null; lit = null;
  showPanel();
  layout();
  draw(0);
}

// Make a correction: show it at once, then save it. op(file) returns the corrected file, and is applied again
// to the newest saved copy, so a correction made on another device in the meantime is kept.
let saving = Promise.resolve(), waiting = 0;
function commit(op, selId) {
  edits = op(edits);
  redraw(selId);
  waiting++;
  saving = saving.then(() => saveEdits(op)).then(saved => {
    // What was saved can differ from what is shown only if another device saved something in between.
    if (--waiting === 0 && JSON.stringify(saved) !== JSON.stringify(edits)) { edits = saved; redraw(state.sel); }
  }).catch(e => {
    waiting = 0;
    console.error(e);
    toast("保存できませんでした。通信を確かめて、もう一度試してください。", 6000);
    return load();                // back to what is really saved
  });
  return saving;
}

function editRow(p) {
  const row = h("div", { class: "edit" });
  const link = (text, onclick) => h("button", { class: "linkbtn", type: "button", text, onclick });
  const idle = () => row.replaceChildren(h("div", { class: "editrow" },
    link("点を移す", () => form("point")), link("主題を直す", () => form("topic")),
    link("隠す", () => { commit(e => editPoint(e, p.id, { hidden: true }), null); toast("隠しました。上の「編集」から戻せます。", 5000); }),
    p.own ? link("元に戻す", () => commit(e => editPoint(e, p.id, null), p.id)) : null));
  const form = what => {
    const topicsIn = f => [...new Set(book.points.filter(o => o.field === f).map(o => o.topic))];
    const field = h("select", { "aria-label": "分野" }, FIELDS.map(f => h("option", { value: f.id, text: f.ja })));
    field.value = p.field;
    const listId = "topics-" + what, names = h("datalist", { id: listId });
    const fill = () => names.replaceChildren(...topicsIn(field.value).map(t => h("option", { value: t })));
    fill();
    field.addEventListener("change", fill);
    const name = h("input", { type: "text", value: p.topic, list: listId, maxlength: "40", autocomplete: "off", "aria-label": "主題" });
    const count = book.points.filter(o => o.field === p.field && o.topic === p.topic).length;
    const save = () => {
      let topic = tidy(name.value) || "未分類";
      // The name of a topic that is already there means that topic, however it was typed;
      // unless this is the topic itself, where changing the spelling is the point.
      const there = topicsIn(field.value).find(t => fold(t) === fold(topic));
      if (there && !(what === "topic" && field.value === p.field && fold(topic) === fold(p.topic))) topic = there;
      if (field.value === p.field && topic === p.topic) { idle(); return; }
      const to = { field: field.value, topic };
      if (what === "point") commit(e => editPoint(e, p.id, to), p.id);
      else commit(e => editTopic(e, { field: p.field, topic: p.topic }, to), p.id);
    };
    name.addEventListener("keydown", e => { if (e.key === "Enter") save(); else if (e.key === "Escape") idle(); });
    row.replaceChildren(h("div", { class: "editform" },
      h("span", { class: "lab", text: what === "point" ? "この点を移す" : `主題「${p.topic}」を直す` }),
      field, name, names,
      h("p", { class: "hint", text: what === "point" ? "この点だけが移ります。"
        : `この主題の ${count}点すべてが移ります。すでにある主題の名前にすると、一つにまとまります。` }),
      h("div", { class: "btnrow" }, h("button", { class: "btn primary", type: "button", text: "保存", onclick: save }),
        h("button", { class: "btn", type: "button", text: "やめる", onclick: idle }))));
    name.focus({ preventScroll: true });
    name.select();
    panel.scrollTop = panel.scrollHeight;       // the form is the last thing in the panel: bring it into view
  };
  idle();
  return row;
}

// Everything you have corrected, each with a way back.
function showEdits() {
  const place = (f, t) => `${fieldOf(f).ja} › ${t}`;
  const line = (label, sub, undo) => h("li", {}, h("div", {}, h("span", { class: "t", text: label }), h("span", { class: "m", text: sub })),
    h("button", { class: "linkbtn", type: "button", text: "戻す", onclick: undo }));
  const part = (title, rows) => rows.length ? h("div", { class: "field" }, h("span", { class: "lab", text: `${title}（${rows.length}）` }), h("ul", { class: "undo" }, rows)) : null;
  panel.replaceChildren(...[
    h("button", { class: "close", type: "button", text: "閉じる ✕", onclick: () => { panelMode = null; showPanel(); } }),
    h("h2", { text: "編集したもの" }),
    h("p", { class: "hint", text: "ここでの編集はハブだけのものです。行間のデータは変わりません。" }),
    part("隠した点", hiddenPts.map(p => line(p.head, p.bookLabel || p.book, () => commit(e => editPoint(e, p.id, { hidden: false }), null)))),
    part("直した主題", rules.map(r => line(place(r.wasField, r.was), "→ " + place(r.field, r.topic),
      () => commit(e => editTopic(e, { field: r.wasField, topic: r.was }, null), null)))),
    part("移した点", book.points.filter(p => p.own).map(p => line(p.head, (p.was ? place(p.was.field, p.was.topic) + " → " : "") + place(p.field, p.topic),
      () => commit(e => editPoint(e, p.id, null), null)))),
  ].filter(Boolean));
  panel.hidden = false;
}

// ---------- toolbar ----------
function stats(found) {
  const pts = book.points, fresh = pts.filter(p => Date.now() - p.at < FRESH_DAYS * 86400e3).length;
  const el = clear($("#stats"));
  el.append(!pts.length ? "" : found != null ? `${found}件 / ${pts.length}点`
    : [`${pts.length}点`, `${new Set(pts.map(p => p.bookId)).size}冊`, fresh ? `この${FRESH_DAYS}日で ${fresh}点` : ""].filter(Boolean).join(" · "));
  // Records the reader could not use, or could not file: say so, and say why when asked.
  const r = book.report, odd = r ? r.skipped + r.unfiled : 0;
  if (odd && found == null) el.append(pts.length ? " · " : "", h("button", { class: "linkbtn", type: "button", text: `要確認 ${odd}件`, onclick: () => toast(oddities(r), 9000) }));
  // Your own corrections: how many, and a way to see them and take them back.
  const mine = editCount();
  if (mine && found == null) el.append(pts.length || odd ? " · " : "", h("button", { class: "linkbtn", type: "button", text: `編集 ${mine}件`,
    onclick: () => { panelMode = "edits"; if (state.sel) select(null); else showPanel(); } }));
}
function oddities(r) {
  const out = [];
  if (r.skipped) out.push(`読めなかった記録 ${r.skipped}件（${Object.entries(r.why).map(([why, n]) => `${why} ${n}`).join("、")}）`);
  if (r.unfiled) out.push(`分野が分からず「その他」に入れた点 ${r.unfiled}件（${r.unknownFields.join("、")}）`);
  return out.join("。") + "。";
}
const EMPTY = {
  none: "未接続です。設定でトークンを入れると、ここに地図が出ます。",
  denied: "行間の同期ファイルを読めませんでした。設定のトークンに gyokan-sync を読む権限があるか確かめてください。",
  missing: "行間の同期ファイルが見つかりません。トークンが gyokan-sync を読めるか、行間で同期を入れてあるかを確かめてください。",
  foreign: "同期ファイルはありますが、行間のものではないようです。",
  error: "読み込めませんでした。通信を確かめて、右上の「更新」でもう一度試してください。",
  ok: "まだ点がありません。行間でノンフィクションを読み、閉じるときの要約が保存されると、読んだことがここに点として増えていきます。",
};
function lensButtons() {
  clear($("#lens")).append(...[["field", "分野"], ["book", "本"]].map(([id, ja]) =>
    h("button", { type: "button", "aria-pressed": String(state.lens === id), text: ja, onclick: () => {
      if (state.lens === id) return;
      state.lens = id; setLocal("jphub.mapLens", id);
      lensButtons(); start();
    } })));
}
function legend() {
  const mark = (kind, fresh) => {
    const n = { color: "#9ba3aa", point: { kind } };
    return s("svg", { viewBox: "-10 -10 20 20", width: 16, height: 16 }, fresh ? s("circle", { class: "halo", r: 8.5, stroke: "#9ba3aa" }) : null, dot(n, 0));
  };
  clear($("#legend")).append(...KINDS.map(k => h("span", {}, mark(k.id), k.ja)), h("span", {}, mark("fact", true), `この${FRESH_DAYS}日`));
}

// ---------- moving the map: drag, pinch, wheel, keys ----------
const ptrs = new Map();
let drag = null, pinch = null;
const at = e => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
svg.addEventListener("pointerdown", e => {
  if (e.button) return;
  svg.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, at(e));
  if (ptrs.size === 1) drag = { id: e.target.closest?.("[data-id]")?.dataset.id || null, ...at(e), cx: cam.x, cy: cam.y, moved: false };
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: cam.k, wx: ((a.x + b.x) / 2 - cam.x) / cam.k, wy: ((a.y + b.y) / 2 - cam.y) / cam.k };
    if (drag) drag.moved = true;
  }
});
svg.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, at(e));
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.to = null; moved = true;
    cam.k = clamp(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, MIN_K, 2.6);
    cam.x = mx - pinch.wx * cam.k; cam.y = my - pinch.wy * cam.k;
    applyCam();
  } else if (ptrs.size === 1 && drag) {
    const p = at(e), dx = p.x - drag.x, dy = p.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; cam.to = null; moved = true;
    svg.classList.add("drag");
    cam.x = drag.cx + dx; cam.y = drag.cy + dy;
    applyCam();
  }
});
function lift(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size === 1) {            // one finger left after a pinch: carry on as a drag from here
    const [p] = [...ptrs.values()];
    pinch = null; drag = { id: null, ...p, cx: cam.x, cy: cam.y, moved: true };
    return;
  }
  svg.classList.remove("drag");
  const d = drag;
  drag = null; pinch = null;
  if (!d || d.moved || e.type === "pointercancel") return;
  if (d.id) activate(d.id); else if (state.sel || panelMode) { panelMode = null; select(null); }
}
svg.addEventListener("pointerup", lift);
svg.addEventListener("pointercancel", lift);
svg.addEventListener("wheel", e => {
  e.preventDefault();
  const p = at(e);
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
}, { passive: false });
svg.addEventListener("keydown", e => {
  const id = e.target.closest?.("[data-id]")?.dataset.id;
  if (id && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); activate(id); }
  else if (e.key === "Escape" && (state.sel || panelMode)) { panelMode = null; select(null); }
});
const mid = () => ({ x: area().W / 2, y: area().H / 2 });
$("#zin").addEventListener("click", () => zoomAt(mid().x, mid().y, 1.3));
$("#zout").addEventListener("click", () => zoomAt(mid().x, mid().y, 1 / 1.3));
$("#zfit").addEventListener("click", fit);

let typing = 0;
$("#q").addEventListener("input", e => { clearTimeout(typing); typing = setTimeout(() => search(e.target.value.trim()), 180); });

function sizeBox() { box.style.setProperty("height", Math.max(420, innerHeight - box.offsetTop - 16) + "px"); }
addEventListener("resize", sizeBox);
// When the window changes size (or the iPad turns): refit if the map hasn't been moved yet, otherwise keep its middle in the middle.
let seenW = 0, seenH = 0;
new ResizeObserver(() => {
  const W = box.clientWidth, H = box.clientHeight;
  if (root && seenW && (W !== seenW || H !== seenH)) {
    cam.to = null;
    if (moved || !refit) { cam.x += (W - seenW) / 2; cam.y += (H - seenH) / 2; } else Object.assign(cam, refit());
    applyCam();
  }
  seenW = W; seenH = H;
}).observe(box);

// ---------- start ----------
function start() {
  const any = book.points.length > 0;
  $("#empty").hidden = any;
  svg.toggleAttribute("hidden", !any);
  for (const id of ["#legend", "#lens", "#q"]) $(id).hidden = !any;
  document.querySelector(".mctl").hidden = !any;
  stats(null);
  if (!any) {
    panel.hidden = true; panelMode = null;
    $("#empty").textContent = hiddenPts.length ? "すべての点を隠しています。上の「編集」から戻せます。" : EMPTY[book.state] || EMPTY.error;
    return;
  }
  panelMode = null;
  state.sel = null; forced = new Set(); full = new Set(); kept = new Set(); found = new Set(); lit = null; state.q = ""; $("#q").value = "";
  beforeSearch = null;
  panel.hidden = true;
  setTree();
  layout();
  Object.assign(cam, homeCam(), { to: null });
  moved = false; refit = homeCam;
  seenW = box.clientWidth; seenH = box.clientHeight;      // the view above is for this size; only a later change needs handling
  applyCam();
  draw(0);
}

async function load() {
  setSync("busy", "読み込み中…");
  try {
    book = await loadPoints();
    base = book.base || []; edits = book.edits || null;
    recompute();
    sizeBox();
    lensButtons();
    legend();
    start();
    // Say what was actually read: a failed fetch is not "synced", and a saved copy is not the latest.
    const good = book.state === "ok" && !book.stale;
    setSync(good ? "ok" : "bad", book.state === "none" ? "未接続" : book.state !== "ok" ? "読み込めませんでした"
      : book.stale ? "オフライン（保存した分）" : data.mode === "dev" ? "サンプルデータ" : "同期済み", () => load());
  } catch (e) {
    console.error(e);
    book = { state: "error", points: [], report: null, stale: true };
    base = []; edits = null; hiddenPts = []; rules = [];
    byPoint = new Map();
    start();
    setSync("bad", "読み込めませんでした", () => load());
  }
}

// Labels are measured with the page's fonts, so measure again once they have arrived.
document.fonts?.ready.then(() => {
  family = getComputedStyle(document.body).fontFamily;
  if (!root) return;
  for (const n of byId.values()) measure(n);
  draw(0);
});
load();
