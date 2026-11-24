// 地図: turning what Gyokan saved into points, and points into the tree the map draws.
// Nothing in this file touches the page or the network, so it runs in the tests as it is (tests/points.test.js).
//
// When a nonfiction sitting ends, Gyokan saves one record in its sync file:
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
// A flat `points` list with the same fields is read too. What the reader does with imperfect records:
//   no id                    → an id made from the record's own contents, so it stays the same on every load
//   deleted: true            → left out
//   no field, or one it doesn't know → その他 (and listed in the report)
//   no topic                 → 未分類
//   a summary with no points → one point made from its text
//   ＡＩ / AI / ai            → one topic, one keyword (width, case and spacing are ignored when comparing)
//   same title, other author → a different book
// Everything it could not use is counted in the report, with the reason.

export const FIELDS = [
  { id: "history", ja: "歴史", c: "#e6a23c", also: ["歴史", "history"] },
  { id: "society", ja: "社会", c: "#4aa8ff", also: ["社会", "教育", "society"] },
  { id: "politics", ja: "政治・国際", c: "#ff6b6b", also: ["政治", "国際", "法", "法律", "politics"] },
  { id: "economy", ja: "経済・ビジネス", c: "#2fbf71", also: ["経済", "ビジネス", "経営", "金融", "economy", "business"] },
  { id: "science", ja: "科学", c: "#35c9c3", also: ["科学", "自然", "医学", "数学", "science"] },
  { id: "tech", ja: "技術", c: "#8f9bff", also: ["技術", "テクノロジー", "工学", "tech", "technology"] },
  { id: "mind", ja: "心・脳", c: "#f48fb1", also: ["心", "脳", "心理", "mind", "psychology"] },
  { id: "thought", ja: "思想・哲学", c: "#b48cf2", also: ["思想", "哲学", "宗教", "philosophy"] },
  { id: "language", ja: "言語", c: "#ffd166", also: ["言語", "言葉", "日本語", "文法", "language"] },
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

// ---------- comparing text ----------
// tidy: how a label is shown (full-width letters and digits made plain, spaces collapsed).
// fold: how two labels are compared (tidy, and case ignored).
export const tidy = v => String(v ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
export const fold = v => tidy(v).toLowerCase();

// A field name matches when it is one of the field's names exactly, or when it contains one of them:
// 「科学技術」 is 技術, 「歴史哲学」 is 哲学 (the last name in the word wins, as the head of a Japanese compound does).
// One-character names (心, 法) only count as the whole word, or 文法 would be filed under law.
// English names only count as whole words, or "heart" would be art.
const FIELD_NAMES = FIELDS.map(f => {
  const names = [...new Set([f.id, f.ja, ...f.ja.split("・"), ...f.also].map(fold))];
  return { f, exact: new Set(names), inside: names.filter(a => [...a].length >= 2).map(a =>
    /^[a-z]+$/.test(a) ? { a, find: s => { const m = new RegExp("(^|[^a-z])" + a + "(?![a-z])").exec(s); return m ? m.index + m[0].length : -1; } }
      : { a, find: s => { const i = s.lastIndexOf(a); return i < 0 ? -1 : i + a.length; } }) };
});
// The field a label means, or null when it means none of them.
export function matchField(v) {
  const s = fold(v);
  if (!s) return null;
  const whole = FIELD_NAMES.find(x => x.exact.has(s));
  if (whole) return whole.f;
  let best = null;
  for (const x of FIELD_NAMES) for (const n of x.inside) {
    const end = n.find(s);
    if (end < 0) continue;
    if (!best || end > best.end || (end === best.end && n.a.length > best.len)) best = { f: x.f, end, len: n.a.length };
  }
  return best ? best.f : null;
}
export function matchKind(v) {
  const s = fold(v);
  return (KINDS.find(k => k.id === s || k.ja === s || k.also.includes(s)) || {}).id || "";
}

const ms = t => !t ? 0 : typeof t === "number" ? t : /^\d+$/.test(String(t).trim()) ? +t : (Date.parse(t) || 0);
const firstSentence = t => (String(t || "").match(/^[\s\S]*?[。．！？!?]/) || [String(t || "")])[0].trim();
const list = v => Array.isArray(v) ? v : [];
const record = v => v && typeof v === "object" && !Array.isArray(v);
// A short, stable name for a record that came without an id (FNV-1a over its contents).
function stamp(...parts) {
  let x = 0x811c9dc5;
  for (const ch of parts.map(p => String(p ?? "")).join("\u001f")) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193); }
  return (x >>> 0).toString(36);
}

