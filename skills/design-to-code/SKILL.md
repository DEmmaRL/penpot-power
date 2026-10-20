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
if ambiguous, the session/file (see `connection-setup` for session selection).

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

For images/icons, use `export_shape` (pass the shape ID, `"selection"`, or `"page"`; SVG preferred for icons, PNG for raster, or `mode: "fill"` for raw image fills) and reference the exported assets in the generated code.

## Step 4: Translate to the target stack

- Map Penpot flex layouts to CSS flexbox/grid; preserve gap and direction.
- Convert design tokens to CSS variables (or the project's token system).
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

- Remote MCP mode does not write to the local filesystem. Produce the code in
  the Kiro workspace using normal file tools; use Penpot only as the design
  source. (If the user needs the MCP server itself to touch local files, that
  requires the local Penpot MCP server, which this power does not configure.)
- Round sub-pixel values sensibly; Penpot may report fractional sizes.

---

*Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT) and [penpot/penpot MCP docs](https://github.com/penpot/penpot/blob/main/mcp/README.md) (MPL-2.0). Some portions remain substantially similar to the MIT source; see [NOTICE](../../NOTICE).*
