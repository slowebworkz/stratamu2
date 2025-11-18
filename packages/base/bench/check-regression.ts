import fs from "node:fs";
import path from "node:path";

const base = path.resolve(process.cwd(), "bench");
const resultsPath = path.join(base, "results", "ring-buffer.json");
const baselinePath = path.join(base, "baselines", "ring-buffer.json");

if (!fs.existsSync(resultsPath)) {
  console.error("No results found. Run run-bench first.");
  process.exit(2);
}
if (!fs.existsSync(baselinePath)) {
  console.error("No baseline found. Please add a baseline at", baselinePath);
  process.exit(2);
}

const results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

const tol = 0.15; // 15% tolerance

function compareCase(name: string) {
  const r = results.cases[name];
  const b = baseline.cases[name];
  if (!r || !b) {
    console.warn("Missing case in results or baseline:", name);
    return { ok: false };
  }
  const medR = r.median;
  const medB = b.median;
  const pass = medR <= medB * (1 + tol);
  return { name, medR, medB, pass };
}

const cases = Object.keys(baseline.cases);
let anyFail = false;
for (const c of cases) {
  const res = compareCase(c);
  if (!res.pass) {
    console.error("REGRESSION:", res.name, "baseline", res.medB, "now", res.medR);
    anyFail = true;
  } else {
    console.log("OK:", res.name, "baseline", res.medB, "now", res.medR);
  }
}

process.exit(anyFail ? 1 : 0);
