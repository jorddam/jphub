// 地図: what you've read in nonfiction, as points.
//
// Source: Gyokan's sync file (read-only). When a nonfiction sitting ends, Gyokan saves one record:
//
//   summaries: [{
//     id, book, sig: { title, author, total },     same book fields as its quotes and notes
//     ch, chapter,                                  chapter number and, when known, its title
//     g,                                            character offset where the sitting ended
//     added,                                        ms
//     text,                                         the prose summary of the sitting
//     points: [{ head, text, field, topic, kind, keys }]
//   }]
//
//   head   the point in one line (about 20 characters)
//   text   the point in one or two sentences
//   field  one of FIELDS below (the fixed top level of the map)
//   topic  a free label inside the field; the summariser is given the topics that already exist and reuses them
//   kind   事実 / 主張 / 概念 / 事例
//   keys   1-4 terms or names; points that share one are drawn as connected
//
// A flat `points` list with the same fields is read too. Anything missing falls back gently
// (no field → その他, no topic → 未分類, a summary with no points → one point).

import * as data from "./data.js";

export const FIELDS = [
  { id: "history", ja: "歴史", c: "#e6a23c", also: ["歴史", "history"] },
  { id: "society", ja: "社会", c: "#4aa8ff", also: ["社会", "教育", "society"] },
  { id: "politics", ja: "政治・国際", c: "#ff6b6b", also: ["政治", "国際", "法", "politics"] },
  { id: "economy", ja: "経済・ビジネス", c: "#2fbf71", also: ["経済", "ビジネス", "経営", "金融", "economy", "business"] },
  { id: "science", ja: "科学", c: "#35c9c3", also: ["科学", "自然", "医学", "数学", "science"] },
  { id: "tech", ja: "技術", c: "#8f9bff", also: ["技術", "テクノロジー", "工学", "tech"] },
  { id: "mind", ja: "心・脳", c: "#f48fb1", also: ["心", "脳", "心理", "mind", "psychology"] },
  { id: "thought", ja: "思想・哲学", c: "#b48cf2", also: ["思想", "哲学", "宗教", "philosophy"] },
  { id: "language", ja: "言語", c: "#ffd166", also: ["言語", "言葉", "日本語", "language"] },
  { id: "culture", ja: "文化・芸術", c: "#ff9a62", also: ["文化", "芸術", "文学", "culture", "art"] },
  { id: "life", ja: "暮らし・健康", c: "#9ccc65", also: ["暮らし", "健康", "生活", "life", "health"] },
  { id: "other", ja: "その他", c: "#8b949c", also: [] },
];
const OTHER = FIELDS[FIELDS.length - 1];
export const fieldOf = id => FIELDS.find(f => f.id === id) || OTHER;

export const KINDS = [
  { id: "fact", ja: "事実", also: ["fact"] }, { id: "claim", ja: "主張", also: ["claim", "意見", "opinion"] },
  { id: "concept", ja: "概念", also: ["concept", "定義"] }, { id: "example", ja: "事例", also: ["example", "例"] },
];
export const kindJa = id => KINDS.find(k => k.id === id)?.ja || "";

// Branch colours for the book view, where a branch is a book rather than a field.
const BOOK_COLORS = ["#4aa8ff", "#e6a23c", "#2fbf71", "#f48fb1", "#b48cf2", "#35c9c3", "#ff9a62", "#ffd166", "#9ccc65", "#8f9bff", "#ff6b6b"];

function matchField(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return OTHER;
  return FIELDS.find(f => f.id === s || f.ja === v) || FIELDS.find(f => f.also.some(a => s.includes(a.toLowerCase()))) || OTHER;
}
function matchKind(v) {
  const s = String(v || "").trim().toLowerCase();
  return (KINDS.find(k => k.id === s || k.ja === s || k.also.includes(s)) || {}).id || "";
}
const ms = t => !t ? 0 : typeof t === "number" ? t : (Date.parse(t) || 0);
const firstSentence = t => (String(t || "").match(/^[\s\S]*?[。．！？!?]/) || [String(t || "")])[0].trim();

