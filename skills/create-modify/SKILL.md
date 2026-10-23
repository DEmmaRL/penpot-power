---
name: create-modify
description: >
  Create and modify Penpot design elements: boards/screens, rectangles, text,
  components, responsive flex/grid layouts, and interactive flows. Use when the
  user wants to build or edit a UI (dashboards, forms, navigation, landing
  pages) or establish a design system. Honors an existing design system when
  present and applies sensible defaults when not.
---

# Create & Modify Penpot Designs

Build professional, consistent UI in Penpot via `execute_code`. Always inspect
the file first (see the `read-inspect` skill) so new work matches the existing
system.

## Prerequisite

Tools must be reachable (run `connection-setup`), and the intended page must be
the focused one. Tool names are namespaced by server profile (`penpot-local:execute_code`
vs `penpot-remote:execute_code`); call the profile matching your target environment.

## Design-system-first rule

Before creating anything, determine whether the user has a design system:

1. Ask: "Do you have design tokens or brand guidelines to follow?"
2. If not stated, discover from the file (see `read-inspect`).
3. **If a system exists**, use its colors, spacing, typography, naming, and
   component patterns. **If none exists**, use the defaults in
   [references/design-defaults.md](references/design-defaults.md) and offer to
   formalize them.

## Positioning: never overlap existing boards

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const boards = penpotUtils.findShapes(s => s.type === 'board', penpot.currentPage.root);
let nextX = 0;
const gap = 100;
boards.forEach(b => { nextX = Math.max(nextX, b.x + b.width + gap); });
const board = penpot.createBoard();
board.x = nextX; board.y = 0;
board.resize(375, 812); // mobile default
return { createdAt: nextX };
```

*(If `storage.helpers` is installed via `node scripts/runtime-helpers.mjs`, you can also call `const { x, y } = storage.helpers.nextBoardPosition(100);`)*

Spacing: ~100px between screens in the same flow, 200px+ between different
flows, align `y` for rows.

## Building blocks

- `penpot.createBoard()` — a screen/frame
- `penpot.createRectangle()` / `penpot.createEllipse()` — surfaces, cards, dividers, badges
- `penpot.createText("label")` — text; **requires a non-empty string argument**
- `board.addFlexLayout()` — add flex layout to a **new/empty** board (instance method on `Board`, accessible afterward via `board.flex`)
- `penpotUtils.addFlexLayout(container, dir)` — add flex layout to a container that **already has children** (preserves existing visual order)
- `board.addGridLayout()` — add CSS Grid layout to a board (accessible afterward via `board.grid`)
- `penpot.library.local.components` & `penpot.library.local.createComponent([shape])` — reuse or create reusable components (`component.instance()`)
- `penpot.library.local.tokens` — apply design tokens (`shape.applyToken(token, properties)`)
- `penpot.shapesColors(shapes)` & `penpot.replaceColor(shapes, oldColor, newColor)` — inspect and bulk-replace a color across an entire board or page in one call (ideal for re-theming without manual shape loops)
- `penpot.createPage()` & `await penpot.openPage(page)` — create or switch pages when organizing multi-page flows

## Advanced Patterns: CSS Grid, Components & Prototyping

### 1. CSS Grid Layout (`board.addGridLayout()`)
Use Grid Layout for multi-column dashboards, bento grids, and structured page shells:

```javascript
const grid = board.addGridLayout();
grid.rowGap = 16;
grid.columnGap = 16;
grid.verticalPadding = 24;
grid.horizontalPadding = 24;

// Track types: "flex" (fr), "fixed" (px), "auto", "percent"
grid.addColumn("fixed", 240); // sidebar
grid.addColumn("flex", 1);    // main content area
grid.addRow("fixed", 64);     // top header
grid.addRow("flex", 1);       // body

// Place a child in a 1-based (row, column) cell:
grid.appendChild(sidebarBoard, 1, 1);
sidebarBoard.layoutCell.rowSpan = 2; // span header + body rows
grid.appendChild(headerBoard, 1, 2);
grid.appendChild(mainBoard, 2, 2);
```

### 2. Creating & Instantiating Local Components
When an element (e.g. Button, Card, NavItem) repeats 2+ times, create a library component and instantiate it:

```javascript
// Create a master component from a board or group
const comp = penpot.library.local.createComponent([buttonBoard]);
comp.name = "UI / Button / Primary";

// Instantiate the component anywhere on the page
const instance = comp.instance();
parentBoard.appendChild(instance);
```

### 3. Prototyping Interactions (Screen-to-Screen Flows)
Wire interactive elements (like a "Sign In" button) to navigate to a destination board:

```javascript
ctaButton.addInteraction("click", {
  type: "navigate-to",
  destination: dashboardBoard,
  animation: {
    type: "push",
    direction: "left",
    duration: 300,
    easing: "ease-in-out"
  }
});
```

## Penpot API gotchas (read before writing code)

These cause the most failures — honor them:

- `width` / `height` are **read-only** → use `shape.resize(w, h)`.
- `parentX` / `parentY` (and `boardX` / `boardY`) are **read-only** → use `penpotUtils.setParentXY(shape, x, y)`.
- `fills`, `strokes`, and `shadows` arrays are **read-only in place** → you cannot mutate an element inside `shape.fills[0]`; always assign a whole new array (e.g. `shape.fills = [{ fillColor: '#FF5533', fillOpacity: 1 }]`, uppercase hex).
- `createText()` with no argument fails → always pass a non-empty string.
- **Flex layout & child ordering:**
  - On an empty board, call `const flex = board.addFlexLayout()`. On a container that **already has children**, call `penpotUtils.addFlexLayout(container, dir)` so existing children are not arbitrarily reordered.
  - Append children in visual order (background first, foreground later; or start-to-end in flex layouts) using `board.appendChild(shape)`, or `board.insertChild(index, shape)` for a 0-based index.
  - Layout `verticalSizing` and `horizontalSizing` default to `"fix"`. Set them to `"auto"` when the container should grow/shrink to fit content, or `"fill"` on `child.layoutChild` to stretch children.
- **Text auto-sizing & async token updates:** `text.resize()` resets `growType` to `"fixed"`. Always set `text.growType = "auto-width"` or `"auto-height"` afterward if you want auto-sizing, and note that both `growType` bounds updates and `shape.applyToken(...)` take ~100ms to settle.
- **`execute_code` discipline:** Store reusable references (such as `penpot.selection` or `storage.helpers`) in the persistent `storage` global across calls, and **never `console.log` data that you also `return`** (it duplicates output in the tool response).

## Workflow

1. Confirm or discover the design system.
2. Compute a non-overlapping position for new boards.
3. Create the board, then its children (layout → surfaces → text → components).
4. Apply a flex or grid layout for responsive spacing.
5. **Validate visually**: `export_shape` the result and inspect it. Check the
   review checklist in [references/design-defaults.md](references/design-defaults.md).
6. Report what you created and ask for feedback before large follow-on changes.

## Guardrails

- Make changes incrementally and show exports so the user can approve.
- Do not restructure or rename existing shapes unless asked — modifying a shared
  component can ripple across the file.

---

*Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT). Some portions remain substantially similar to the source; see [NOTICE](../../NOTICE).*
