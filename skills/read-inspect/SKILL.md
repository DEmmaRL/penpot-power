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
| `export_shape` | Export a shape as PNG/SVG for visual inspection (limited in remote mode) |

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

4. **Visual check** — when structure alone is not enough, export the shape and
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
