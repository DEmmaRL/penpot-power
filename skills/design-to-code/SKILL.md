---
name: design-to-code
description: >
  Extract production-ready code and specs from a Penpot design: generate CSS
  from a selection, read exact measurements, colors, typography, and spacing,
  and translate boards/components into framework markup (HTML/CSS, React, etc.).
  Use when the user wants to implement a Penpot design in code or keep code in
  sync with a design.
---

# Design-to-Code from Penpot

Turn a Penpot design into accurate code. The goal is fidelity: pull real values
from the file rather than eyeballing them.

## Prerequisite

Tools must be reachable (run `connection-setup`), and you should know which
board/component to translate.

## Step 1: Pin down the target

Identify the exact shape(s) to implement. Confirm the board/component name and,
if ambiguous, confirm the target page is the focused one. Remote MCP always acts on the focused page (see `connection-setup`).

## Step 2: Extract CSS, `@font-face` rules, and markup directly from Penpot

Penpot can emit CSS, `@font-face` declarations, and HTML/SVG markup for an array
of shapes:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const sel = penpotUtils.findShapes(s => s.name === 'TargetBoard', penpot.currentPage.root)[0];
if (!sel) return "No shape named 'TargetBoard' found on the focused page.";
// generateStyle, generateMarkup, and generateFontFaces all expect an ARRAY of shapes.
const css = penpot.generateStyle([sel], { type: 'css', includeChildren: true });
const fontFaces = await penpot.generateFontFaces([sel]);
const html = penpot.generateMarkup([sel], { type: 'html' });
return { css, fontFaces, html };
```

Use these as the source of truth for colors, spacing, radii, typography,
webfonts, and DOM structure rather than re-deriving them by hand. Never
`console.log` the returned `css` or `html` (returning them is sufficient and
avoids duplicating large payloads).

## Step 3: Read structure, tokens, and measurements

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
// shapeStructure takes a shape (and optional max depth).
const structure = penpotUtils.shapeStructure(penpot.currentPage.root, 4);
const tokens = penpotUtils.tokenOverview ? penpotUtils.tokenOverview() : {};
// Inspect nesting, sizes (shape.width/height), positions, fills, fontSize/fontWeight, and bound tokens (shape.tokens)
return { structure, tokens };
```

> **Tip (Token Compliance Check):** Run the **Token Compliance Audit** from the
> `read-inspect` skill on `TargetBoard` before translating to code. It flags
> off-system hex colors or unlinked font sizes so you can normalize them to proper
> design tokens rather than hardcoding accidental values into the generated code.

For icons, use the SVG markup from `penpot.generateMarkup(shapes, { type: 'svg' })` directly, which avoids an export round trip. For raster images or raw image fills, use `export_shape` (pass the shape ID, `"selection"`, or `"page"`; PNG, or `mode: "fill"`) and reference the exported assets in the generated code.

## Step 4: Translate to the target stack

- **Deterministic Design Tokens Compilation:**
  If the file has design tokens, export them using `asset-and-token-sync` (into `tokens.json`), then compile them deterministically:
  ```bash
  # Pure CSS custom properties (:root)
  node scripts/tokens-to-css.mjs tokens.json tokens.css

  # Tailwind v4 theme block (@theme)
  node scripts/tokens-to-css.mjs tokens.json theme.css --theme

  # Tailwind v3 JavaScript config module
  node scripts/tokens-to-css.mjs tokens.json tailwind.tokens.js --tailwind
  ```
  *Why use this script over LLM transcription?* The script is deterministic, unit-tested, resolves aliases (`var(--...)`), normalizes unitless values into `px`, quotes font families safely, and avoids manual syntax errors.

- Map Penpot flex layouts to CSS flexbox/grid; preserve gap and direction.
- Reuse existing components in code where the design reuses Penpot components.
- Keep names aligned with the design (board/component names → component names).

Ask the user which framework/convention to target (plain HTML/CSS, React +
CSS Modules, Tailwind, etc.) if not already established in the project.

## Step 5: Verify fidelity

- Compare the rendered code against an `export_shape` of the Penpot board.
- Check spacing, font sizes, and colors against the extracted CSS.
- Confirm accessibility basics carried over (semantic elements, contrast, focus,
  touch target sizes).

## Notes

- Penpot MCP servers (`penpot-local` and `penpot-remote`) run in an isolated
  plugin sandbox and do not write to your project directory. Always generate code
  files directly in your local workspace using your normal file-writing tools,
  using Penpot exclusively as the visual design and style source.
- Round sub-pixel values sensibly; Penpot may report fractional sizes.

---

*Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT) and [penpot/penpot MCP docs](https://github.com/penpot/penpot/blob/main/mcp/README.md) (MPL-2.0). Some portions remain substantially similar to the MIT source; see [NOTICE](../../NOTICE).*