// ---------- Gyokan's file → points ----------
// Returns { points, report }. report: { summaries, points, skipped, why: { reason: n }, unfiled, unknownFields: [label] }.
export function normalise(g) {
  const report = { summaries: 0, points: 0, skipped: 0, why: {}, unfiled: 0, unknownFields: [] };
  const skip = why => { report.skipped++; report.why[why] = (report.why[why] || 0) + 1; };
  const raw = [];
  // A point takes what its sitting knows (book, chapter, date) unless it says otherwise itself.
  const over = (from, p) => { const o = { ...from }; for (const [k, v] of Object.entries(p)) if (v != null) o[k] = v; return o; };

  for (const s of list(g?.summaries)) {
    if (!record(s)) { skip("形が違う"); continue; }
    if (s.deleted) continue;
    report.summaries++;
    const sid = s.id != null && s.id !== "" ? String(s.id) : "s~" + stamp(s.book, s.sig?.title, s.sig?.author, s.added, s.g, s.ch, s.text);
    const from = { book: s.book, sig: s.sig, ch: s.ch, chapter: s.chapter, g: s.g, pos: s.pos, added: s.added, summary: s.text || "" };
    const pts = list(s.points).length ? s.points : (s.text ? [{ text: s.text }] : []);
    if (!pts.length) { skip("中身がない"); continue; }
    pts.forEach((p, i) => {
      if (!record(p)) { skip("形が違う"); return; }
      if (!p.deleted) raw.push(over(from, { ...p, id: p.id != null && p.id !== "" ? p.id : `${sid}:${i}` }));
    });
  }
  for (const p of list(g?.points)) {
    if (!record(p)) { skip("形が違う"); continue; }
    if (!p.deleted) raw.push({ ...p, id: p.id != null && p.id !== "" ? p.id : "p~" + stamp(p.book, p.sig?.title, p.added, p.head, p.text) });
  }

  const seen = new Set(), points = [], topics = new Map(), unknown = new Map();
  for (const p of raw) {
    const text = String(p.text ?? "").trim(), head = String(p.head ?? "").trim() || firstSentence(text);
    const id = String(p.id);
    if (!head) { skip("見出しも本文もない"); continue; }
    if (seen.has(id)) { skip("同じidが二つある"); continue; }
    seen.add(id);
    const f = matchField(p.field);
    if (!f && tidy(p.field)) { report.unfiled++; unknown.set(fold(p.field), tidy(p.field)); }
    const field = (f || OTHER).id;
    // The first spelling of a topic is the one shown; later spellings of the same topic join it.
    const topicKey = field + "/" + (fold(p.topic) || "未分類");
    if (!topics.has(topicKey)) topics.set(topicKey, tidy(p.topic) || "未分類");
    const keys = [], keySeen = new Set();
    for (const k of list(p.keys)) { const t = tidy(k), c = fold(k); if (t && !keySeen.has(c)) { keySeen.add(c); keys.push(t); } }
    const total = p.sig?.total;
    points.push({
      id, head, text, field, topic: topics.get(topicKey), kind: matchKind(p.kind), keys: keys.slice(0, 6),
      book: tidy(p.book || p.sig?.title) || "本の名前なし", author: tidy(p.sig?.author || p.author),
      ch: p.ch != null && p.ch !== "" && Number.isFinite(+p.ch) ? +p.ch : null, chapter: tidy(p.chapter),
      pos: total && p.g != null ? Math.min(1, p.g / total) : (typeof p.pos === "number" ? p.pos : null),
      at: ms(p.added), quote: String(p.quote ?? "").trim(), summary: String(p.summary ?? "").trim(),
    });
  }

  // Which book a point belongs to: title and author together. A record that names no author joins the
  // book of that title when there is only one; when a title has several authors, the author is shown with it.
  const authors = new Map();
  for (const p of points) {
    const t = fold(p.book);
    if (!authors.has(t)) authors.set(t, new Map());
    if (p.author) authors.get(t).set(fold(p.author), p.author);
  }
  for (const p of points) {
    const known = authors.get(fold(p.book));
    if (!p.author && known.size === 1) p.author = [...known.values()][0];
    p.bookId = fold(p.book) + (p.author ? "|" + fold(p.author) : "");
    p.bookLabel = known.size > 1 ? `${p.book}（${p.author || "著者不明"}）` : p.book;
  }

  // Reading order: the map only ever grows at the ends of its branches, so what you learned earlier stays put.
  points.sort((a, b) => a.at - b.at || (a.pos ?? 0) - (b.pos ?? 0));
  report.points = points.length;
  report.unknownFields = [...unknown.values()].slice(0, 12);
  return { points, report };
}

export const FRESH_DAYS = 7;

// ---------- points → the tree a view draws ----------
// lens "field": 分野 → 主題 → 点.  lens "book": 本 → 章 → 点.
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
  const bookOf = p => p.bookId || p.book;

  if (lens === "book") {
    const chaptered = new Set(points.filter(p => p.chapter || p.ch != null).map(bookOf));
    const order = [...points].sort((a, b) => (a.ch ?? 1e9) - (b.ch ?? 1e9) || (a.pos ?? 0) - (b.pos ?? 0) || a.at - b.at);
    const books = new Map();                                                    // in the order they were first read
    for (const p of points) if (!books.has(bookOf(p))) books.set(bookOf(p), p);
    [...books].forEach(([id, p], i) => child(root, "b:" + id, "book", p.bookLabel || p.book, { color: BOOK_COLORS[i % BOOK_COLORS.length], sub: p.author }));
    for (const p of order) {
      const book = index.get("b:" + bookOf(p));
      if (!chaptered.has(bookOf(p))) { leaf(book, p); continue; }
      const key = p.chapter || (p.ch != null ? "§" + p.ch : "章なし");
      leaf(child(book, `c:${bookOf(p)}/${key}`, "chapter", key, { color: book.color }), p);
    }
  } else {
    for (const f of FIELDS) if (points.some(p => p.field === f.id)) child(root, "f:" + f.id, "field", f.ja, { color: f.c });
    for (const p of points) {
      const f = index.get("f:" + p.field);
      leaf(child(f, `t:${p.field}/${fold(p.topic)}`, "topic", p.topic, { color: f.color }), p);
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
  const mine = new Set(p.keys.map(fold));
  if (!mine.size) return [];
  return points.filter(o => o.id !== p.id).map(o => ({ point: o, shared: o.keys.filter(k => mine.has(fold(k))) }))
    .filter(r => r.shared.length).sort((a, b) => b.shared.length - a.shared.length || b.point.at - a.point.at).slice(0, limit);
}

export function matches(p, q) {
  const s = fold(q);
  return [p.head, p.text, p.topic, p.book, p.author, fieldOf(p.field).ja, ...p.keys].some(t => fold(t).includes(s));
}
