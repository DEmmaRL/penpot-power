// Generates a reproducible run schedule: every task x arm x repetition, shuffled with a fixed seed.
// Usage: node evals/schedule.mjs [seed=20261020] [reps=5] > evals/out/schedule.csv
import { readFileSync } from "node:fs";

const seed = Number(process.argv[2] ?? 20261020);
const reps = Number(process.argv[3] ?? 5);
const { tasks } = JSON.parse(readFileSync(new URL("./tasks.json", import.meta.url), "utf8"));

// mulberry32: small seeded PRNG so the schedule is identical on every machine.
function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const rows = [["order", "rep", "task", "arm"]];
let order = 0;
for (let rep = 1; rep <= reps; rep++) {
  for (const task of shuffle(tasks.map(t => t.id))) {
    // Alternate which arm runs first, so neither arm always gets the warm or cold state.
    const arms = rep % 2 === 1 ? ["A", "B"] : ["B", "A"];
    for (const arm of arms) rows.push([++order, rep, task, arm]);
  }
}
console.log(rows.map(r => r.join(",")).join("\n"));
