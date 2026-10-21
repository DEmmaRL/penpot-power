import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCssTokens, cssToDtcg, tokensToPenpotScript } from "../css-to-tokens.mjs";
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
