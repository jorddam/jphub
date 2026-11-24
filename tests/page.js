// Runs the tests in the browser. The same cases run in Node on GitHub (tests/run.mjs).

import { run } from "./harness.js";
import "./points.test.js";

const results = await run(), failed = results.filter(r => !r.ok);
document.getElementById("sum").textContent = failed.length ? `${failed.length} 件失敗 / ${results.length} 件` : `${results.length} 件すべて合格`;
const out = document.getElementById("out");
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = (r.ok ? "✓ " : "✗ ") + r.name + (r.ok ? "" : " — " + r.error);
  out.append(li);
}
window.__tests = results;      // for a script driving the page
