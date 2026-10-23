import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCssTokens, cssToDtcg, tokensToPenpotScript, resolveTokenCollisions, smartDotSplit } from "../css-to-tokens.mjs";
import { tokensToCss, tokensToTailwind } from "../tokens-to-css.mjs";

const sampleCss = `
/* Design tokens */
:root {
  --color-brand-primary: #2563EB;
  --color-text-primary: #0F172A;
  --color-text-muted: var(--color-text-primary);
  --spacing-md: 16px;
  --spacing-lg: 1.5rem;
  --radius-card: 12px;
  --font-size-xl: 20px;
  --font-weight-bold: 700;
  --font-family-body: "Atkinson Hyperlegible", sans-serif;
}
`;

test("parseCssTokens extracts custom properties, types, rem conversion, and var() aliases", () => {
  const tokens = parseCssTokens(sampleCss);
  assert.equal(tokens.length, 9);

  const primary = tokens.find(t => t.name === "color.brand.primary");
  assert.equal(primary.type, "color");
  assert.equal(primary.value, "#2563EB");

  const muted = tokens.find(t => t.name === "color.text.muted");
  assert.equal(muted.type, "color");
  assert.equal(muted.value, "{color.text.primary}");

  const lg = tokens.find(t => t.name === "spacing.lg");
  assert.equal(lg.type, "spacing");
  assert.equal(lg.value, "24px");

  const font = tokens.find(t => t.name === "font.family.body");
  assert.equal(font.type, "fontFamilies");
  assert.equal(font.value, "Atkinson Hyperlegible, sans-serif");
});

