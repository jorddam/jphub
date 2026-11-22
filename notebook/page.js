import { h, $, clear, topbar, setSync, toast } from "../lib/core.js";
import * as data from "../lib/data.js";
import { KINDS, loadNotes, addMemo, addExpansion, noteText } from "../lib/notes.js";
import { expand, hasKey } from "../lib/ai.js";

topbar("notebook");

const params = new URLSearchParams(location.search);
const state = { kind: params.get("k") || "all", work: params.get("work") || "", q: "", open: params.get("n"), limit: 60 };
let book = { notes: [], expansions: new Map(), works: [] };

const kindOf = id => KINDS.find(k => k.id === id);
const lines = s => String(s || "").split(/<br\s*\/?>|\n/).map(x => x.trim()).filter(Boolean);

// ---------- Japanese text with readings and emphasis ----------
// Notes use three kinds of markup: {漢字|かんじ} for readings, [[…]] for the target, **…** for stress.
function rich(text) {
  const out = document.createDocumentFragment();
  const stack = [out];
  const push = node => stack[stack.length - 1].append(node);
  const re = /\{([^|{}]+)\|([^{}]+)\}|\[\[|\]\]|\*\*/g;
  let last = 0, m, bold = false;
  const s = String(text || "");
  while ((m = re.exec(s))) {
    if (m.index > last) push(s.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) push(h("ruby", {}, m[1], h("rt", { text: m[2] })));
    else if (m[0] === "[[") { const el = h("mark"); push(el); stack.push(el); }
    else if (m[0] === "]]") { if (stack.length > 1 && stack[stack.length - 1].tagName === "MARK") stack.pop(); }
    else if (!bold) { const el = h("strong"); push(el); stack.push(el); bold = true; }
    else { if (stack.length > 1) stack.pop(); bold = false; }
  }
  if (last < s.length) push(s.slice(last));
  return out;
}
function rubyHead(n) {
  if (n.ruby?.length) return n.ruby.map(([base, rt]) => rt ? h("ruby", {}, base, h("rt", { text: rt })) : base);
  if (n.point) return rich(n.head);
  return n.head;
}
function marked(sentence, focus) {
  const i = focus ? sentence.indexOf(focus) : -1;
  return i < 0 ? [sentence] : [sentence.slice(0, i), h("mark", { text: focus }), sentence.slice(i + focus.length)];
}
const sec = (title, ...kids) => kids.flat().some(Boolean) ? h("div", {}, h("h4", { text: title }), kids) : null;

// ---------- the body of an opened note ----------
function cardBody(c) {
  return [
    c.context?.ja ? h("blockquote", { class: "ctx" }, marked(c.context.ja, c.context.focus)) : null,
    sec("定義", lines((c.def_ja || []).join("\n")).map(t => h("p", { class: "ja", text: t }))),
    sec("英語で", c.def_en ? h("p", { text: c.def_en }) : null),
    c.my_note ? sec("自分のメモ", h("div", { class: "mine" }, lines(c.my_note).map(t => h("p", { text: t })))) : null,
    c.clarification?.text ? sec("答え", h("div", { class: "reply" }, h("p", { text: c.clarification.text }))) : null,
    sec("ニュアンス", c.nuance ? h("p", { text: c.nuance }) : null),
    c.connection ? sec("接続", h("p", { class: "ja", text: c.connection })) : null,
    c.examples?.length ? sec("例文", h("ul", { class: "ex" }, c.examples.map(e => h("li", {},
      h("span", { class: "ja", text: e.ja }), h("span", { class: "en", text: [e.en, e.media].filter(Boolean).join(" — ") }))))) : null,
    c.neighbors?.length ? sec("似ている言葉", h("ul", { class: "ex" }, c.neighbors.map(nb => h("li", {},
      h("span", { class: "ja", text: nb.reading && nb.reading !== nb.word ? `${nb.word}（${nb.reading}）` : nb.word }),
      h("span", { class: "en", text: nb.diff }))))) : null,
  ];
}
function pointBody(p) {
  return [
    sec("核心", h("p", {}, rich(p.core))),
    p.literal ? sec("成り立ち", h("p", {}, rich(p.literal))) : null,
    p.formation?.length ? sec("接続", h("dl", { class: "form2" }, p.formation.flatMap(f => [h("dt", { text: f.type }),
      h("dd", {}, h("span", { text: f.rule }), h("br"), h("span", { class: "ja" }, rich(f.ex)))]))) : null,
    p.conjNote ? h("p", { class: "hint", text: p.conjNote }) : null,
    p.examples?.length ? sec("例文", h("ul", { class: "ex" }, p.examples.slice(0, 6).map(e => h("li", {},
      h("span", { class: "ja" }, rich(e.jp)), h("span", { class: "en", text: [e.en, e.level].filter(Boolean).join(" — ") }))))) : null,
    p.rules?.length ? sec("気をつける点", h("ul", { class: "ex" }, p.rules.slice(0, 3).map(r => h("li", {},
      h("span", { class: "en" }, rich(r.body)), r.bad ? h("span", { class: "ja" }, "✕ ", rich(r.bad)) : null)))) : null,
    p.collocations?.length ? sec("よく使う形", h("ul", { class: "ex" }, p.collocations.slice(0, 5).map(c => h("li", {},
      h("span", { class: "ja" }, rich(c.jp)), h("span", { class: "en", text: c.en }))))) : null,
  ];
}
function memoBody(n) {
  const e = n.entry || {};
  return [
    e.note ? h("p", { text: e.note }) : null,
    e.enjoyment ? h("p", { class: "hint", text: "楽しさ " + "★".repeat(Math.round(e.enjoyment)) + ` (${e.enjoyment})` }) : null,
    e.comment ? sec("AIのコメント（行間）", h("div", { class: "reply" }, h("p", { text: e.comment }))) : null,
    e.reply ? sec("キュレーターの返事", h("div", { class: "reply" }, h("p", { text: e.reply }))) : null,
    e.pending ? h("p", { class: "hint", text: "Notionにはまだ送られていません（次の同期で送ります）。" }) : null,
  ];
}
function otherBody(n) {
  if (n.quote) return [h("blockquote", { class: "ctx", text: n.quote.text })];
  const v = n.vocab;
  return [v.sent ? h("blockquote", { class: "ctx" }, marked(v.sent, v.word)) : null, v.gloss ? h("p", { text: v.gloss }) : null];
}

