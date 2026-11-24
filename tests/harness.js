// A very small test harness that runs the same in a browser (tests/index.html) and in Node (tests/run.mjs).

const cases = [];
export const test = (name, fn) => { cases.push({ name, fn }); };

export function eq(got, want, what) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) throw new Error(`${what ? what + ": " : ""}expected ${b}, got ${a}`);
}
export function ok(value, what) {
  if (!value) throw new Error(what || "expected a true value");
}

// Runs every case. Returns [{ name, ok, error }].
export async function run() {
  const out = [];
  for (const c of cases) {
    try { await c.fn(); out.push({ name: c.name, ok: true }); }
    catch (e) { out.push({ name: c.name, ok: false, error: String(e && e.message || e) }); }
  }
  return out;
}
