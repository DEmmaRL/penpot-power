---
name: read-inspect
description: >
  Explore and inspect an existing Penpot file: list pages, walk the shape
  hierarchy, find elements by type or name, discover an existing design system
  (colors, type styles, components, tokens), and export shapes as PNG/SVG for
  visual review. Use when the user wants to understand, audit, or report on a
  design before changing it.
---

# Inspect a Penpot File

Use this skill to build an accurate mental model of a file before creating or
modifying anything. Always inspect first — it prevents duplicate components and
off-system colors.

## Prerequisite

Tools must be reachable. If not, run the `connection-setup` skill first.

## Core tools

| Tool | Purpose |
| --- | --- |
| `high_level_overview` | Fast summary of the currently focused page (good first call) |
| `penpot_api_info` | Retrieve Penpot Plugin API documentation on demand |
| `execute_code` | Run JavaScript in the Penpot plugin context (the main workhorse) |
| `export_shape` | Export a shape as PNG/SVG for visual inspection (returned inline; no local-path export in remote mode) |

Tool names are namespaced by Kiro when the power is installed (e.g.
`power-penpot-penpot-...`). Call them as exposed in your session.

## Inspection workflow

> **Precondition guard.** `penpot.currentPage` can be null if no file/page is
> focused. Guard before dereferencing `.root`, otherwise you get a cryptic
> `TypeError`. Include this check at the top of code that touches the page:
>
> ```javascript
> if (!penpot.currentPage) return "No Penpot page is focused. Open a file and connect the plugin.";
> ```

1. **Hierarchy** — get the shape structure to see nesting. `shapeStructure`
   takes a shape argument (and an optional max depth — use it on large files to
   avoid blowing up the context window):

   ```javascript
   if (!penpot.currentPage) return "No Penpot page is focused.";
   // Pass the page root; cap depth on large files.
   return penpotUtils.shapeStructure(penpot.currentPage.root, 4);
   ```

2. **Find elements** — locate shapes by predicate:

   ```javascript
   const boards = penpotUtils.findShapes(s => s.type === 'board', penpot.currentPage.root);
   return boards.map(b => ({ name: b.name, x: b.x, y: b.y, w: b.width, h: b.height }));
   ```

3. **Discover the design system** — colors, text styles, components, and native design tokens in use:

   ```javascript
   if (!penpot.currentPage) return "No Penpot page is focused.";
   const all = penpotUtils.findShapes(() => true, penpot.currentPage.root);
   const colors = new Set();
   all.forEach(s => s.fills && s.fills.forEach(f => f.fillColor && colors.add(f.fillColor)));
   const textStyles = all
     .filter(s => s.type === 'text')
     .map(s => ({ fontSize: s.fontSize, fontWeight: s.fontWeight }));
   const lib = penpot.library.local;
   const tokens = penpotUtils.tokenOverview ? penpotUtils.tokenOverview() : {};
   return {
     colors: [...colors],
     textStyles,
     libraryColors: lib.colors.map(c => ({ name: c.name, color: c.color })),
     libraryTypographies: lib.typographies.map(t => t.name),
     componentCount: lib.components.length,
     tokens
   };
   ```

4. **Token Compliance Audit (Headless Token Linter)** — audit how well a board or page conforms to active design tokens before generating code:

   ```javascript
   if (!penpot.currentPage) return "No Penpot page is focused.";
   const tokenCatalog = penpot.library.local.tokens;
   const knownColors = new Map();
   const knownFontSizes = new Map();

   for (const set of tokenCatalog.sets || []) {
     if (!set.active) continue;
     for (const [type, tokens] of set.tokensByType || []) {
       for (const t of tokens || []) {
         const val = String(t.value ?? t.resolvedValueString ?? "").toUpperCase();
         if (type === "color" && val.startsWith("#")) knownColors.set(val, t.name);
         else if (type === "fontSizes" || type === "dimension") {
           const num = parseFloat(val);
           if (!isNaN(num)) knownFontSizes.set(num, t.name);
         }
       }
     }
   }
   for (const c of penpot.library.local.colors || []) {
     if (c.color) knownColors.set(c.color.toUpperCase(), `library:${c.name}`);
   }

   const allShapes = penpotUtils.findShapes(() => true, penpot.currentPage.root);
   let totalAudited = 0;
   let tokenizedCount = 0;
   const deviations = [];

   for (const s of allShapes) {
     if (s.fills && Array.isArray(s.fills)) {
       for (const f of s.fills) {
         if (f.fillColor) {
           totalAudited++;
           const hex = f.fillColor.toUpperCase();
           if (knownColors.has(hex)) tokenizedCount++;
           else deviations.push({ shape: s.name || s.id, prop: "fill", actual: hex, hint: "off-system color" });
         }
       }
     }
     if (s.type === "text" && s.fontSize) {
       totalAudited++;
       const sz = parseFloat(s.fontSize);
       if (knownFontSizes.has(sz)) tokenizedCount++;
       else deviations.push({ shape: s.name || s.id, prop: "fontSize", actual: `${s.fontSize}px`, hint: "off-scale font size" });
     }
   }

   const coverage = totalAudited > 0 ? Math.round((tokenizedCount / totalAudited) * 100) : 100;
   return {
     coverage: `${coverage}%`,
     totalAudited,
     tokenizedCount,
     deviationsCount: deviations.length,
     deviations: deviations.slice(0, 15)
   };
   ```

5. **Visual check** — when structure alone is not enough, export the shape and
   look at it:

   Call `export_shape` with a specific shape ID, `"selection"` (the user's first currently selected shape), or `"page"` (the entire current page), and `mode: "shape"` (default) or `"fill"` (raw image fill, PNG only), then inspect the returned image.

## `execute_code` best practices

- **Globals:** `execute_code` provides `penpot`, `penpotUtils`, and `storage` (a persistent object across `execute_code` calls). Copy `penpot.selection` or reusable helper functions into `storage` so subsequent calls can reference them even if the user changes their selection.
- **Never duplicate return values with `console.log`:** `execute_code` captures `console` output separately from the `return` value. Never `console.log` data you are returning, or you will receive it twice and waste context tokens.

## Reporting

Summarize findings for the user: page list, key boards/screens, the discovered
palette and type scale, and the component inventory. Flag anything that looks
off-system (one-off colors, tiny text, inconsistent spacing) so the user can
decide whether to normalize it.

## Notes

- Prefer read-only calls here; this skill should not mutate the file.
- For large files, scope `findShapes` to a specific board rather than
  `penpot.currentPage.root`, and cap `shapeStructure` depth, to keep responses
  small and token-efficient.

---

*Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT) and [penpot/penpot MCP docs](https://github.com/penpot/penpot/blob/main/mcp/README.md) (MPL-2.0). Some portions remain substantially similar to the MIT source; see [NOTICE](../../NOTICE).*
