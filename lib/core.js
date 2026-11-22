// Small shared helpers. Everything on a page is built with h(), which only ever
// sets text, so text from the sheet, Airtable, Notion or the web can't become HTML.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "href") el.setAttribute("href", safeURL(v));
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Links come from the sheet and from crawled data: allow only web, relative and steam links.
export function safeURL(u) {
  const s = String(u || "").trim();
  if (/^(https?:|steam:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "#";
  return s;
}

// Icons are constants written in this repo (Lucide paths), never data.
export function icon(paths) {
  const t = document.createElement("template");
  t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  return t.content.firstChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function ago(ts) {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 90) return "たった今";
  if (s < 3600) return `${Math.round(s / 60)}分前`;
  if (s < 86400) return `${Math.round(s / 3600)}時間前`;
  return `${Math.round(s / 86400)}日前`;
}

// The hub's day turns over at 4 a.m., so a late night still counts as "today".
export const SHIFT = 4 * 3600 * 1000;
export function dayKey(ts = Date.now()) {
  const d = new Date(ts - SHIFT);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function local(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}
export function setLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}

let toastTimer = 0;
export function toast(msg) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status", text: msg });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

const PAGES = [
  ["home", "今日", ""], ["library", "ライブラリ", "library/"], ["articles", "記事", "articles/"],
  ["notebook", "ノート", "notebook/"], ["settings", "設定", "settings/"],
];

// Renders the shared header into <header id="top">. base is the path back to the hub root.
export function topbar(active, base = "../") {
  const top = $("#top");
  clear(top).className = "top";
  top.append(
    h("h1", {}, h("a", { href: base, text: "日本語ハブ" })),
    h("nav", { class: "nav", "aria-label": "メイン" }, PAGES.map(([id, ja, path]) =>
      h("a", { href: base + path, "aria-current": id === active ? "page" : null, text: ja }))),
    h("div", { class: "sync", id: "sync" }),
  );
}

export function setSync(state, text, onRefresh) {
  const el = $("#sync");
  if (!el) return;
  clear(el).append(h("span", { class: "dot " + state }), h("span", { text }));
  if (onRefresh) el.append(h("button", { class: "linkbtn", type: "button", onclick: onRefresh, text: "更新" }));
}
