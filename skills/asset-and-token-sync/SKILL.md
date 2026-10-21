---
name: asset-and-token-sync
description: >
  Send local repository assets (PNG, JPEG, WebP, SVG icons/illustrations) and
  design tokens into a Penpot file—even when connected through the remote
  (hosted) MCP server where `import_image` is unavailable. Use whenever the
  user wants to import images, logos, icons, screenshots, or design tokens from
  their local workspace or git repository into Penpot, or export tokens to code.
---

# Send Local Assets & Tokens to Penpot (Remote & Local MCP)

In remote (hosted) MCP mode, the standalone `import_image` MCP tool is not
registered because the cloud MCP server does not have direct access to the
user's local filesystem. Instead, the Penpot Plugin API provides official media
and vector methods inside `execute_code` (`penpot.createShapeFromSvg`,
`penpot.uploadMediaUrl`, `penpot.uploadMediaData`, and the MCP helper
`penpotUtils.importImage`) so the workspace agent can pass assets cleanly.

> **Important API rules:**
> - Do not rely on `fetch` inside `execute_code` to download assets. The plugin sandbox
>   does not permit arbitrary network fetches.
> - Do not pass `http://localhost` or `http://127.0.0.1` URLs to
>   `penpot.uploadMediaUrl`. `uploadMediaUrl` runs on Penpot's hosted backend, so
>   loopback addresses cannot resolve your local machine.
> - Base64 is strictly for tiny files (≤ 15 KB). Never attempt base64 chunking across
>   tool calls for large images. For files > 15 KB, use a public HTTPS URL via
>   `uploadMediaUrl` or the local MCP's `import_image` tool.

Follow the decision tree below to import any asset reliably.

---

## Decision Tree: Which Method to Use

| Asset Type / Source | Best Method in `execute_code` |
| --- | --- |
| **1. Local `.svg` file** (icons, logos, illustrations) | Run `node scripts/prepare-asset.mjs <file.svg>` (or read text directly) and execute `penpot.createShapeFromSvg(svgString)` |
| **2. Raster image on GitHub / public HTTPS** (any size, even 5 MB+) | Resolve the public raw URL and call `await penpot.uploadMediaUrl(name, rawUrl)` — **0 base64 tokens!** |
| **3. Small local raster image (`.png`, `.jpg`, `.webp`, `.gif`) ≤ 15 KB** | Run `node scripts/prepare-asset.mjs <file.png> --x=100 --y=100 --width=64` and execute the generated `penpotUtils.importImage(...)` snippet |
| **4. Large local raster image (> 15 KB, private)** | **DO NOT CHUNK BASE64.** Use **Path A** (host on public HTTPS + `uploadMediaUrl`) or **Path B** (switch to local MCP with `import_image`). If only a low-res preview is needed on macOS, pass `--downscale` to `scripts/prepare-asset.mjs`. |

---

## Fast Track: Cross-Platform Asset Helper (`scripts/prepare-asset.mjs`)

To avoid platform-specific shell differences (`sips` on macOS vs Linux, or BSD `base64 -i` vs GNU `base64 -w 0`), use the bundled cross-platform script:

```bash
# Prepare an SVG vector (strips XML comments/prolog, checks for external <image> tags, emits execute_code JS)
node scripts/prepare-asset.mjs assets/icon.svg --name="Brand Icon" --width=24 --height=24

# Prepare a small PNG/JPEG/WebP/GIF (validates <= 15 KB, parses binary header dimensions, emits execute_code JS)
node scripts/prepare-asset.mjs assets/dot.png --name="Dot" --x=100 --y=100 --width=64

# Inspect asset metadata as JSON (dimensions, byte size, MIME type, raw base64)
node scripts/prepare-asset.mjs assets/dot.png --json
```

---

## Method 1: Local `.svg` Files → Editable Penpot Vectors

Read the `.svg` file from the workspace (or run `node scripts/prepare-asset.mjs <file.svg>`), then pass the markup string to `penpot.createShapeFromSvg`:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const svgMarkup = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">...</svg>`;
const group = penpot.createShapeFromSvg(svgMarkup);
if (!group) return "Failed to parse SVG.";
group.name = "Icon / Brand Logo";
// Optional: resize or move into a target board
// group.resize(24, 24);
// targetBoard.appendChild(group);
// penpotUtils.setParentXY(group, 24, 24);
return { id: group.id, name: group.name, width: group.width, height: group.height };
```

> `createShapeFromSvg` is synchronous. If the SVG contains embedded `<image>` tags
> pointing to external URLs, use `await penpot.createShapeFromSvgWithImages(svgMarkup)`
> instead, because that variant returns a Promise.

---

## Method 2: Repo Images Already on GitHub / Public HTTPS (`uploadMediaUrl`)

When the image is committed and pushed to a public repository (or hosted on any
public HTTPS URL), `uploadMediaUrl` lets Penpot's backend fetch it at full resolution
with **zero base64 overhead**:

1. Check `git remote get-url origin`, current branch/commit, and `git status`
   to confirm the file is pushed cleanly.
2. Construct the raw HTTPS URL (e.g.
   `https://raw.githubusercontent.com/<org>/<repo>/<branch>/<path>`).
