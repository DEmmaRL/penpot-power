import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateFixtureResetCode,
  getTaskVerifier,
  wilsonInterval,
  analyzeEvalCsv,
  formatEvalReportMarkdown
} from "../eval-harness.mjs";

test("generateFixtureResetCode cleans stale EVAL_* shapes and creates EVAL_FIX_Board + EVAL_T12_old", () => {
  const code = generateFixtureResetCode();
  const createdShapes = [];
  let removedCount = 0;

  const staleShape = {
    name: "EVAL_T01",
    remove() {
      removedCount++;
    }
  };

  const mockPenpot = {
    currentPage: {
      id: "page-1",
      name: "EvalPage",
      root: { id: "root", children: [] }
    },
    createBoard() {
      const b = {
        type: "board",
        children: [],
        resize(w, h) {
          this.width = w;
          this.height = h;
        },
        appendChild(c) {
          this.children.push(c);
        }
      };
      createdShapes.push(b);
      return b;
    },
    createRectangle() {
      const r = {
        type: "rectangle",
        resize(w, h) {
          this.width = w;
          this.height = h;
        }
      };
      createdShapes.push(r);
      return r;
    }
  };
  const mockUtils = {
    findShapes(pred) {
      return [staleShape, ...createdShapes].filter(pred);
    },
    setParentXY(shape, x, y) {
      shape.parentX = x;
      shape.parentY = y;
    }
  };

  const fn = new Function("penpot", "penpotUtils", code);
  const res = fn(mockPenpot, mockUtils);

  assert.equal(res.status, "ready");
  assert.equal(res.removed, 1);
  assert.equal(removedCount, 1);

  const fixBoard = createdShapes.find(s => s.name === "EVAL_FIX_Board");
  assert.ok(fixBoard);
  assert.equal(fixBoard.width, 400);
  assert.equal(fixBoard.height, 300);
  assert.equal(fixBoard.children.length, 3);

  const t12 = createdShapes.find(s => s.name === "EVAL_T12_old");
  assert.ok(t12);
  assert.equal(t12.opacity, 1);
});

test("getTaskVerifier returns task metadata and verifier for T01..T13", () => {
  const t03 = getTaskVerifier("T03");
  assert.equal(t03.id, "T03");
  assert.equal(t03.category, "create");
  assert.equal(t03.control, false);
  assert.equal(t03.verify.type, "penpot");

  const t12 = getTaskVerifier("t12");
  assert.equal(t12.control, true);
});

test("wilsonInterval computes accurate 95% confidence bounds", () => {
  const perfect = wilsonInterval(10, 10);
  assert.equal(perfect.rate, 100);
  assert.equal(perfect.upper, 100);
  assert.ok(perfect.lower > 70 && perfect.lower < 75); // ~72.2%

  const half = wilsonInterval(5, 10);
  assert.equal(half.rate, 50);
  assert.ok(half.lower > 23 && half.upper < 77);
});

test("analyzeEvalCsv and formatEvalReportMarkdown summarize runs per arm, category, and control", () => {
  const csv = [
    "order,rep,task,arm,pass,execute_code_calls,execute_code_errors,seconds,human_intervention",
    "1,1,T01,A,false,3,1,20,no",
    "2,1,T01,B,true,1,0,8,no",
    "3,1,T03,A,false,4,2,35,no",
    "4,1,T03,B,true,2,0,12,no",
    "5,1,T12,A,true,1,0,7,no",
    "6,1,T12,B,true,1,0,6,no"
  ].join("\n");

  const report = analyzeEvalCsv(csv);
  assert.equal(report.totalRuns, 6);
  assert.equal(report.byArm.A.treatment.rate, 0);
  assert.equal(report.byArm.B.treatment.rate, 100);
  assert.equal(report.byArm.A.control.rate, 100);
  assert.equal(report.byArm.B.control.rate, 100);

  const md = formatEvalReportMarkdown(report);
  assert.match(md, /Wilson 95% CI/);
  assert.match(md, /\| B \| treatment \| 2\/2 \| 100%/);
});
