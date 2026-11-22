// The hub's only AI call: "expand on this note" in the notebook.
// It runs only when you press the button, with your own Anthropic key from Settings,
// straight from the browser (the same way Gyokan calls the API). Sonnet, low effort.

import { local, setLocal } from "./core.js";

export const MODEL = "claude-sonnet-5-5";
export const hasKey = () => !!local("jphub.ai", {}).key;

const SYSTEM = [
  "You help one learner of Japanese (intermediate to advanced, preparing for JLPT N2 and then N1) get more out of a note from their own reading, listening or play.",
  "Answer the question about the note. Write in English, with Japanese examples; add readings in brackets for kanji above N3.",
  "Don't repeat what the note already says. Be concrete and brief: under 180 words unless asked for more. Plain text, no Markdown headings or tables.",
].join(" ");

async function post(key, body, beta) {
  const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true" };
  if (beta) headers["anthropic-beta"] = beta;
  return fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
}

// Returns { text, model, usage }. Throws an Error whose .code is "no_key", "auth", "busy" or "failed".
export async function expand(noteText, question) {
  const key = local("jphub.ai", {}).key;
  if (!key) throw Object.assign(new Error("no key"), { code: "no_key" });
  const base = { model: MODEL, max_tokens: 4000, system: SYSTEM,
    messages: [{ role: "user", content: `<note>\n${noteText}\n</note>\n\n${question}` }] };
  // If the model declines, let the API hand the request to its default fallback model.
  let res = await post(key, { ...base, output_config: { effort: "low" }, fallbacks: "default" }, "server-side-fallback-2026-07-01");
  if (res.status === 400) res = await post(key, base);
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error("key rejected"), { code: "auth" });
  if (res.status === 429 || res.status >= 500) throw Object.assign(new Error("busy"), { code: "busy" });
  if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { code: "failed" });
  const msg = await res.json();
  if (msg.stop_reason === "refusal") throw Object.assign(new Error("declined"), { code: "failed" });
  const text = (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!text) throw Object.assign(new Error("empty reply"), { code: "failed" });
  const usage = { in: msg.usage?.input_tokens || 0, out: msg.usage?.output_tokens || 0 };
  const total = local("jphub.aiUsage", { in: 0, out: 0, calls: 0 });
  setLocal("jphub.aiUsage", { in: total.in + usage.in, out: total.out + usage.out, calls: total.calls + 1 });
  return { text, model: msg.model || MODEL, usage };
}
