# Changelog

All notable changes to **Penpot Power for Kiro** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Standardized all design tokens on the **W3C Design Tokens Community Group (DTCG)** format
  (`$value`, `$type`), making token exports natively compatible with Amazon Style Dictionary and Tokens Studio.
- `scripts/tokens-to-css.mjs`: standalone deterministic token compiler converting W3C DTCG
  tokens into CSS custom properties (`:root`), Tailwind v4 theme blocks (`@theme`),
  or Tailwind v3 JavaScript configuration modules (`--tailwind`). Includes 12 unit tests.
- `read-inspect`: Headless Token Compliance Audit (design linter) to calculate token coverage
  rate and flag off-system colors and off-scale font sizes before translating designs to code.
- `connection-setup`: operational Diagnostic Healthcheck Probe and structured recovery protocols
  for suspended browser tabs, dropped plugin instances, and invalid keys, plus focused page guardrails.

### Changed
- `mcp.json` connects natively over `streamable-http` instead of the `mcp-remote`
  stdio proxy, so the MCP key is no longer passed as a command-line argument.
  The `mcp-remote` form is documented as a fallback in `README.md`.

### Fixed
- `asset-and-token-sync`: removed base64 chunking dead-end; explicitly documented the two
  real paths for large images (> 15 KB): public HTTPS URL (`uploadMediaUrl`) or local MCP (`import_image`).
- `asset-and-token-sync`: token export uses `resolvedValueString` and groups by
  `tokensByType`, matching the Plugin API (`resolvedValue` and `Token.type` do not exist).
- `asset-and-token-sync`: temporary files go in `$TMPDIR` instead of `/tmp`; the
  placeholder GitHub example no longer points at a third-party repository; the
  size thresholds are consistent; private-repo failures have a fallback.
- `design-to-code`: icons use `generateMarkup` SVG output rather than an export round trip.
- Removed stale references to session selection, which does not exist in remote mode.

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