// ---------- ask AI about a note (opt-in, one call per press) ----------
const QUICK = [
  ["例文をもっと", "Give four more natural example sentences that use this, from easy to harder, each with an English translation."],
  ["似た表現との違い", "Which similar words or patterns is this easily confused with, and how do I tell them apart? Give one contrasting pair of sentences for each."],
  ["この文脈では", "Explain what this means in the sentence where I met it, and what would change if a plainer alternative were used."],
  ["覚え方", "Give me a short way to remember this: the core image, a typical collocation, and one sentence worth memorising."],
];
function askBox(n, rerender) {
  if (!hasKey()) {
    return h("div", { class: "ask" }, h("h4", { text: "AIで深掘り" }),
      h("p", { class: "hint" }, "使うときだけ動きます。", h("a", { href: "../settings/", text: "設定" }), "でAnthropicのキーを入れると使えます。"));
  }
  const input = h("input", { class: "input", type: "text", placeholder: "このノートについて質問する", "aria-label": "質問" });
  const status = h("p", { class: "hint" });
  const buttons = [];
  const run = async (label, question) => {
    if (!question.trim()) return;
    buttons.forEach(b => b.disabled = true);
    status.textContent = "考え中…";
    try {
      const res = await expand(noteText(n), question);
      await addExpansion({ noteId: n.id, question: label, answer: res.text, model: res.model, usage: res.usage });
      await load(n.id);
    } catch (e) {
      status.textContent = { no_key: "キーがありません。", auth: "キーが通りませんでした。設定を確認してください。",
        busy: "混み合っています。少し待ってもう一度。" }[e.code] || "うまくいきませんでした。もう一度試してください。";
      buttons.forEach(b => b.disabled = false);
    }
  };
  for (const [label, question] of QUICK) buttons.push(h("button", { class: "chip", type: "button", text: label, onclick: () => run(label, question) }));
  const send = h("button", { class: "btn", type: "button", text: "聞く", onclick: () => run(input.value.trim(), input.value) });
  buttons.push(send);
  input.addEventListener("keydown", e => { if (e.key === "Enter") send.click(); });
  return h("div", { class: "ask" }, h("h4", { text: "AIで深掘り（押したときだけ・Sonnet）" }), h("div", { class: "chips" }, buttons.slice(0, QUICK.length)),
    h("div", { class: "row" }, input, send), status);
}

function noteEl(n) {
  const kind = kindOf(n.kind);
  const xs = book.expansions.get(n.id) || [];
  const el = h("details", { class: "note " + n.kind, style: { "--c": `var(${kind.c})` }, id: "n-" + n.id },
    h("summary", {},
      h("span", { class: "head" }, n.kind === "quote" ? "「" + n.head + "」" : rubyHead(n)),
      h("span", { class: "when", text: (n.at || "").slice(5).replace("-", "/") }),
      n.gloss && n.kind !== "quote" ? h("span", { class: "gl", text: n.gloss }) : null,
      h("span", { class: "meta" }, h("span", { class: "tag jp", text: kind.ja }), n.tag && n.tag !== kind.ja ? h("span", { class: "tag jp", text: n.tag }) : null,
        h("span", { text: [n.src, n.work].filter(Boolean).join(" · ") }), xs.length ? h("span", { class: "tag jp", text: `深掘り ${xs.length}` }) : null)));
  // The body is built when the note is first opened, so a long notebook stays light.
  const fill = () => {
    if (el.querySelector(".body")) return;
    el.append(h("div", { class: "body" },
      n.card ? cardBody(n.card) : n.point ? pointBody(n.point) : n.entry ? memoBody(n) : otherBody(n),
      xs.map(x => h("div", { class: "xp" }, h("span", { class: "q", text: "Q. " + x.question }), h("div", { class: "a", text: x.answer }),
        h("span", { class: "m", text: `${x.model || ""} · ${(x.at || "").slice(0, 10)}` }))),
      askBox(n),
      h("div", { class: "btnrow" },
        n.url ? h("a", { class: "btn", href: n.url, target: "_blank", rel: "noopener", text: "Notionで開く ↗" }) : null,
        n.work ? h("button", { class: "btn", type: "button", text: `「${n.work.slice(0, 14)}${n.work.length > 14 ? "…" : ""}」のノートだけ`, onclick: () => go({ work: n.work }) }) : null)));
  };
  el.addEventListener("toggle", () => { if (el.open) fill(); });
  if (state.open === n.id) { el.open = true; fill(); }
  return el;
}

