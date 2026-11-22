// The notebook: one stream of everything you've noted, gathered from each app's own data.
//
//   拾い帳 cards        → word / grammar notes        (Notion snapshot)
//   文型帳 points       → grammar notes               (exported grammar points)
//   Tsundoku Journal    → memos, with curator replies (Notion snapshot)
//   行間 Gyokan         → highlights and handwriting  (its sync file; not connected in the sample)
//   written here        → memos and AI expansions     (notebook/<month>.json)

import * as data from "./data.js";
import { loadHiroicho, loadGrammar, loadJournal } from "./sources.js";

export const KINDS = [
  { id: "word", ja: "言葉", c: "--r" }, { id: "grammar", ja: "文法", c: "--j" },
  { id: "quote", ja: "書き抜き", c: "--h" }, { id: "memo", ja: "メモ", c: "--n" },
];

const month = (d = new Date()) => d.toISOString().slice(0, 7);

async function loadOwn() {
  const now = new Date();
  const months = [0, 1, 2].map(i => month(new Date(now.getFullYear(), now.getMonth() - i, 15)));
  const files = await Promise.all(months.map(m => data.read(`notebook/${m}.json`).catch(() => ({}))));
  return files.flatMap(f => f.data?.entries || []).filter(e => !e.deleted);
}

// Gyokan's sync file, read-only. Shapes follow gyokan/index.html (quotes, notes, vocab).
const GYOKAN_REPO = "jorddam/gyokan-sync";
const day = t => !t ? "" : typeof t === "number" ? new Date(t).toISOString().slice(0, 10) : String(t).slice(0, 10);
async function loadGyokan() {
  const { data: g } = await data.readFrom(GYOKAN_REPO, "gyokan.json");
  if (!g || g.app !== "gyokan") return { connected: false, notes: [] };
  const notes = [
    ...(g.quotes || []).map(q => ({ id: "gq-" + q.id, src: "行間", kind: "quote", head: q.text, work: q.book || "", at: day(q.added), quote: q })),
    ...(g.notes || []).map(n => ({ id: "gn-" + n.id, src: "行間", kind: "memo", head: n.book || "手書きメモ", gloss: n.hand || "", tag: "手書き",
      work: n.book || "", at: day(n.added), entry: { note: n.hand, comment: n.comment } })),
    ...(g.vocab || []).map(v => ({ id: "gv-" + v.id, src: "行間", kind: "word", head: v.word, reading: v.read, gloss: v.gloss, tag: "単語",
      work: v.book || "", at: day(v.added), vocab: v })),
  ];
  return { connected: true, notes };
}

export async function loadNotes() {
  const [cards, points, journal, own, gyokan] = await Promise.all([loadHiroicho(), loadGrammar(), loadJournal(), loadOwn(), loadGyokan()]);
  const notes = [
    ...gyokan.notes,
    ...cards.map(c => ({ id: c.id, src: "拾い帳", kind: c.type === "文法" ? "grammar" : "word", head: c.headword, reading: c.reading,
      ruby: c.ruby, gloss: c.gloss || c.def_en, tag: c.type, work: c.source || "", at: c.logged_on, url: c.notion_url, card: c })),
    ...points.map(p => ({ id: "g-" + p.slug, src: "文型帳", kind: "grammar", head: p.pattern, reading: p.kana, gloss: p.gloss,
      tag: p.jlpt, work: "", at: p.added, point: p })),
    ...journal.map(e => ({ id: "j-" + e.id, src: e.source === "Shelf" ? "積読の棚" : "日誌", kind: "memo", head: e.work || "メモ",
      gloss: e.note || { Started: "読み始めた", Finished: "読み終えた", Paused: "中断", Dropped: "やめた" }[e.type] || "", tag: e.type,
      work: e.work || "", at: (e.date || "").slice(0, 10), url: e.url, entry: e })),
    ...own.filter(e => e.type === "note").map(e => ({ id: e.id, src: "ハブ", kind: "memo", head: e.work || "メモ", gloss: e.text,
      tag: "Note", work: e.work || "", at: (e.at || "").slice(0, 10), entry: { note: e.text, pending: !e.notion } })),
  ].sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  const expansions = new Map();
  for (const e of own.filter(e => e.type === "expansion")) {
    if (!expansions.has(e.noteId)) expansions.set(e.noteId, []);
    expansions.get(e.noteId).push(e);
  }
  const works = new Map();
  for (const n of notes) if (n.work) works.set(n.work, (works.get(n.work) || 0) + 1);
  return { notes, expansions, works: [...works].sort((a, b) => b[1] - a[1]), gyokan: gyokan.connected };
}

const newId = p => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function append(entry) {
  return data.update(`notebook/${month()}.json`, file => {
    const f = file || { month: month(), entries: [] };
    return { ...f, entries: [...f.entries, entry] };
  });
}

// A memo written in the hub. The notes-sync job copies it into the Notion journal.
export function addMemo({ work, text }) {
  return append({ id: newId("e"), type: "note", work, text, at: new Date().toISOString(), updatedAt: Date.now(), notion: null });
}

// An AI answer is saved with its note, so it is paid for once and stays readable offline.
export function addExpansion({ noteId, question, answer, model, usage }) {
  return append({ id: newId("x"), type: "expansion", noteId, question, answer, model, usage, at: new Date().toISOString() });
}

// What a note says, as plain text for the AI prompt.
export function noteText(n) {
  if (n.card) {
    const c = n.card;
    return [`見出し: ${c.headword}（${c.reading || ""}）`, c.context?.ja && `出会った文: ${c.context.ja}`, c.source && `出典: ${c.source}`,
      c.def_ja?.length && `定義: ${c.def_ja.join(" ")}`, c.def_en && `English: ${c.def_en}`, c.my_note && `自分のメモ: ${c.my_note}`]
      .filter(Boolean).join("\n");
  }
  if (n.quote) return [`書き抜き: ${n.quote.text}`, n.work && `出典: ${n.work}`].filter(Boolean).join("\n");
  if (n.vocab) return [`単語: ${n.vocab.word}（${n.vocab.read || ""}）`, n.vocab.sent && `出会った文: ${n.vocab.sent}`, n.work && `出典: ${n.work}`].filter(Boolean).join("\n");
  if (n.point) return [`文型: ${n.point.pattern}`, `意味: ${n.point.gloss}`, n.point.literal && `成り立ち: ${n.point.literal}`].filter(Boolean).join("\n");
  return [`作品: ${n.head}`, `メモ: ${n.gloss}`].join("\n");
}