3. Run inside `execute_code`:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const imgData = await penpot.uploadMediaUrl(
  "logo.png",
  "https://raw.githubusercontent.com/<org>/<repo>/<branch>/assets/logo.png"
);
const rect = penpot.createRectangle();
rect.name = imgData.name;
rect.resize(imgData.width, imgData.height);
rect.x = 0;
rect.y = 0;
rect.fills = [{ fillOpacity: 1, fillImage: imgData }];
return { id: rect.id, width: rect.width, height: rect.height, imageId: imgData.id };
```

> **Note:** `penpot.uploadMediaUrl` runs on the Penpot server, so the URL must
> be publicly reachable over HTTPS. Loopback addresses (`localhost`, `127.0.0.1`)
> cannot resolve your machine. Files in a private repository return an error; if
> the call fails, fall back to Method 3.

---

## Method 3: Local Raster Images via `penpotUtils.importImage` (Base64 Bridge)

Even though the remote MCP server doesn't expose an `import_image` MCP tool,
`penpotUtils.importImage` is built right into the `execute_code` runtime! Its
exact signature is:

```ts
penpotUtils.importImage(
  base64: string,       // raw base64 string WITHOUT the "data:image/...;base64," prefix!
  mimeType: string,     // "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  name: string,         // shape and media name
  x?: number,           // optional canvas X
  y?: number,           // optional canvas Y
  width?: number,       // optional width (auto-scales height if height is omitted)
  height?: number       // optional height (auto-scales width if width is omitted)
): Promise<Rectangle>
```

### Step-by-step workflow for local files:

1. **Preferred (Cross-Platform):** Run `node scripts/prepare-asset.mjs path/to/image.png --name="hero.png" --x=100 --y=100 --width=400` and pass the generated snippet to `execute_code`.
2. **Manual Shell Alternative:**
   - Check file size (`ls -lh path/to/image.png`). Must be ≤ 15 KB.
   - Read single-line base64 with **no** `data:...` prefix:
     ```bash
     # Cross-platform Node one-liner (works on macOS, Linux, Windows):
     node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1]).toString("base64"))' path/to/image.png
     ```
   - Upload and create the shape via `execute_code`:
     ```javascript
     if (!penpot.currentPage) return "No Penpot page is focused.";
     const b64 = "iVBORw0KGgoAAAANSUhEUgAA..."; // raw base64, no data: prefix
     const shape = await penpotUtils.importImage(
       b64,
       "image/png",
       "hero-preview.png",
       100,       // x
       100,       // y
       400,       // width (height auto-calculated to preserve aspect ratio!)
       undefined  // height
     );
     return { id: shape.id, name: shape.name, width: shape.width, height: shape.height };
     ```

### Large Images (> 15 KB): Why Base64 Chunking Fails & The Two Real Paths

Do **NOT** attempt to chunk large base64 strings across multiple `execute_code` calls using `storage`. In live sessions, passing hundreds of thousands of base64 characters degrades the WebSocket transport, exhausts LLM context windows, and frequently causes connection drops.

For any raster asset exceeding 15 KB, use one of the two real paths:

1. **Path A — Public HTTPS URL (Recommended for Remote MCP):**
   Host or push the image to an HTTPS location you control (e.g. GitHub raw URL, S3 bucket, CDN), then call `await penpot.uploadMediaUrl(name, url)`.
2. **Path B — Local MCP Server (`@penpot/mcp`):**
   If the image is private/untracked and cannot be hosted on a public URL, switch to the official local MCP server (`npx -y @penpot/mcp@latest`), which registers the native `import_image` filesystem tool.
3. **Fallback — Local Canvas Preview (Downscaling):**
   If only an approximate visual preview on the canvas is needed on macOS, run `node scripts/prepare-asset.mjs path/to/large.png --downscale` (which compresses a temporary preview in `$TMPDIR` below 15 KB and cleans up the temp file automatically).

---

## Bidirectional Design Token Sync (Repo ↔ Penpot)

### 1. Import Tokens from Repo → Penpot (`scripts/css-to-tokens.mjs`)

To import a project's CSS custom properties (`tokens.css` with `:root` or `@theme`) or W3C DTCG JSON (`tokens.json`) into Penpot's native Token Catalog deterministically:

```bash
# Generate the ready-to-run execute_code JS snippet from CSS or JSON:
node scripts/css-to-tokens.mjs tokens.css --penpot-js --set-name="Project Tokens"

