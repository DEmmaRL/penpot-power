# Penpot Power for Kiro

A [Kiro power](https://kiro.dev/docs/powers/) that gives your agent on-demand
expertise and deterministic CLI tools for working with [Penpot](https://penpot.app/),
the open-source design and prototyping platform.

It wraps the **official hosted Penpot MCP server** and bundles specialized skills
and zero-dependency Node.js utilities for connecting to live design files,
inspecting hierarchy, auditing token & WCAG accessibility compliance, creating
responsive Flex/Grid boards and components, syncing local workspace assets
(SVGs, PNGs, bidirectional design tokens), and generating production-ready code.

Built on the [Agent Plugins v1.0.0](https://agent-plugins.org/) specification.

---

## Features & Bundled Skills

Mention Penpot in your prompt (for example, *"inspect my Penpot file"*,
*"create a login screen in Penpot"*, *"upload `assets/logo.svg` to Penpot"*, or
*"turn this Penpot board into a React component"*) and Kiro activates the power,
loading only the relevant skill and tools:

| Skill | Purpose |
| --- | --- |
| `connection-setup` | Live canvas healthcheck probe, diagnostic decision tree, and step-by-step recovery protocols for suspended browser tabs and disconnected plugins. |
| `read-inspect` | Explores pages, audits token & accessibility compliance (Headless Design Linter with bound token tracking, 4px/8px grid checks, WCAG AA contrast, and 24×24 touch targets), walks the shape tree, and exports previews (`export_shape`). |
| `create-modify` | Builds and updates boards, typography, library components (`createComponent` / `instance()`), interactive prototyping flows (`addInteraction`), and responsive Flex/Grid layouts (`addFlexLayout`, `addGridLayout`), plus bulk color replacement (`penpot.replaceColor`). |
| `asset-and-token-sync` | Sends local repository assets (`.svg` vectors, raster images) into Penpot via `scripts/prepare-asset.mjs`, and syncs design tokens bidirectionally in standard W3C DTCG format (`$value`, `$type`, `$extensions`) or raw sets (`{ sets: [...] }`). |
| `design-to-code` | Extracts CSS, `@font-face` rules, and HTML/SVG markup, coupled with deterministic W3C DTCG token compilers (`scripts/tokens-to-css.mjs` and `scripts/css-to-tokens.mjs`). |

---

## Deterministic CLI Scripts (`scripts/`)

All scripts run on Node.js ≥ 18 with **zero external npm dependencies** and are covered by 32 automated unit tests (`npm test`):

| Script | Purpose |
| --- | --- |
| `scripts/tokens-to-css.mjs` | Forward compiler: converts W3C DTCG (`$value`, `$type`) or Penpot `sets` exports into `:root` CSS custom properties, Tailwind v4 `@theme` blocks (`--color-*`, `--text-*`, `--font-*`, `--radius-*`, `--spacing-*`), or Tailwind v3 JS configs (`--tailwind`). |
| `scripts/css-to-tokens.mjs` | Reverse compiler: parses existing CSS (`:root` / `@theme`) or DTCG JSON into W3C DTCG JSON (`--dtcg`) or a ready-to-run `execute_code` JS script (`--penpot-js`) that populates `penpot.library.local.tokens`. |
| `scripts/prepare-asset.mjs` | Cross-platform asset bridge: cleans `.svg` files, parses `.png`/`.jpg`/`.webp`/`.gif` binary header dimensions without native dependencies, enforces the 15 KB remote MCP ceiling, and outputs ready-to-run `execute_code` snippets. |
| `scripts/runtime-helpers.mjs` | Generates a compact helper suite for `storage.helpers` inside `execute_code` (`healthcheck`, `nextBoardPosition`, `contrastRatio`, `auditPage`, `exportTokensDtcg`, `exportTokensRawSets`). |
| `scripts/eval-harness.mjs` | Evaluation CLI: generates 1-click Penpot fixture resets (`setup`), runs task verifiers (`verify T01..T13`), and computes Wilson 95% confidence intervals from evaluation CSV logs (`stats`). |

---

## What this Power Adds over Raw MCP

A common question is: *"Why use this power if Penpot already provides an MCP server?"*

1. **Bidirectional W3C DTCG Token Compilers (`tokens-to-css.mjs` & `css-to-tokens.mjs`):**
   Standardized on the official W3C Design Tokens Community Group format (`$value`, `$type`, `$extensions`). Converts token exports into CSS variables (`:root`), Tailwind v4 `@theme` blocks, or Tailwind v3 configuration modules deterministically—and reverse-compiles project CSS back into Penpot's token catalog without LLM transcription errors.
2. **Headless Token, Grid & Accessibility Audit (Design Linter):**
   Scans boards for bound vs. unbound tokens (`shape.tokens`), off-system fill/stroke colors, off-scale font sizes, off-grid flex spacing, WCAG AA text contrast ratios, and undersized touch targets (< 24×24 px) before generating code.
3. **Cross-Platform Asset Bridge (`prepare-asset.mjs`):**
   Eliminates macOS-only shell assumptions by parsing PNG/JPEG/WebP/GIF headers and cleaning SVGs in pure Node.js while strictly guarding the 15 KB inline payload boundary.
4. **Actionable Connection & Tab Suspension Recovery:**
   Hosted Penpot MCP sessions frequently drop when the browser suspends the background tab. Instead of leaving the agent stuck with opaque socket errors, `connection-setup` executes a diagnostic probe and provides step-by-step recovery instructions to wake and pin the tab.
5. **Hardened API Guardrails:**
   Enforces non-obvious Penpot Plugin API rules (e.g. read-only `width`/`height`, immutable `fills` arrays, `growType` settling delays, preserved child ordering in flex layouts, and CSS Grid cell placement) that are not documented in the MCP tool descriptions.

## Requirements

- **Kiro IDE** with Powers and MCP support.
- **A Penpot account** (`design.penpot.app` or a self-hosted Penpot instance)
  with **MCP Server** enabled under **Your account → Integrations → MCP Server**
  and a generated **MCP key** (`userToken`).
- **Node.js ≥ 18** in your `PATH` (for running the deterministic `scripts/*.mjs` utilities, or `npx` if you use the `mcp-remote` fallback). The default MCP configuration connects natively over Streamable HTTP.
- A vision-capable model is recommended so the agent can visually inspect
  `export_shape` previews.

---

## Installation

### From GitHub

1. In Kiro IDE, open the **Powers** panel → **Add Custom Power** → **Import
   power from GitHub**.
2. Paste the repository URL:
   ```text
   https://github.com/DEmmaRL/penpot-power
   ```

### From a local folder

1. Clone this repository:
   ```bash
   git clone https://github.com/DEmmaRL/penpot-power.git
   ```
2. In Kiro IDE, open **Powers → Add Custom Power → Import power from a folder**
   and select the cloned directory.

---

## Configuration & Connecting to a Penpot File

### 1. Enable MCP in Penpot
1. In Penpot, go to **Your account → Integrations → MCP Server** and toggle it **on**.
2. Generate an **MCP key** (`userToken`). Save it securely (it is displayed only once).

### 2. Configure Credentials in Kiro
`mcp.json` uses environment placeholders rather than hardcoded credentials:
- `PENPOT_DOMAIN` — `design.penpot.app` (for Penpot Cloud) or your self-hosted domain.
- `PENPOT_MCP_KEY` — your personal `userToken` from **Integrations → MCP Server**.

> **Alternative (User-Scope MCP Config):** If your client environment does not
> expand placeholders inside `mcp.json`, add the server directly to your
> user-scope Kiro MCP configuration (`.kiro/settings/mcp.json`) using the full
> URL generated by Penpot:
> ```json
> {
>   "mcpServers": {
>     "penpot": {
>       "type": "streamable-http",
>       "url": "https://design.penpot.app/mcp/stream?userToken=YOUR_MCP_KEY"
>     }
>   }
> }
> ```
>
> **Fallback (stdio proxy):** If your client does not support native Streamable
> HTTP, replace the server entry with the `mcp-remote` proxy. Note that this passes
> the URL, including the key, as a command-line argument:
> ```json
> {
>   "type": "stdio",
>   "command": "npx",
>   "args": ["-y", "mcp-remote@0.15.1", "https://${PENPOT_DOMAIN}/mcp/stream?userToken=${PENPOT_MCP_KEY}"]
> }
> ```

### 3. Connect the In-File Plugin
1. Open your target design file in Penpot.
2. In the top menu, select **File → MCP Server → Connect**.
3. Keep that browser tab active while working with the agent (MCP always targets
   the **currently focused page** in the **active connected tab**).

---

## Example Prompts

- **Inspect & Audit:** *"Give me a high-level overview of the current Penpot page and run a full token compliance and WCAG contrast audit."*
- **Create UI:** *"Create a mobile login board (375×812) next to the existing boards using our file's primary brand color and an 8px spacing grid."*
- **Send Local Assets to Penpot:** *"Import `assets/logo.svg` as a vector group and place it in the header of the main board."*
- **Sync Design Tokens (Bidirectional):** *"Export all active token sets from this Penpot file into `tokens.css` (`:root`) and `theme.css` (`@theme`), or import our repo's `tokens.css` into Penpot."*
- **Design to Code:** *"Extract the CSS, font faces, and HTML structure for `DashboardCard` and build a matching React + Tailwind component."*

---

## Remote vs. Local MCP Server

This power connects to Penpot's **remote (hosted) MCP server**, which requires
zero local daemon setup.

While the remote MCP server itself does not have direct access to your local
filesystem (meaning the standalone `import_image` MCP tool is only registered on
local MCP servers), this power's **`asset-and-token-sync`** skill and `scripts/prepare-asset.mjs` bridge that
gap using Penpot's official Plugin API inside `execute_code`:
- **SVGs:** Cleaned and created via `penpot.createShapeFromSvg(svgString)`.
- **GitHub / HTTPS images (any size):** Imported at full resolution via `await penpot.uploadMediaUrl(name, url)`.
- **Small local PNG / JPEG / WebP / GIF previews (≤ 15 KB):** Validated, header-parsed, and uploaded via `await penpotUtils.importImage(base64, mimeType, name, x, y, width, height)`. For larger images, host them on public HTTPS or use the local MCP server with `import_image`.

If you prefer running the local Penpot MCP daemon (`npx -y @penpot/mcp@latest`),
see the [Penpot MCP Help Center](https://help.penpot.app/mcp/) and
[penpot/penpot MCP README](https://github.com/penpot/penpot/blob/main/mcp/README.md).
For a multi-client skill collection maintained by the Penpot team, see also
[penpot/penpot-ai-kit](https://github.com/penpot/penpot-ai-kit).

---

## Repository Structure

```text
penpot-power/
├── plugin.json                 # Agent Plugins v1.0.0 manifest
├── mcp.json                    # Penpot remote MCP server configuration
├── package.json                # Zero-dependency Node.js scripts & test runner
├── README.md                   # Documentation
├── CHANGELOG.md                # Release history
├── LICENSE                     # MIT License
├── NOTICE                      # Third-party attributions (MIT, MPL-2.0)
├── scripts/
│   ├── tokens-to-css.mjs       # Forward compiler (DTCG / sets -> :root, @theme, Tailwind v3)
│   ├── css-to-tokens.mjs       # Reverse compiler (CSS / DTCG -> DTCG JSON or Penpot JS)
│   ├── prepare-asset.mjs       # Cross-platform SVG & raster image header/base64 bridge
│   ├── runtime-helpers.mjs     # Persistent storage.helpers suite for execute_code
│   ├── eval-harness.mjs        # Automated eval fixture resetter, verifier & Wilson CI stats
│   └── test/
│       ├── tokens-export.sample.json
│       ├── tokens-to-css.test.mjs
│       ├── css-to-tokens.test.mjs
│       ├── prepare-asset.test.mjs
│       ├── runtime-helpers.test.mjs
│       └── eval-harness.test.mjs
├── evals/                      # Power vs. Direct MCP evaluation suite
│   ├── tasks.json              # 13 verified tasks + controls
│   ├── schedule.mjs            # Seeded, reproducible run order
│   └── README.md               # Evaluation protocol and metrics
└── skills/
    ├── connection-setup/
    │   ├── SKILL.md
    │   └── references/troubleshooting.md
    ├── read-inspect/
    │   └── SKILL.md
    ├── create-modify/
    │   ├── SKILL.md
    │   └── references/design-defaults.md
    ├── asset-and-token-sync/
    │   └── SKILL.md
    └── design-to-code/
        └── SKILL.md
```

---

## Future Roadmap & Ecosystem Integrations (Nice-to-Have)

The following five ecosystem integrations are documented as future enhancements to extend `penpot-power` across multi-platform design-system pipelines:

1. **Amazon Style Dictionary v4 Multi-Platform Preset (`style-dictionary.config.mjs`):**
   - Since `penpot-power` exports native W3C DTCG JSON (`$value`, `$type`, `$extensions`), adding an optional Style Dictionary v4 configuration preset would allow teams to compile Penpot tokens directly into **iOS (Swift / UIKit / SwiftUI)**, **Android (Jetpack Compose / XML)**, **SCSS maps**, and **CSS custom properties** in a single command.
2. **Tokens Studio for Git Bidirectional Sync Bridge:**
   - Support reading and writing Tokens Studio's multi-file `$themes.json` and `$metadata.json` repository structure so teams migrating between Figma (Tokens Studio) and Penpot can share the exact same Git-backed token repository without manual conversion.
3. **Storybook & Codebase Component Manifest Mapper:**
   - A scanner script that indexes existing UI components in the local codebase (e.g. `src/components/**/*.tsx` or `.storybook/` stories) and maps them against `penpot.library.local.components`. When running `design-to-code`, the agent can automatically import `<Button variant="primary" />` from the repo instead of emitting raw HTML elements.
4. **Automated Visual Regression Diffing (`export_shape` vs. Playwright/Chromium):**
   - Pair `export_shape` PNG renders of a Penpot board with a headless browser screenshot of the generated component and compute a pixel/structural diff score during `design-to-code` verification.
5. **GitHub Actions CI & Schema Validation Pipeline (`.github/workflows/ci.yml`):**
   - Automated workflow running `npm test`, validating `plugin.json` and `mcp.json` against the Agent Plugins v1.0.0 JSON schemas, and checking documentation links on every pull request.

---

## Privacy & Security

- **No telemetry:** This power collects no analytics or user data.
- **Credential safety:** Never commit your `PENPOT_MCP_KEY` (`userToken`) to
  version control or paste it into shared chats. If a key is ever exposed,
  regenerate it immediately under **Your account → Integrations → MCP Server**
  in Penpot (which revokes the previous key).
- **Process visibility note:** The default configuration uses native
  `streamable-http`, so the key is not passed as a command-line argument. The
  `mcp-remote` fallback passes the URL, including the key, as an argument, which
  may be visible in the local OS process table on multi-user machines.
- **Live file edits:** Connected MCP sessions can modify the focused Penpot
  page. Keep Kiro's tool approval prompts enabled for `execute_code`.
- See Penpot's [Privacy Policy](https://penpot.app/privacy-policy) for details
  on how Penpot's hosted service processes data.

---

## Support

- **Issues & Questions:** Open an issue at
  [github.com/DEmmaRL/penpot-power/issues](https://github.com/DEmmaRL/penpot-power/issues).
- **Penpot MCP Documentation:** [help.penpot.app/mcp](https://help.penpot.app/mcp/)
  and the [Penpot Community](https://community.penpot.app/).

---

## Credits & License

Licensed under the [MIT License](LICENSE).

This power builds upon and adapts material from:
- **[github/awesome-copilot](https://github.com/github/awesome-copilot)** (`penpot-uiux-design` skill, MIT License) — design-system discovery patterns, default tokens, and review checklists.
- **[penpot/penpot](https://github.com/penpot/penpot)** (MPL-2.0) — official Penpot MCP server and Plugin API documentation.

Full third-party notices and license texts are included in [NOTICE](NOTICE).
"Penpot" is a trademark of Kaleidos Open Source S.L. "Kiro" is a trademark of
Amazon. This project is an independent community power and is not affiliated
with or endorsed by Kaleidos or Amazon.
