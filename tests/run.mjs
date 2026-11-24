// Runs on GitHub for every push (.github/workflows/test.yml):  node --experimental-vm-modules tests/run.mjs
//   1. every .js file in the repo must parse (the hub has no build step, so nothing else would catch a typo)
//   2. the test cases must pass

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let problems = 0;

async function scripts(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await scripts(p));
    else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}

if (!vm.SourceTextModule) {
  console.error("run with: node --experimental-vm-modules tests/run.mjs");
  process.exit(2);
}
const files = await scripts(root);
for (const f of files) {
  try { new vm.SourceTextModule(await readFile(f, "utf8"), { identifier: f }); }
  catch (e) { problems++; console.error(`✗ does not parse: ${path.relative(root, f)}: ${e.message}`); }
}
console.log(`${files.length} scripts parsed`);

const { run } = await import("./harness.js");
await import("./points.test.js");
const results = await run();
for (const r of results) {
  if (r.ok) console.log("✓ " + r.name);
  else { problems++; console.error(`✗ ${r.name}\n    ${r.error}`); }
}
console.log(`${results.filter(r => r.ok).length} of ${results.length} tests passed`);
process.exit(problems ? 1 : 0);
