# Changelog

All notable changes to **Penpot Power for Kiro** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-20

### Added
- Agent Plugins v1.0.0 compliant `plugin.json` and `mcp.json` targeting Penpot's
  official remote/hosted MCP server via `mcp-remote@0.15.1`.
- `connection-setup` skill and `references/troubleshooting.md` covering Penpot
  MCP key generation, browser plugin connection, and tab-suspension handling.
- `read-inspect` skill for page hierarchy discovery (`penpotUtils.shapeStructure`),
  component/color/typography inspection, design token discovery
  (`penpotUtils.tokenOverview`), and visual checks via `export_shape` (`"selection"`,
  `"page"`, or shape ID).
- `create-modify` skill and `references/design-defaults.md` with verified Penpot
  Plugin API rules (`board.addFlexLayout` vs `penpotUtils.addFlexLayout`,
  immutable `fills`/`strokes`/`shadows` arrays, `shapesColors` / `replaceColor`,
  and async `growType` / `applyToken` behavior).
- `asset-and-token-sync` skill enabling local-to-remote SVG import
  (`penpot.createShapeFromSvg`), GitHub/HTTPS image import
  (`penpot.uploadMediaUrl`), local raster image upload (`penpotUtils.importImage`
  / `penpot.uploadMediaData`), and bidirectional design token sync
  (`penpot.library.local.tokens`).
- `design-to-code` skill for extracting CSS (`penpot.generateStyle`), webfonts
  (`penpot.generateFontFaces`), and HTML/SVG markup (`penpot.generateMarkup`).
- Third-party license attributions in `NOTICE` (`github/awesome-copilot` MIT and
  `penpot/penpot` MPL-2.0).
