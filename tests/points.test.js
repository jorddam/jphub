// What the map's reader does with Gyokan's file. Every record here is made up.

import { test, eq, ok } from "./harness.js";
import { FIELDS, matchField, matchKind, normalise, buildTree, related, matches, tidy, fold, FRESH_DAYS } from "../lib/points.js";

const DAY = 86400e3, NOW = Date.UTC(2026, 10, 24);
const sitting = (id, book, author, points, extra = {}) =>
  ({ id, book, sig: { title: book, author, total: 100000 }, ch: 1, chapter: "第一章", g: 5000, added: NOW - 3 * DAY, text: "この回の要約。二文目。", points, ...extra });
const file = (...summaries) => ({ app: "gyokan", v: 1, summaries });
const pt = (head, extra = {}) => ({ head, text: head + "の説明。", field: "歴史", topic: "題", kind: "事実", keys: [], ...extra });
const heads = points => points.map(p => p.head);
const fieldId = v => matchField(v)?.id ?? null;

test("fields: every field is found by its id and by its Japanese name", () => {
  for (const f of FIELDS) { eq(fieldId(f.id), f.id, f.id); eq(fieldId(f.ja), f.id, f.ja); }
});
test("fields: English, case and full-width letters", () => {
  eq(fieldId("History"), "history");
  eq(fieldId("ＨＩＳＴＯＲＹ"), "history");
  eq(fieldId(" 科学 "), "science");
  eq(fieldId("art history"), "history");
});
test("fields: a one-character name only counts as the whole word", () => {
  eq(fieldId("心"), "mind");
  eq(fieldId("法"), "politics");
  eq(fieldId("方法論"), null, "方法論 is not law");
  eq(fieldId("中心市街地の再生"), null, "中心 is not 心");
  eq(fieldId("文法"), "language", "文法 is language, not law");
});
test("fields: in a compound, the last name wins", () => {
  eq(fieldId("科学技術"), "tech");
  eq(fieldId("歴史哲学"), "thought");
  eq(fieldId("自然科学"), "science");
  eq(fieldId("心理学"), "mind");
  eq(fieldId("日本経済"), "economy");
});
test("fields: English names only count as whole words", () => {
  eq(fieldId("heart"), null);
  eq(fieldId("smart cities"), null);
  eq(fieldId("modern art"), "culture");
});
test("fields: nothing, and nonsense, mean no field", () => {
  eq(fieldId(""), null); eq(fieldId(null), null); eq(fieldId(undefined), null); eq(fieldId("あいうえお"), null);
});
test("kinds: Japanese and English names", () => {
  eq(matchKind("事実"), "fact"); eq(matchKind("Claim"), "claim"); eq(matchKind("定義"), "concept"); eq(matchKind("例"), "example"); eq(matchKind("?"), "");
});

