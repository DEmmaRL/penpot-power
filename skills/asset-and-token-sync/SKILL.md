---
name: asset-and-token-sync
description: >
  Send local repository assets (PNG, JPEG, WebP, SVG icons/illustrations) and
  design tokens into a Penpot file—even when connected through the remote
  (hosted) MCP server where `import_image` is unavailable. Use whenever the
  user wants to import images, logos, icons, screenshots, or design tokens from
  their local workspace or git repository into Penpot.
---

# Send Local Assets & Tokens to Penpot (Remote & Local MCP)

In remote (hosted) MCP mode, the standalone `import_image` MCP tool is not
registered because the cloud MCP server does not have direct access to the
user's local filesystem. Instead, the Penpot Plugin API provides official media
and vector methods inside `execute_code` (`penpot.createShapeFromSvg`,
`penpot.uploadMediaUrl`, `penpot.uploadMediaData`, and the MCP helper
`penpotUtils.importImage`) so the workspace agent can pass assets cleanly.

> **Important API rules:**
> - Never pass `http://localhost` or `http://127.0.0.1` URLs to
>   `penpot.uploadMediaUrl` or `fetch` inside `execute_code` — Penpot's hosted
>   server and browser sandbox only fetch public HTTPS URLs.
> - Avoid encoding multi-megabyte raw images directly into a single tool call,
>   as large base64 strings exceed model output token limits.

Follow the decision tree below to import any asset reliably.

---

## Decision Tree: Which Method to Use

| Asset Type / Source | Best Method in `execute_code` |
| --- | --- |
| **1. Local `.svg` file** (icons, logos, illustrations) | Read the `.svg` file as text in the workspace, then call `penpot.createShapeFromSvg(svgString)` |
| **2. Local raster image inside a GitHub/public repo** (any size, even 5 MB+) | Resolve the public raw URL (`git remote get-url origin` + branch + path) and call `await penpot.uploadMediaUrl(name, rawUrl)` — **0 base64 tokens!** |
| **3. Local raster image (`.png`, `.jpg`, `.webp`) ≤ 15 KB** | Base64-encode via shell (`base64 -i <file> \| tr -d '\n'`) and call `await penpotUtils.importImage(b64, mimeType, name, x, y, width, height)` |
| **4. Large local-only raster image (> 15 KB, untracked/private)** | Downscale/compress to a `/tmp` file first (`sips` / `ffmpeg` / `python3`), then send via `penpotUtils.importImage` (or chunk via `storage.b64 += ...`) |

---

## Method 1: Local `.svg` Files → Editable Penpot Vectors

Read the `.svg` file from the workspace using standard file tools, then pass the
markup string to `penpot.createShapeFromSvg`:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const svgMarkup = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">...</svg>`;
const group = penpot.createShapeFromSvg(svgMarkup);
if (!group) return "Failed to parse SVG.";
group.name = "Icon / Brand Logo";
// Optional: move into a target board
// targetBoard.appendChild(group);
// penpotUtils.setParentXY(group, 24, 24);
return { id: group.id, name: group.name, width: group.width, height: group.height };
```

> If the SVG contains embedded `<image>` tags pointing to external URLs, use
> `await penpot.createShapeFromSvgWithImages(svgMarkup)` instead.

---

## Method 2: Repo Images Already on GitHub / Public HTTPS (`uploadMediaUrl`)

When the image is committed and pushed to a public repository (or hosted on any
public HTTPS URL), Penpot's backend can fetch it directly at full resolution
with **zero base64 overhead**:

1. Check `git remote get-url origin`, current branch/commit, and `git status`
   to confirm the file is pushed cleanly.
2. Construct the raw HTTPS URL (e.g.
   `https://raw.githubusercontent.com/<org>/<repo>/<branch>/<path>`).
3. Run inside `execute_code`:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const imgData = await penpot.uploadMediaUrl(
  "kiro-logo-wordmark.png",
  "https://raw.githubusercontent.com/kirodotdev/Kiro/main/assets/kiro-logo-wordmark.png"
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
> be publicly reachable over HTTPS (never `localhost` or `127.0.0.1`).

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

1. **Check file size first** before encoding:
   ```bash
   ls -lh path/to/image.png
   ```
2. **If the file is > 15 KB**, resize/compress a temporary copy first so the
   base64 string stays small (~5 KB–20 KB) and fast for tool calls:
   ```bash
   # macOS (built-in sips): resize max dimension to 512px
   sips -Z 512 path/to/large-image.png --out /tmp/penpot-upload.png
   ```
   *(If transparency is not needed, converting to JPEG via
   `sips -s format jpeg -s formatOptions 80 -Z 800 input.png --out /tmp/penpot-upload.jpg`
   shrinks a 1.4 MB PNG down to ~10 KB!)*
3. **Read the base64 string** (with no line breaks and **no** `data:...` prefix):
   ```bash
   base64 -i /tmp/penpot-upload.png | tr -d '\n'
   ```
4. **Upload and create the shape** via `execute_code`:
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

### Chunking larger base64 payloads across `execute_code` calls

If you must upload a larger uncompressed local asset (e.g., 30–60 KB) without
truncating a single tool call, accumulate chunks in the persistent `storage`
global:

```javascript
// Call 1:
storage.imgB64 = "iVBORw0KGgoAAAANSUhEUgAA...";
return { length: storage.imgB64.length };

// Call 2:
storage.imgB64 += "moreBase64Characters...";
const shape = await penpotUtils.importImage(storage.imgB64, "image/png", "asset.png", 0, 0);
delete storage.imgB64;
return { id: shape.id, width: shape.width, height: shape.height };
```

---

## Bidirectional Design Token Sync (Repo ↔ Penpot)

### 1. Import Tokens from Repo → Penpot (`penpot.library.local.tokens`)

To import a project's CSS variables or W3C design tokens (`tokens.json`) into
Penpot's native Token Catalog:

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

### 2. Export Tokens from Penpot → Repo (`tokens.json` / CSS `:root`)

To extract all token sets and resolved token values from Penpot so you can write
them to a local `tokens.json`, CSS custom properties (`:root`), or Tailwind
theme configuration in the workspace:

```javascript
if (!penpot.currentPage) return "No Penpot page is focused.";
const catalog = penpot.library.local.tokens;
const exportedSets = catalog.sets.map(set => ({
  name: set.name,
  active: set.active,
  tokens: set.tokens.map(t => ({
    name: t.name,
    type: t.type,
    value: t.value,
    resolvedValue: t.resolvedValue
  }))
}));
const libraryColors = penpot.library.local.colors.map(c => ({
  name: c.name,
  color: c.color,
  opacity: c.opacity
}));
return { sets: exportedSets, libraryColors };
```

---

## Privacy & Safety Guardrails

- **Explicit user intent only:** Only read and upload workspace files (images,
  SVGs, or token files) that the user has explicitly asked to send to Penpot.
  Never read or transmit unrelated files, credentials, or `.env` data.
- **Clean up temporary files:** If you create a resized preview image in `/tmp`
  before calling `penpotUtils.importImage`, delete the temporary file as soon as
  the upload completes.
- **Official API usage:** Uses documented Penpot Plugin API methods
  (`createShapeFromSvg`, `uploadMediaUrl`, `uploadMediaData`, and
  `penpotUtils.importImage`).
