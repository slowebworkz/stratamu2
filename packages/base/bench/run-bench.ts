import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { RingBuffer } from "../src/data/ring-buffer.js";

function now() {
  return performance.now();
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((s, x) => s + x, 0);
  const mean = sum / samples.length;
  const median = sorted[Math.floor(samples.length / 2)];
  const p95 = sorted[Math.floor(samples.length * 0.95)];
  const sq = samples.reduce((s, x) => s + (x - mean) ** 2, 0);
  const stddev = Math.sqrt(sq / samples.length);
  return { mean, median, p95, stddev };
}

async function run() {
  const resultsDir = path.resolve(process.cwd(), "bench", "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const N = 20000; // iterations per sample
  const batch = Array.from({ length: 100 }, (_, i) => i);
  const samples = 5;
  const warmups = 2;

  // Helper to measure a case
  function measure(fn: () => void) {
    // warm-up
    for (let w = 0; w < warmups; w++) fn();
    const sampleTimes: number[] = [];
    for (let s = 0; s < samples; s++) {
      const t0 = now();
      fn();
      const t1 = now();
      sampleTimes.push(t1 - t0);
    }
    return stats(sampleTimes);
  }

  const out: any = { env: { node: process.version, platform: process.platform }, cases: {} };

  out.cases["push loop"] = measure(() => {
    const rb = new RingBuffer<number>(1000);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < batch.length; j++) rb.push(batch[j]);
    }
  });

  out.cases["pushMany array"] = measure(() => {
    const rb = new RingBuffer<number>(1000);
    for (let i = 0; i < N; i++) rb.pushMany(batch);
  });

  out.cases["array shift simulation"] = measure(() => {
    const cap = 1000;
    const arr: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < batch.length; j++) {
        arr.push(batch[j]);
        if (arr.length > cap) arr.shift();
      }
    }
  });

  const outPath = path.join(resultsDir, "ring-buffer.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", outPath);
  console.log(JSON.stringify(out, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