test("reader: a plain sitting becomes its points, with the sitting's book, chapter and date", () => {
  const { points, report } = normalise(file(sitting("s1", "本A", "甲", [pt("一"), pt("二")])));
  eq(heads(points), ["一", "二"]);
  eq(points.map(p => p.id), ["s1:0", "s1:1"]);
  const p = points[0];
  eq([p.book, p.author, p.ch, p.chapter, p.pos, p.at, p.field, p.topic, p.kind, p.summary], ["本A", "甲", 1, "第一章", 0.05, NOW - 3 * DAY, "history", "題", "fact", "この回の要約。二文目。"]);
  eq([report.summaries, report.points, report.skipped, report.unfiled], [1, 2, 0, 0]);
});
test("reader: sittings without an id keep all their points", () => {
  const g = file(sitting(undefined, "本A", "甲", [pt("一"), pt("二")]), sitting(undefined, "本A", "甲", [pt("三"), pt("四")], { added: NOW - 2 * DAY }));
  const { points, report } = normalise(g);
  eq(heads(points), ["一", "二", "三", "四"]);
  eq(new Set(points.map(p => p.id)).size, 4, "four different ids");
  eq(report.skipped, 0);
});
test("reader: ids made for records without one are the same on every load", () => {
  const g = file(sitting(undefined, "本A", "甲", [pt("一")]), sitting("", "本B", "乙", [pt("二")]));
  g.points = [{ head: "三", book: "本C", added: NOW }];
  eq(normalise(g).points.map(p => p.id), normalise(JSON.parse(JSON.stringify(g))).points.map(p => p.id));
});
test("reader: a flat point without an id is kept", () => {
  const { points } = normalise({ app: "gyokan", points: [{ head: "一", book: "本C", field: "科学" }, { head: "二", book: "本C", field: "科学" }] });
  eq(heads(points).sort(), ["一", "二"]);
});
test("reader: deleted sittings and deleted points are left out, and are not counted as problems", () => {
  const g = file(sitting("s1", "本A", "甲", [pt("消した"), pt("もう一つ")], { deleted: true }), sitting("s2", "本A", "甲", [pt("残る"), pt("消した点", { deleted: true })]));
  const { points, report } = normalise(g);
  eq(heads(points), ["残る"]);
  eq([report.summaries, report.skipped], [1, 0]);
});
test("reader: the same id twice is read once, and reported", () => {
  const { points, report } = normalise(file(sitting("s1", "本A", "甲", [pt("一")]), sitting("s1", "本A", "甲", [pt("一の写し")])));
  eq(heads(points), ["一"]);
  eq(report.why, { "同じidが二つある": 1 });
});
test("reader: a sitting with no points becomes one point; with nothing at all it is reported", () => {
  const { points, report } = normalise(file(sitting("s1", "本A", "甲", []), sitting("s2", "本A", "甲", [], { text: "" }), sitting("s3", "本A", "甲", { head: "配列ではない" })));
  eq(heads(points), ["この回の要約。", "この回の要約。"]);
  eq(points[0].topic, "未分類"); eq(points[0].field, "other");
  eq(report.why, { "中身がない": 1 });
});
test("reader: a point with no headline takes its first sentence; with no words at all it is reported", () => {
  const { points, report } = normalise(file(sitting("s1", "本A", "甲", [{ text: "一文目。二文目。" }, { head: 12345 }, { field: "歴史" }, "文字列", null])));
  eq(heads(points), ["一文目。", "12345"]);
  eq(report.why, { "形が違う": 2, "見出しも本文もない": 1 });
});
test("reader: a point's empty date does not erase the sitting's date", () => {
  const { points } = normalise(file(sitting("s1", "本A", "甲", [pt("一", { added: null }), pt("二", { added: "2026-11-20T10:00:00Z" }), pt("三", { added: String(NOW) })])));
  const at = Object.fromEntries(points.map(p => [p.head, p.at]));
  eq([at["一"], at["二"], at["三"]], [NOW - 3 * DAY, Date.parse("2026-11-20T10:00:00Z"), NOW]);
});
test("reader: unknown fields go to その他 and are listed; an empty field is not a problem", () => {
  const { points, report } = normalise(file(sitting("s1", "本A", "甲", [pt("一", { field: "方法論" }), pt("二", { field: "" }), pt("三", { field: "方法論" }), pt("四", { field: "その他" })])));
  eq(points.map(p => p.field), ["other", "other", "other", "other"]);
  eq([report.unfiled, report.unknownFields], [2, ["方法論"]]);
});
test("reader: one topic however it is typed (width, case, spaces); the first spelling is shown", () => {
  const { points } = normalise(file(sitting("s1", "本A", "甲", [pt("一", { field: "技術", topic: "ＡＩ" }), pt("二", { field: "技術", topic: "ai" }), pt("三", { field: "技術", topic: " AI　" }), pt("四", { field: "社会", topic: "AI" })])));
  eq(points.map(p => p.topic), ["AI", "AI", "AI", "AI"]);
  const tree = buildTree(points, "field", NOW);
  eq(tree.kids.map(f => [f.label, f.kids.map(t => [t.label, t.count])]), [["社会", [["AI", 1]]], ["技術", [["AI", 3]]]]);
});
test("reader: keywords connect whatever their width or case, and repeats are dropped", () => {
  const { points } = normalise(file(sitting("s1", "本A", "甲", [pt("一", { keys: ["ＧＤＰ", "gdp", " 明治 維新 "] }), pt("二", { keys: ["gdp"] }), pt("三", { keys: "明治" })])));
  eq(points[0].keys, ["GDP", "明治 維新"]);
  eq(related(points, points[0]).map(r => [r.point.head, r.shared]), [["二", ["gdp"]]]);
  eq(points[2].keys, [], "keys that are not a list are ignored");
});
test("reader: two books with one title are two books, and say whose they are", () => {
  const g = file(sitting("s1", "入門", "甲", [pt("一")]), sitting("s2", "入門", "乙", [pt("二")]), sitting("s3", "別の本", "丙", [pt("三")]));
  const { points } = normalise(g);
  const tree = buildTree(points, "book", NOW);
  eq(tree.kids.map(b => [b.label, b.count]).sort(), [["入門（乙）", 1], ["入門（甲）", 1], ["別の本", 1]]);
});
test("reader: a record that names no author joins the only book of that title", () => {
  const g = file(sitting("s1", "入門", "甲", [pt("一")]));
  g.points = [{ id: "x", head: "二", book: "入門", field: "歴史" }];
  const { points } = normalise(g);
  eq(new Set(points.map(p => p.bookId)).size, 1);
  eq(buildTree(points, "book", NOW).kids.map(b => [b.label, b.count]), [["入門", 2]]);
});
test("reader: files that are empty or the wrong shape give no points and do not throw", () => {
  for (const g of [null, undefined, {}, { summaries: "x", points: 7 }, { summaries: [null, 3, "x", []] }]) eq(normalise(g).points, []);
  eq(normalise({ summaries: [null, 3, "x", []] }).report.why, { "形が違う": 4 });
});
test("reader: points come out in the order they were read", () => {
  const g = file(sitting("s2", "本A", "甲", [pt("後")], { added: NOW - DAY }), sitting("s1", "本A", "甲", [pt("先")], { added: NOW - 5 * DAY }));
  eq(heads(normalise(g).points), ["先", "後"]);
});

