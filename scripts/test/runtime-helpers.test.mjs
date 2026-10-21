import { test } from "node:test";
import assert from "node:assert/strict";
import { installRuntimeHelpers, getRuntimeHelpersBootstrapCode } from "../runtime-helpers.mjs";

function createMockEnv() {
  const board = {
    id: "b1",
    name: "HeroBoard",
    type: "board",
    x: 100,
    y: 0,
    width: 375,
    height: 812,
    fills: [{ fillColor: "#FFFFFF", fillOpacity: 1 }],
    flex: { rowGap: 15, columnGap: 8 } // 15 is off-4px grid, 8 is on-grid
  };
  const goodText = {
    id: "t1",
    name: "Heading",
    type: "text",
    fontSize: 24,
    fontWeight: 700,
    fills: [{ fillColor: "#2563EB" }],
    tokens: { fill: "color.brand.primary", "font-size": "font.size.2xl" },
    parent: board
  };
  const lowContrastText = {
    id: "t2",
    name: "LowContrastHint",
    type: "text",
    fontSize: 13, // off-scale font size
    fontWeight: 400,
    fills: [{ fillColor: "#CCCCCC" }], // off-system color + fails WCAG AA against #FFFFFF
    parent: board
  };
  const tinyBtn = {
    id: "btn1",
    name: "Close icon-btn",
    type: "rectangle",
    width: 18,
    height: 18, // fails 24x24 WCAG 2.2 AA touch target
    fills: [{ fillColor: "#2563EB" }],
    strokes: [{ strokeColor: "#FF00FF" }], // off-system stroke
    parent: board
  };
  board.children = [goodText, lowContrastText, tinyBtn];

  const allShapes = [board, goodText, lowContrastText, tinyBtn];
  const penpot = {
    currentPage: {
      id: "page-1",
      name: "Dashboard",
      root: {
        id: "root",
        children: [board]
      }
    },
    library: {
      local: {
        colors: [{ name: "Surface White", color: "#FFFFFF" }],
        tokens: {
          sets: [
            {
              name: "Core",
              active: true,
              tokensByType: [
                ["color", [{ name: "color.brand.primary", value: "#2563EB", resolvedValueString: "#2563EB" }]],
                ["fontSizes", [{ name: "font.size.2xl", value: "24", resolvedValueString: "24" }]],
                ["borderRadius", [{ name: "radius.md", value: "8", resolvedValueString: "8" }]]
              ]
            }
          ]
        }
      }
    }
  };
  const penpotUtils = {
    findShapes(predicate) {
      return allShapes.filter(predicate);
    }
  };
  const storage = {};
  return { penpot, penpotUtils, storage };
}

test("installRuntimeHelpers populates storage.helpers and runs healthcheck & page guard", () => {
  const { penpot, penpotUtils, storage } = createMockEnv();
  const helpers = installRuntimeHelpers(penpot, penpotUtils, storage);
  assert.ok(storage.helpers);

  const ok = helpers.healthcheck("Dashboard");
  assert.equal(ok.status, "connected");
  assert.equal(ok.totalBoards, 1);

  const wrong = helpers.healthcheck("Login");
  assert.equal(wrong.status, "wrong_page");
  assert.equal(wrong.page, "Dashboard");
});

test("nextBoardPosition computes non-overlapping X coordinate", () => {
  const { penpot, penpotUtils, storage } = createMockEnv();
  const helpers = installRuntimeHelpers(penpot, penpotUtils, storage);
  const pos = helpers.nextBoardPosition(100);
  // existing board is at x=100, width=375 -> 100 + 375 + 100 = 575
  assert.deepEqual(pos, { x: 575, y: 0 });
});

test("contrastRatio computes accurate WCAG 2.x luminance ratio", () => {
  const { penpot, penpotUtils, storage } = createMockEnv();
  const helpers = installRuntimeHelpers(penpot, penpotUtils, storage);
  assert.equal(helpers.contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(helpers.contrastRatio("#FFFFFF", "#FFFFFF"), 1);
});

test("auditPage distinguishes bound tokens, flags off-system props, and detects WCAG contrast & touch-target issues", () => {
  const { penpot, penpotUtils, storage } = createMockEnv();
  const helpers = installRuntimeHelpers(penpot, penpotUtils, storage);
  const report = helpers.auditPage();

  assert.equal(report.boundTokenCount, 2); // goodText fill + font-size
  assert.ok(report.deviationsCount >= 4); // lowContrast fill, lowContrast fontSize, tinyBtn strokeColor, board rowGap 15px
  assert.equal(report.a11yIssuesCount, 2); // lowContrastText WCAG contrast + tinyBtn 18x18 target size
  assert.ok(report.a11yIssues.some(i => i.rule === "WCAG-AA-contrast" && i.shape === "LowContrastHint"));
  assert.ok(report.a11yIssues.some(i => i.rule === "WCAG-2.5.8-target-size" && i.shape === "Close icon-btn"));
});

test("exportTokensDtcg and exportTokensRawSets produce valid schemas", () => {
  const { penpot, penpotUtils, storage } = createMockEnv();
  const helpers = installRuntimeHelpers(penpot, penpotUtils, storage);

  const dtcg = helpers.exportTokensDtcg();
  assert.equal(dtcg.color.brand.primary.$value, "#2563EB");
  assert.equal(dtcg.radius.md.$type, "dimension");
  assert.equal(dtcg.radius.md.$extensions["app.penpot"].type, "borderRadius");

  const rawSets = helpers.exportTokensRawSets();
  assert.ok(Array.isArray(rawSets.sets));
  assert.equal(rawSets.sets[0].name, "Core");
  assert.equal(rawSets.sets[0].active, true);
  assert.ok(Array.isArray(rawSets.sets[0].tokensByType));
});

test("getRuntimeHelpersBootstrapCode executes cleanly inside a Function sandbox", () => {
  const { penpot, penpotUtils, storage } = createMockEnv();
  const code = getRuntimeHelpersBootstrapCode("healthcheck()");
  const fn = new Function("penpot", "penpotUtils", "storage", code);
  const res = fn(penpot, penpotUtils, storage);
  assert.equal(res.status, "connected");
});