const GYOKAN_REPO = "jorddam/gyokan-sync";
export async function loadPoints() {
  const { data: g, stale } = await data.readFrom(GYOKAN_REPO, "gyokan.json");
  if (!g || g.app !== "gyokan") return { connected: false, points: [], stale: true };
  const raw = [];
  for (const s of g.summaries || []) {
    const from = { book: s.book, sig: s.sig, ch: s.ch, chapter: s.chapter, g: s.g, pos: s.pos, added: s.added, summary: s.text || "" };
    const list = s.points?.length ? s.points : (s.text ? [{ text: s.text }] : []);
    list.forEach((p, i) => raw.push({ ...from, ...p, id: p.id || `${s.id}:${i}` }));
  }
  for (const p of g.points || []) raw.push(p);

  const seen = new Set(), points = [];
  for (const p of raw) {
    const text = String(p.text || "").trim(), head = String(p.head || "").trim() || firstSentence(text);
    const id = String(p.id ?? "");
    if (!head || !id || seen.has(id)) continue;
    seen.add(id);
    const total = p.sig?.total;
    points.push({
      id, head, text, field: matchField(p.field).id, topic: String(p.topic || "").trim() || "未分類", kind: matchKind(p.kind),
      keys: [...new Set((Array.isArray(p.keys) ? p.keys : []).map(k => String(k).trim()).filter(Boolean))].slice(0, 6),
      book: String(p.book || p.sig?.title || "").trim() || "本の名前なし", author: p.sig?.author || "",
      ch: Number.isFinite(+p.ch) && p.ch != null ? +p.ch : null, chapter: String(p.chapter || "").trim(),
      pos: total && p.g != null ? Math.min(1, p.g / total) : (typeof p.pos === "number" ? p.pos : null),
      at: ms(p.added), quote: String(p.quote || "").trim(), summary: String(p.summary || "").trim(),
    });
  }
  // Reading order: the map only ever grows at the ends of its branches, so what you learned earlier stays put.
  points.sort((a, b) => a.at - b.at || (a.pos ?? 0) - (b.pos ?? 0));
  return { connected: true, points, stale: !!stale };
}

export const FRESH_DAYS = 7;

// The tree a view draws. lens "field": 分野 → 主題 → 点.  lens "book": 本 → 章 → 点.
export function buildTree(points, lens, now = Date.now()) {
  const mk = (id, type, label, extra) => ({ id, type, label, kids: [], count: 0, fresh: 0, ...extra });
  const root = mk("root", "root", "読んだこと");
  const index = new Map();
  const child = (parent, id, type, label, extra) => {
    let n = index.get(id);
    if (!n) { n = mk(id, type, label, extra); index.set(id, n); parent.kids.push(n); }
    return n;
  };
  const leaf = (parent, p) => parent.kids.push(mk("p:" + p.id, "point", p.head, { point: p, color: fieldOf(p.field).c,
    count: 1, fresh: now - p.at < FRESH_DAYS * 86400e3 ? 1 : 0 }));

  if (lens === "book") {
    const chaptered = new Set(points.filter(p => p.chapter || p.ch != null).map(p => p.book));
    const order = [...points].sort((a, b) => (a.ch ?? 1e9) - (b.ch ?? 1e9) || (a.pos ?? 0) - (b.pos ?? 0) || a.at - b.at);
    const books = [...new Set(points.map(p => p.book))];                       // in the order they were first read
    for (const [i, b] of books.entries()) child(root, "b:" + b, "book", b, { color: BOOK_COLORS[i % BOOK_COLORS.length], sub: points.find(p => p.book === b)?.author });
    for (const p of order) {
      const book = index.get("b:" + p.book);
      if (!chaptered.has(p.book)) { leaf(book, p); continue; }
      const key = p.chapter || (p.ch != null ? "§" + p.ch : "章なし");
      leaf(child(book, `c:${p.book}/${key}`, "chapter", key, { color: book.color }), p);
    }
  } else {
    for (const f of FIELDS) if (points.some(p => p.field === f.id)) child(root, "f:" + f.id, "field", f.ja, { color: f.c });
    for (const p of points) {
      const f = index.get("f:" + p.field);
      leaf(child(f, `t:${p.field}/${p.topic}`, "topic", p.topic, { color: f.color }), p);
    }
  }
  (function tally(n) {
    if (n.type === "point") return n;
    n.count = 0; n.fresh = 0;
    for (const k of n.kids) { tally(k); n.count += k.count; n.fresh += k.fresh; }
    return n;
  })(root);
  return root;
}

// Points that share a key with this one, closest first.
export function related(points, p, limit = 12) {
  const mine = new Set(p.keys.map(k => k.toLowerCase()));
  if (!mine.size) return [];
  return points.filter(o => o.id !== p.id).map(o => ({ point: o, shared: o.keys.filter(k => mine.has(k.toLowerCase())) }))
    .filter(r => r.shared.length).sort((a, b) => b.shared.length - a.shared.length || b.point.at - a.point.at).slice(0, limit);
}

export function matches(p, q) {
  const s = q.toLowerCase();
  return [p.head, p.text, p.topic, p.book, fieldOf(p.field).ja, ...p.keys].some(t => (t || "").toLowerCase().includes(s));
}