# Or convert a CSS file into standard W3C DTCG JSON first:
node scripts/css-to-tokens.mjs tokens.css tokens.json --dtcg
```

You can also create/update tokens directly inside `execute_code`:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const catalog = penpot.library.local.tokens;
let set = catalog.sets.find(s => s.name === "Project Tokens");
if (!set) set = catalog.addSet({ name: "Project Tokens" });
if (!set.active) set.toggleActive();

// Add tokens (types: "color", "spacing", "borderRadius", "fontSizes", "dimension", etc.)
const primary = set.addToken({ type: "color", name: "color.brand.primary", value: "#0066FF" });
const radiusMd = set.addToken({ type: "borderRadius", name: "radius.md", value: "8" });

return penpotUtils.tokenOverview();
```

### 2. Export Tokens from Penpot → Repo (`tokens.json` / CSS `:root` / Tailwind)

#### Option A: Standard W3C DTCG Format (`$value`, `$type`, `$extensions`)
Extracts active token sets into the official **W3C Design Tokens Community Group (DTCG)** format, preserving Penpot subtype metadata (`$extensions["app.penpot"].type`) so `borderRadius`, `fontSizes`, and `spacing` map cleanly to CSS and Tailwind:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
if (storage.helpers?.exportTokensDtcg) return storage.helpers.exportTokensDtcg();

const catalog = penpot.library.local.tokens;
const dtcg = {};

const typeMap = {
  fontSizes: "dimension",
  spacing: "dimension",
  sizing: "dimension",
  borderRadius: "dimension",
  borderWidth: "dimension",
  fontFamilies: "fontFamily",
  fontWeights: "fontWeight",
  opacity: "number"
};

for (const set of catalog.sets || []) {
  if (!set.active) continue;
  for (const [type, tokens] of set.tokensByType || []) {
    const dtcgType = typeMap[type] || type;
    for (const t of tokens || []) {
      const parts = t.name.split(".");
      let curr = dtcg;
      for (let i = 0; i < parts.length - 1; i++) {
        curr[parts[i]] = curr[parts[i]] || {};
        curr = curr[parts[i]];
      }
      const leaf = parts[parts.length - 1];
      const entry = {
        $value: t.value ?? t.resolvedValueString,
        $type: dtcgType
      };
      if (type !== dtcgType) {
        entry.$extensions = { "app.penpot": { type } };
      }
      curr[leaf] = entry;
    }
  }
}
return dtcg;
```

#### Option B: Multi-Set Catalog Export (`{ "sets": [...] }`)
When the user asks to export all token sets (both active and inactive) with a top-level `"sets"` array grouped by type:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
if (storage.helpers?.exportTokensRawSets) return storage.helpers.exportTokensRawSets();

const catalog = penpot.library.local.tokens;
const sets = [];
for (const set of catalog.sets || []) {
  const tokensByType = [];
  for (const [type, tokens] of set.tokensByType || []) {
    tokensByType.push({
      type,
      tokens: (tokens || []).map(t => ({
        name: t.name,
        value: t.value ?? t.resolvedValueString,
        resolvedValue: t.resolvedValueString ?? t.value
      }))
    });
  }
  sets.push({ name: set.name, active: Boolean(set.active), tokensByType });
}
return { sets };
```

#### Compile Exported `tokens.json` (Both Option A and Option B are supported!)
Once saved to `tokens.json` in the workspace, compile them deterministically with `scripts/tokens-to-css.mjs`:
```bash
# Compile to standard CSS custom properties (:root)
node scripts/tokens-to-css.mjs tokens.json tokens.css

# Or compile to Tailwind v4 theme block (@theme with --color-*, --text-*, --font-*, --radius-*, --spacing-*)
node scripts/tokens-to-css.mjs tokens.json theme.css --theme

# Or compile to Tailwind v3 JavaScript config
node scripts/tokens-to-css.mjs tokens.json tailwind.tokens.js --tailwind
```

---

## Privacy & Safety Guardrails

- **Explicit user intent only:** Only read and upload workspace files (images,
  SVGs, or token files) that the user has explicitly asked to send to Penpot.
  Never read or transmit unrelated files, credentials, or `.env` data.
- **Clean up temporary files:** If you create a resized preview image in `$TMPDIR`
  before calling `penpotUtils.importImage`, delete the temporary file as soon as
  the upload completes (`scripts/prepare-asset.mjs --downscale` handles this automatically).
- **Official API usage:** Uses documented Penpot Plugin API methods
  (`createShapeFromSvg`, `uploadMediaUrl`, `uploadMediaData`, and
  `penpotUtils.importImage`).