// ---------- list ----------
function visible() {
  const q = state.q.toLowerCase();
  return book.notes.filter(n => (state.kind === "all" || n.kind === state.kind) && (!state.work || n.work === state.work)
    && (!q || [n.head, n.reading, n.gloss, n.work].some(s => (s || "").toLowerCase().includes(q))));
}
function composer() {
  const work = h("input", { class: "input", type: "text", placeholder: "作品（任意）", value: state.work || null, "aria-label": "作品" });
  const text = h("textarea", { class: "input", placeholder: "メモを書く…", "aria-label": "メモ" });
  const save = h("button", { class: "btn primary", type: "button", text: "保存", onclick: async () => {
    if (!text.value.trim()) return;
    save.disabled = true;
    try { await addMemo({ work: work.value.trim(), text: text.value.trim() }); toast("保存しました"); await load(); }
    catch (e) { toast("保存できませんでした"); save.disabled = false; }
  } });
  return h("details", { class: "composer" }, h("summary", { text: "＋ メモを書く" }), work, text, h("div", { class: "btnrow" }, save));
}
function render() {
  const inWork = book.notes.filter(n => !state.work || n.work === state.work);
  clear($("#kinds")).append(
    h("button", { class: "chip", type: "button", "aria-pressed": String(state.kind === "all"), onclick: () => go({ kind: "all" }) }, "すべて", h("span", { class: "n", text: inWork.length })),
    ...KINDS.map(k => h("button", { class: "chip", type: "button", "aria-pressed": String(state.kind === k.id), onclick: () => go({ kind: k.id }) },
      k.ja, h("span", { class: "n", text: inWork.filter(n => n.kind === k.id).length }))));
  clear($("#works")).append(
    h("li", {}, h("button", { type: "button", "aria-pressed": String(!state.work), onclick: () => go({ work: "" }) }, h("span", { text: "すべての作品" }), h("span", { class: "n", text: book.notes.length }))),
    ...book.works.map(([w, n]) => h("li", {}, h("button", { type: "button", "aria-pressed": String(state.work === w), onclick: () => go({ work: w }) },
      h("span", { text: w }), h("span", { class: "n", text: n })))));
  const count = src => book.notes.filter(n => n.src === src).length;
  clear($("#srcs")).append(
    h("span", { text: `拾い帳 · ${count("拾い帳")}` }), h("span", { text: `文型帳 · ${count("文型帳")}` }),
    h("span", { text: `日誌（Notion）· ${count("日誌") + count("積読の棚")}` }),
    h("span", { class: book.gyokan ? "" : "off", text: book.gyokan ? `行間 · ${count("行間")}` : "行間 · 未接続" }),
    h("span", { class: "off", text: "聞き取り · これから" }));

  const shown = visible();
  const stream = clear($("#stream"));
  stream.append(composer());
  if (!shown.length) stream.append(h("p", { class: "empty", text: "該当するノートはありません。" }));
  let month = "";
  for (const n of shown.slice(0, state.limit)) {
    const m = (n.at || "").slice(0, 7);
    if (m !== month) { month = m; stream.append(h("h3", { class: "month", text: m ? m.replace("-", "年") + "月" : "日付なし" })); }
    stream.append(noteEl(n));
  }
  if (shown.length > state.limit) stream.append(h("button", { class: "btn", type: "button", text: `さらに表示（残り${shown.length - state.limit}件）`, onclick: () => go({ limit: state.limit + 100 }) }));
}
function go(change) { Object.assign(state, change); render(); }

async function load(openId) {
  setSync("busy", "読み込み中…");
  try {
    book = await loadNotes();
    if (openId) state.open = openId;
    render();
    if (state.open) document.getElementById("n-" + state.open)?.scrollIntoView({ block: "start" });
    setSync(data.mode === "none" ? "bad" : "ok", data.mode === "dev" ? "サンプルデータ" : data.mode === "none" ? "未接続" : "同期済み", () => load());
  } catch (e) {
    console.error(e);
    setSync("bad", "読み込めませんでした", () => load());
  }
}

let typing = 0;
$("#q").addEventListener("input", e => { clearTimeout(typing); typing = setTimeout(() => go({ q: e.target.value.trim(), limit: 60 }), 150); });
load();
