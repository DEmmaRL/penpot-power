// Automated Evaluation Harness for penpot-power (see evals/README.md and evals/tasks.json).
//
// Subcommands:
//   node scripts/eval-harness.mjs setup              # Prints execute_code JS to reset/create EVAL_* fixtures on the current page
//   node scripts/eval-harness.mjs verify <T01..T13>  # Runs shell verifier or prints penpot execute_code verifier for a task
//   node scripts/eval-harness.mjs stats <log.csv>    # Computes pass rates and Wilson 95% confidence intervals per arm & category
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const tasksPath = join(rootDir, "evals/tasks.json");

export function loadTasksConfig() {
  return JSON.parse(readFileSync(tasksPath, "utf8"));
}

export function generateFixtureResetCode() {
  return [
    `if (!penpot.currentPage) return { status: "no_page", error: "No Penpot page is focused." };`,
    `const page = penpot.currentPage;`,
    `// 1. Remove any EVAL_* shapes from previous runs`,
    `const stale = penpotUtils.findShapes(s => typeof s.name === "string" && s.name.startsWith("EVAL_"), page.root);`,
    `let removed = 0;`,
    `for (const s of stale) {`,
    `  try { s.remove(); removed++; } catch {}`,
    `}`,
    `// 2. Ensure at least one baseline non-EVAL board exists for T01 and T06`,
    `const existingBoards = penpotUtils.findShapes(s => s.type === "board", page.root);`,
    `if (existingBoards.length === 0) {`,
    `  const base = penpot.createBoard();`,
    `  base.name = "Baseline_Screen";`,
    `  base.x = 500;`,
    `  base.y = 0;`,
    `  base.resize(375, 812);`,
    `  base.fills = [{ fillColor: "#F8FAFC", fillOpacity: 1 }];`,
    `}`,
    `// 3. Create EVAL_FIX_Board (400x300, white fill, 3 #FF0000 rectangles)`,
    `const fixBoard = penpot.createBoard();`,
    `fixBoard.name = "EVAL_FIX_Board";`,
    `fixBoard.x = 0;`,
    `fixBoard.y = 0;`,
    `fixBoard.resize(400, 300);`,
    `fixBoard.fills = [{ fillColor: "#FFFFFF", fillOpacity: 1 }];`,
    `for (let i = 0; i < 3; i++) {`,
    `  const r = penpot.createRectangle();`,
    `  r.name = "EVAL_FIX_Rect_" + (i + 1);`,
    `  r.resize(80, 60);`,
    `  r.fills = [{ fillColor: "#FF0000", fillOpacity: 1 }];`,
    `  fixBoard.appendChild(r);`,
    `  penpotUtils.setParentXY(r, 20 + i * 110, 40);`,
    `}`,
    `// 4. Create EVAL_T12_old (top-level rectangle not inside any board)`,
    `const t12 = penpot.createRectangle();`,
    `t12.name = "EVAL_T12_old";`,
    `t12.x = 0;`,
    `t12.y = 360;`,
    `t12.resize(120, 60);`,
    `t12.opacity = 1;`,
    `t12.fills = [{ fillColor: "#3B82F6", fillOpacity: 1 }];`,
    `return { status: "ready", removed, fixtures: ["EVAL_FIX_Board", "EVAL_T12_old"] };`
  ].join("\n");
}

export function getTaskVerifier(taskId) {
  const { tasks } = loadTasksConfig();
  const task = tasks.find(t => t.id.toUpperCase() === String(taskId).toUpperCase());
  if (!task) {
    throw new Error(`Unknown task ID "${taskId}". Valid IDs: ${tasks.map(t => t.id).join(", ")}`);
  }
  return {
    id: task.id,
    category: task.category,
    control: Boolean(task.control),
    prompt: task.prompt,
    verify: task.verify
  };
}

export function runShellVerifier(taskId) {
  const task = getTaskVerifier(taskId);
  if (task.verify.type !== "shell") {
    throw new Error(`Task ${task.id} uses a "${task.verify.type}" verifier, not "shell".`);
  }
  try {
    execSync(task.verify.code, { cwd: rootDir, stdio: "pipe" });
    return { id: task.id, type: "shell", pass: true };
  } catch (err) {
    return {
      id: task.id,
      type: "shell",
      pass: false,
      error: err.message
    };
  }
}