test("cssToDtcg produces standard W3C DTCG JSON and round-trips through tokensToCss", () => {
  const { dtcg, count } = cssToDtcg(sampleCss);
  assert.equal(count, 9);
  assert.equal(dtcg.color.brand.primary.$value, "#2563EB");
  assert.equal(dtcg.color.brand.primary.$type, "color");
  assert.equal(dtcg.radius.card.$type, "dimension");
  assert.equal(dtcg.radius.card.$extensions["app.penpot"].type, "borderRadius");

  const roundTrip = tokensToCss(dtcg);
  assert.match(roundTrip.css, /--color-brand-primary: #2563EB;/);
  assert.match(roundTrip.css, /--color-text-muted: var\(--color-text-primary\);/);
  assert.match(roundTrip.css, /--spacing-lg: 24px;/);
  assert.match(roundTrip.css, /--radius-card: 12px;/);
  assert.match(roundTrip.css, /--font-family-body: "Atkinson Hyperlegible", sans-serif;/);
});

test("tokensToPenpotScript generates runnable execute_code JS that upserts tokens", () => {
  const { code, count } = tokensToPenpotScript(sampleCss, { setName: "Brand Tokens" });
  assert.equal(count, 9);
  assert.match(code, /"Brand Tokens"/);

  // Execute the generated code against a mocked Penpot Plugin API runtime
  const addedTokens = [];
  const mockSet = {
    name: "Brand Tokens",
    active: false,
    tokens: [{ name: "color.brand.primary", value: "#000000" }],
    toggleActive() {
      this.active = !this.active;
    },
    addToken(tok) {
      addedTokens.push(tok);
      this.tokens.push(tok);
      return tok;
    }
  };
  const mockPenpot = {
    currentPage: { id: "page-1", name: "Home" },
    library: {
      local: {
        tokens: {
          sets: [mockSet],
          addSet(s) {
            this.sets.push(s);
            return s;
          }
        }
      }
    }
  };

  const fn = new Function("penpot", code);
  const result = fn(mockPenpot);

  assert.equal(result.set, "Brand Tokens");
  assert.equal(result.active, true);
  assert.equal(result.total, 9);
  assert.equal(result.updated, 1);
  assert.equal(result.created, 8);
  assert.equal(mockSet.tokens[0].value, "#2563EB");

  const spacingMd = addedTokens.find(t => t.name === "spacing.md");
  assert.equal(spacingMd.type, "spacing");
  assert.equal(spacingMd.value, "16"); // stripped trailing px for Penpot numeric dimension
});

test("rejects CSS without custom properties", () => {
  assert.throws(() => parseCssTokens("body { color: red; }"), /No CSS custom properties/);
});

test("smartDotSplit keeps numeric scale sub-steps intact (3xl-5, 1-5) while splitting semantic groups", () => {
  assert.equal(smartDotSplit("3xl-5"), "3xl-5");
  assert.equal(smartDotSplit("1-5"), "1-5");
  assert.equal(smartDotSplit("primary-hover"), "primary.hover");
  assert.equal(smartDotSplit("blue-500"), "blue.500");
});

test("parseCssTokens resolves leaf-vs-branch collisions, avoids numeric folder splits, and round-trips losslessly back to CSS & Tailwind", () => {
  const collidingCss = `
    :root {
      --color-primary: #2563EB;
      --color-primary-hover: #1D4ED8;
      --color-primary-active: #1E40AF;
      --color-text: #0F172A;
      --color-text-muted: #64748B;
      --btn-bg: var(--color-primary);
      --font-size-3xl: 30px;
      --font-size-3xl-5: 34px;
    }
  `;
  const tokens = parseCssTokens(collidingCss);
  assert.equal(tokens.length, 8);

  const primaryBase = tokens.find(t => t.name === "color.primary.base");
  assert.ok(primaryBase, "color.primary should be renamed to color.primary.base");
  assert.equal(primaryBase.originalName, "color.primary");
  assert.equal(primaryBase.value, "#2563EB");

  const primaryHover = tokens.find(t => t.name === "color.primary.hover");
  assert.ok(primaryHover);
  assert.equal(primaryHover.value, "#1D4ED8");

  const textBase = tokens.find(t => t.name === "color.text.base");
  assert.ok(textBase, "color.text should be renamed to color.text.base");
  assert.equal(textBase.value, "#0F172A");

  const textMuted = tokens.find(t => t.name === "color.text.muted");
  assert.ok(textMuted);

  const btnBg = tokens.find(t => t.name === "btn.bg");
  assert.ok(btnBg);
  assert.equal(btnBg.value, "{color.primary.base}", "Alias should resolve to the renamed .base token");

  // Because smartDotSplit keeps 3xl-5 intact as a sibling of 3xl, neither collides!
  const fontSize3xl = tokens.find(t => t.name === "font.size.3xl");
  assert.ok(fontSize3xl, "font.size.3xl remains a clean sibling without needing .base");
  assert.equal(fontSize3xl.value, "30px");

  const fontSize3xl5 = tokens.find(t => t.name === "font.size.3xl-5");
  assert.ok(fontSize3xl5, "font.size.3xl-5 keeps its hyphen instead of creating a .5 folder");
  assert.equal(fontSize3xl5.value, "34px");

  // DTCG export preserves branch structure AND round-trips losslessly back to exact original CSS names!
  const { dtcg } = cssToDtcg(collidingCss);
  assert.equal(dtcg.color.primary.base.$value, "#2563EB");
  assert.equal(dtcg.color.primary.hover.$value, "#1D4ED8");
  assert.equal(dtcg.font.size["3xl"].$value, "30px");
  assert.equal(dtcg.font.size["3xl-5"].$value, "34px");

  const roundTripCss = tokensToCss(dtcg).css;
  assert.match(roundTripCss, /--color-primary: #2563EB;/);
  assert.doesNotMatch(roundTripCss, /--color-primary-base:/);
  assert.match(roundTripCss, /--color-primary-hover: #1D4ED8;/);
  assert.match(roundTripCss, /--btn-bg: var\(--color-primary\);/);
  assert.match(roundTripCss, /--font-size-3xl: 30px;/);
  assert.match(roundTripCss, /--font-size-3xl-5: 34px;/);

  const { theme } = tokensToTailwind(dtcg);
  assert.equal(theme.colors["primary"], "#2563EB");
  assert.equal(theme.colors["primary-hover"], "#1D4ED8");
  assert.equal(theme.fontSize["3xl"], "30px");
  assert.equal(theme.fontSize["3xl-5"], "34px");
});

test("resolveTokenCollisions handles fallback when .base already exists or is a branch prefix", () => {
  const input = [
    { name: "color.brand", value: "#111111", type: "color" },
    { name: "color.brand.base", value: "#222222", type: "color" },
    { name: "color.brand.hover", value: "#333333", type: "color" }
  ];
  const resolved = resolveTokenCollisions(input);
  const renamed = resolved.find(t => t.name === "color.brand.default");
  assert.ok(renamed, "Should fall back to .default when .base already exists as a leaf");
  assert.equal(renamed.value, "#111111");
  assert.equal(renamed.originalName, "color.brand");

  // Case where .base is not a leaf, but IS a prefix of a deeper token (color.brand.base.hover)
  const branchPrefixInput = [
    { name: "color.brand", value: "#111111", type: "color" },
    { name: "color.brand.base.hover", value: "#222222", type: "color" }
  ];
  const resolvedBranch = resolveTokenCollisions(branchPrefixInput);
  const renamedBranch = resolvedBranch.find(t => t.name === "color.brand.default");
  assert.ok(renamedBranch, "Should fall back to .default when .base is already a branch prefix");
  assert.equal(renamedBranch.value, "#111111");
});

test("resolveTokenCollisions handles multi-level cascading collisions (a, a.b, a.b.c)", () => {
  const css = `
    :root {
      --color-surface: #FFFFFF;
      --color-surface-card: #F8FAFC;
      --color-surface-card-elevated: #F1F5F9;
      --panel-bg: var(--color-surface-card);
    }
  `;
  const tokens = parseCssTokens(css);
  const names = tokens.map(t => t.name);
  assert.deepEqual(names, [
    "color.surface.base",
    "color.surface.card.base",
    "color.surface.card.elevated",
    "panel.bg"
  ]);
  const panelBg = tokens.find(t => t.name === "panel.bg");
  assert.equal(panelBg.value, "{color.surface.card.base}");
});

test("tokensToPenpotScript resolves cross-set collisions from JSON sets input", () => {
  const multiSetJson = {
    sets: [
      {
        name: "Core",
        active: true,
        tokensByType: [
          { type: "color", tokens: [{ name: "color.accent", value: "#3B82F6" }] }
        ]
      },
      {
        name: "Semantic",
        active: true,
        tokensByType: [
          { type: "color", tokens: [{ name: "color.accent.hover", value: "#2563EB" }] }
        ]
      }
    ]
  };
  const { tokens } = tokensToPenpotScript(multiSetJson);
  assert.deepEqual(
    tokens.map(t => t.name),
    ["color.accent.base", "color.accent.hover"]
  );
});

test("tokensToPenpotScript removes stale conflicting tokens and heals existing aliases in Penpot runtime", () => {
  const collidingCss = `
    :root {
      --color-primary: #2563EB;
      --color-primary-hover: #1D4ED8;
    }
  `;
  const { code } = tokensToPenpotScript(collidingCss, { setName: "Clean Test" });

  const removed = [];
  const added = [];
  const staleToken = {
    name: "color.primary",
    value: "#000000",
    remove() {
      removed.push(this.name);
      const idx = mockSet.tokens.indexOf(this);
      if (idx !== -1) mockSet.tokens.splice(idx, 1);
    }
  };
  const existingAliasToken = {
    name: "color.link",
    value: "{color.primary}"
  };

  const mockSet = {
    name: "Clean Test",
    active: true,
    tokens: [staleToken, existingAliasToken],
    toggleActive() {},
    addToken(tok) {
      added.push(tok);
      this.tokens.push(tok);
      return tok;
    }
  };

  const mockPenpot = {
    currentPage: { id: "page-1", name: "Home" },
    library: {
      local: {
        tokens: {
          sets: [mockSet],
          addSet(s) {
            this.sets.push(s);
            return s;
          }
        }
      }
    }
  };

  const fn = new Function("penpot", code);
  const result = fn(mockPenpot);

  assert.equal(result.removed, 1, "Should report 1 stale conflicting token removed");
  assert.deepEqual(removed, ["color.primary"]);
  assert.equal(result.created, 2);
  assert.equal(
    existingAliasToken.value,
    "{color.primary.base}",
    "Pre-existing token aliasing {color.primary} should be healed to {color.primary.base}"
  );
  assert.deepEqual(
    mockSet.tokens.map(t => t.name),
    ["color.link", "color.primary.base", "color.primary.hover"]
  );
});