test("tree: fields in their fixed order, topics and points in reading order, counts and this-week counts", () => {
  const g = file(sitting("s1", "本A", "甲", [pt("古い", { field: "科学", topic: "脳" }), pt("歴史の点")], { added: NOW - 30 * DAY }),
    sitting("s2", "本A", "甲", [pt("新しい", { field: "科学", topic: "脳" }), pt("別の題", { field: "科学", topic: "睡眠" })], { added: NOW - DAY }));
  const tree = buildTree(normalise(g).points, "field", NOW);
  eq([tree.count, tree.fresh], [4, 2]);
  eq(tree.kids.map(f => f.label), ["歴史", "科学"]);
  const sci = tree.kids[1];
  eq(sci.kids.map(t => [t.label, t.count, t.fresh, t.kids.map(p => p.label)]), [["脳", 2, 1, ["古い", "新しい"]], ["睡眠", 1, 1, ["別の題"]]]);
  ok(FRESH_DAYS === 7);
});
test("tree: by book, chapters in order; a book with no chapters holds its points directly", () => {
  const g = file(sitting("s1", "本A", "甲", [pt("三章の点")], { ch: 3, chapter: "第三章" }), sitting("s2", "本A", "甲", [pt("一章の点")], { ch: 1, chapter: "第一章", added: NOW - DAY }),
    sitting("s3", "本B", "乙", [pt("章なしの点")], { ch: null, chapter: "" }));
  const tree = buildTree(normalise(g).points, "book", NOW);
  eq(tree.kids.map(b => [b.label, b.kids.map(k => [k.type, k.label])]), [["本A", [["chapter", "第一章"], ["chapter", "第三章"]]], ["本B", [["point", "章なしの点"]]]]);
});
test("tree: every node has an id of its own", () => {
  const g = file(sitting("s1", "本A", "甲", [pt("一", { topic: "題" }), pt("二", { field: "科学", topic: "題" })]), sitting("s2", "本B", "乙", [pt("三")]));
  for (const lens of ["field", "book"]) {
    const ids = [];
    (function walk(n) { ids.push(n.id); n.kids.forEach(walk); })(buildTree(normalise(g).points, lens, NOW));
    eq(new Set(ids).size, ids.length, lens);
  }
});

test("connections: most shared keywords first, then newest; none without keywords", () => {
  const g = file(sitting("s1", "本A", "甲", [pt("中心", { keys: ["a", "b"] }), pt("一つ古い", { keys: ["a"] }), pt("鍵なし")], { added: NOW - 9 * DAY }),
    sitting("s2", "本A", "甲", [pt("一つ新しい", { keys: ["b"] }), pt("二つ", { keys: ["B", "A"] })], { added: NOW - DAY }));
  const { points } = normalise(g), by = h => points.find(p => p.head === h);
  eq(related(points, by("中心")).map(r => r.point.head), ["二つ", "一つ新しい", "一つ古い"]);
  eq(related(points, by("鍵なし")), []);
  eq(related(points, by("中心"), 1).length, 1);
});
test("search: headline, text, topic, book, author, field name and keywords; width and case ignored", () => {
  const { points } = normalise(file(sitting("s1", "江戸の経済", "山田", [pt("米の値段", { field: "経済", topic: "物価", keys: ["GDP"] })])));
  const p = points[0];
  for (const q of ["米", "説明", "物価", "江戸", "山田", "経済・ビジネス", "gdp", "ＧＤＰ"]) ok(matches(p, q), q);
  ok(!matches(p, "明治"));
});
test("text: tidy and fold", () => {
  eq([tidy("  ＡＩ　と  人間 "), fold("ＡＩ"), tidy(null), tidy(12)], ["AI と 人間", "ai", "", "12"]);
});
