import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCssTokens, cssToDtcg, tokensToPenpotScript, resolveTokenCollisions } from "../css-to-tokens.mjs";
import { tokensToCss } from "../tokens-to-css.mjs";

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

test("parseCssTokens automatically resolves leaf-vs-branch prefix collisions", () => {
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

  const fontSize3xlBase = tokens.find(t => t.name === "font.size.3xl.base");
  assert.ok(fontSize3xlBase, "font.size.3xl should be renamed to font.size.3xl.base");
  assert.equal(fontSize3xlBase.value, "30px");

  const fontSize3xl5 = tokens.find(t => t.name === "font.size.3xl.5");
  assert.ok(fontSize3xl5);
  assert.equal(fontSize3xl5.value, "34px");

  // DTCG export should not clobber branch nodes
  const { dtcg } = cssToDtcg(collidingCss);
  assert.equal(dtcg.color.primary.base.$value, "#2563EB");
  assert.equal(dtcg.color.primary.hover.$value, "#1D4ED8");
  assert.equal(dtcg.color.text.base.$value, "#0F172A");
  assert.equal(dtcg.color.text.muted.$value, "#64748B");
});

test("resolveTokenCollisions handles fallback when .base already exists", () => {
  const input = [
    { name: "color.brand", value: "#111111", type: "color" },
    { name: "color.brand.base", value: "#222222", type: "color" },
    { name: "color.brand.hover", value: "#333333", type: "color" }
  ];
  const resolved = resolveTokenCollisions(input);
  const renamed = resolved.find(t => t.name.startsWith("color.brand.default"));
  assert.ok(renamed, "Should fall back to .default when .base already exists");
  assert.equal(renamed.value, "#111111");
});

test("tokensToPenpotScript removes stale conflicting tokens in Penpot runtime", () => {
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

  const mockSet = {
    name: "Clean Test",
    active: true,
    tokens: [staleToken],
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
  assert.deepEqual(
    mockSet.tokens.map(t => t.name),
    ["color.primary.base", "color.primary.hover"]
  );
});
