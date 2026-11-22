import { h, $, clear, topbar, setSync, toast, local, setLocal } from "../lib/core.js";
import * as data from "../lib/data.js";
import { pending } from "../lib/library.js";

topbar("settings");

function section(mark, title, color, ...kids) {
  return h("section", { class: "panel", style: { "--c": `var(${color})` } },
    h("header", {}, h("span", { class: "lmark", text: mark }), h("h2", { text: title })), h("div", { class: "form" }, kids));
}
const field = (label, input, hint) => h("div", { class: "field" }, h("label", { text: label }), input, hint ? h("span", { class: "hint", text: hint }) : null);

function connection() {
  const cur = data.settings() || {};
  const repo = h("input", { class: "input", type: "text", value: cur.repo || "jorddam/jphub-data", autocomplete: "off", spellcheck: "false" });
  const token = h("input", { class: "input", type: "password", value: cur.token || null, autocomplete: "off", placeholder: "github_pat_…" });
  const status = h("p", { class: "hint", text: data.mode === "dev" ? "いまはこのPCのサンプルデータで動いています（開発用）。"
    : data.mode === "github" ? "接続済みです。" : "まだ接続していません。" });
  const save = h("button", { class: "btn primary", type: "button", text: "保存して確認", onclick: async () => {
    setLocal("jphub.gh", { repo: repo.value.trim(), token: token.value.trim() });
    status.textContent = "確認中…";
    try {
      const res = await fetch(`https://api.github.com/repos/${repo.value.trim()}/contents/snapshots/library/index.json`, {
        headers: { Authorization: "Bearer " + token.value.trim(), Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" } });
      status.textContent = res.ok ? `読めました（${(await res.json()).tabs.length}タブ）。ページを読み直すと反映されます。`
        : res.status === 404 ? "リポジトリは見えますが、データがまだありません。" : `接続できませんでした（${res.status}）。`;
    } catch (e) { status.textContent = "接続できませんでした。"; }
  } });
  const forget = h("button", { class: "btn", type: "button", text: "この端末から消す", onclick: () => { setLocal("jphub.gh", null); token.value = ""; status.textContent = "消しました。"; } });
  return section("接", "データの接続（GitHub）", "--j",
    field("データのリポジトリ", repo),
    field("トークン", token, "jphub-data・gyokan-sync・kikitori-library の3つに Contents の読み書きを許可した fine-grained トークン。この端末にだけ保存されます。"),
    h("div", { class: "btnrow" }, save, forget), status);
}

function ai() {
  const key = h("input", { class: "input", type: "password", value: local("jphub.ai", {}).key || null, autocomplete: "off", placeholder: "sk-ant-…" });
  const u = local("jphub.aiUsage", { in: 0, out: 0, calls: 0 });
  // Sonnet 5.5 list price: $2 per million input tokens, $10 per million output tokens.
  const cost = (u.in * 2 + u.out * 10) / 1e6;
  const status = h("p", { class: "hint", text: u.calls ? `これまで ${u.calls}回 · 約 $${cost.toFixed(2)}（この端末）` : "まだ使っていません。" });
  return section("AI", "AI（ノートの深掘りだけ）", "--n",
    h("p", { class: "hint", text: "ハブでAIを使うのは、ノートで「AIで深掘り」を押したときだけです。キーがなければその欄は出ません。1回あたりおよそ1〜2セントです。" }),
    field("Anthropic APIキー", key, "この端末にだけ保存されます。"),
    h("div", { class: "btnrow" },
      h("button", { class: "btn primary", type: "button", text: "保存", onclick: () => { setLocal("jphub.ai", { key: key.value.trim() }); toast("保存しました"); } }),
      h("button", { class: "btn", type: "button", text: "消す", onclick: () => { setLocal("jphub.ai", {}); key.value = ""; toast("消しました"); } })),
    status);
}

function sync() {
  const waiting = Object.keys(pending()).length;
  const out = h("p", { class: "hint", text: waiting ? `シートへの反映待ち：${waiting}件` : "反映待ちはありません。" });
  const run = (label, job) => h("button", { class: "btn", type: "button", text: label, onclick: async e => {
    e.target.disabled = true;
    out.textContent = "実行中…";
    try { const r = await data.runJob(job); out.textContent = r ? JSON.stringify(r).slice(0, 200) : "依頼しました。1分ほどで反映されます。"; }
    catch (err) { out.textContent = "実行できませんでした。"; }
    e.target.disabled = false;
  } });
  return section("同", "同期", "--h",
    h("div", { class: "btnrow" }, run("シートを読み直す", "snapshot"), run("変更を反映する", "outbox"), run("Steamを確認する", "steam")),
    out,
    h("div", { class: "btnrow" }, h("button", { class: "btn", type: "button", text: "反映待ちを取り消す", onclick: () => { setLocal("jphub.pending", {}); setLocal("jphub.readPending", {}); toast("取り消しました"); render(); } }),
      h("button", { class: "btn", type: "button", text: "この端末のキャッシュを消す", onclick: () => { indexedDB.deleteDatabase("jphub"); toast("消しました"); } })));
}

function render() { clear($("#sections")).append(connection(), ai(), sync()); }
render();
setSync(data.mode === "none" ? "bad" : "ok", data.mode === "dev" ? "サンプルデータ" : data.mode === "none" ? "未接続" : "接続済み");