export function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (total <= 0) {
    return { successes: 0, total: 0, rate: 0, lower: 0, upper: 0 };
  }
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  const round = n => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 10; // percentage to 1 decimal place
  return {
    successes,
    total,
    rate: round(p),
    lower: round(center - halfWidth),
    upper: round(center + halfWidth)
  };
}

export function analyzeEvalCsv(csvText) {
  const { tasks } = loadTasksConfig();
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const idxTask = headers.indexOf("task");
  const idxArm = headers.indexOf("arm");
  const idxPass = headers.indexOf("pass");

  if (idxTask === -1 || idxArm === -1 || idxPass === -1) {
    throw new Error("CSV header must include 'task', 'arm', and 'pass' columns.");
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    const taskId = cols[idxTask];
    const arm = cols[idxArm];
    const passVal = cols[idxPass]?.toLowerCase();
    const pass = passVal === "true" || passVal === "1" || passVal === "yes" || passVal === "pass";
    const meta = taskMap.get(taskId) || { category: "unknown", control: false };
    rows.push({
      taskId,
      arm,
      pass,
      category: meta.category,
      control: Boolean(meta.control)
    });
  }

  const arms = [...new Set(rows.map(r => r.arm))].sort();
  const byArm = {};
  const byArmCategory = {};

  for (const arm of arms) {
    const armRows = rows.filter(r => r.arm === arm);
    const nonControl = armRows.filter(r => !r.control);
    const controls = armRows.filter(r => r.control);

    byArm[arm] = {
      overall: wilsonInterval(armRows.filter(r => r.pass).length, armRows.length),
      treatment: wilsonInterval(nonControl.filter(r => r.pass).length, nonControl.length),
      control: wilsonInterval(controls.filter(r => r.pass).length, controls.length)
    };

    byArmCategory[arm] = {};
    const categories = [...new Set(armRows.map(r => r.category))].sort();
    for (const cat of categories) {
      const catRows = armRows.filter(r => r.category === cat);
      byArmCategory[arm][cat] = wilsonInterval(catRows.filter(r => r.pass).length, catRows.length);
    }
  }

  return { totalRuns: rows.length, byArm, byArmCategory };
}

export function formatEvalReportMarkdown(report) {
  const lines = [
    "# Evaluation Statistical Summary (Wilson 95% CI)",
    "",
    "| Arm | Group | Pass / Total | Rate (%) | 95% Wilson CI |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const [arm, groups] of Object.entries(report.byArm)) {
    for (const [groupName, stat] of Object.entries(groups)) {
      if (stat.total === 0) continue;
      lines.push(
        `| ${arm} | ${groupName} | ${stat.successes}/${stat.total} | ${stat.rate}% | [${stat.lower}%, ${stat.upper}%] |`
      );
    }
  }
  lines.push("", "## Breakdown by Category", "", "| Arm | Category | Pass / Total | Rate (%) | 95% Wilson CI |", "| --- | --- | --- | --- | --- |");
  for (const [arm, cats] of Object.entries(report.byArmCategory)) {
    for (const [cat, stat] of Object.entries(cats)) {
      lines.push(
        `| ${arm} | ${cat} | ${stat.successes}/${stat.total} | ${stat.rate}% | [${stat.lower}%, ${stat.upper}%] |`
      );
    }
  }
  return lines.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "setup") {
    process.stdout.write(generateFixtureResetCode() + "\n");
  } else if (cmd === "verify" && arg) {
    const task = getTaskVerifier(arg);
    if (task.verify.type === "shell") {
      const res = runShellVerifier(arg);
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      process.exit(res.pass ? 0 : 1);
    } else {
      process.stdout.write(task.verify.code + "\n");
    }
  } else if (cmd === "stats" && arg) {
    const csv = readFileSync(arg, "utf8");
    const report = analyzeEvalCsv(csv);
    process.stdout.write(formatEvalReportMarkdown(report));
  } else {
    console.error("Usage:");
    console.error("  node scripts/eval-harness.mjs setup");
    console.error("  node scripts/eval-harness.mjs verify <T01..T13>");
    console.error("  node scripts/eval-harness.mjs stats <results.csv>");
    process.exit(2);
  }
}
