// Cross-platform SVG & Raster Asset Bridge for Penpot Remote MCP.
// Replaces platform-specific shell pipelines (macOS sips / BSD base64 -i vs GNU base64 -w 0)
// with a deterministic, zero-dependency Node.js tool.
//
// Usage:
//   node scripts/prepare-asset.mjs <file> [--js | --json] [--name="My Asset"] [--x=100] [--y=100] [--width=64] [--height=64] [--downscale]
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MAX_INLINE_BYTES = 15 * 1024; // 15 KB safe ceiling for remote MCP execute_code

export function parseImageHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 10) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return {
      mimeType: "image/png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20)
    };
  }

  // GIF: "GIF87a" or "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return {
      mimeType: "image/gif",
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8)
    };
  }

  // JPEG: FF D8 ...
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      // SOF markers that contain dimensions
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          mimeType: "image/jpeg",
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7)
        };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
      } else {
        const segLen = buf.readUInt16BE(offset + 2);
        if (segLen < 2) break;
        offset += 2 + segLen;
      }
    }
    return { mimeType: "image/jpeg", width: null, height: null };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { mimeType: "image/webp", width, height };
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      return {
        mimeType: "image/webp",
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff
      };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return {
        mimeType: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1
      };
    }
    return { mimeType: "image/webp", width: null, height: null };
  }

  return null;
}

export function cleanSvgMarkup(svgText) {
  const cleaned = svgText
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  if (!/<svg[\s>]/i.test(cleaned)) {
    throw new Error("Invalid SVG: missing <svg> root element.");
  }

  const svgOpenTag = cleaned.match(/<svg[^>]*>/i)?.[0] || "";
  const widthMatch = svgOpenTag.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i);
  const heightMatch = svgOpenTag.match(/\bheight=["']([0-9.]+)(?:px)?["']/i);
  const viewBoxMatch = svgOpenTag.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);

  const width = widthMatch ? Number(widthMatch[1]) : viewBoxMatch ? Number(viewBoxMatch[1]) : null;
  const height = heightMatch ? Number(heightMatch[1]) : viewBoxMatch ? Number(viewBoxMatch[2]) : null;
  const hasExternalImages = /<image\b[^>]*(?:href|xlink:href)=["']https?:\/\//i.test(cleaned);

  return {
    svg: cleaned,
    width,
    height,
    hasExternalImages
  };
}

export function prepareAsset(filePath, options = {}) {
  const ext = extname(filePath).toLowerCase();
  const assetName = options.name || basename(filePath);
  const x = options.x !== undefined ? Number(options.x) : undefined;
  const y = options.y !== undefined ? Number(options.y) : undefined;
  const targetW = options.width !== undefined ? Number(options.width) : undefined;
  const targetH = options.height !== undefined ? Number(options.height) : undefined;

  if (ext === ".svg") {
    const rawSvg = readFileSync(filePath, "utf8");
    const { svg, width, height, hasExternalImages } = cleanSvgMarkup(rawSvg);
    const createCall = hasExternalImages
      ? `await penpot.createShapeFromSvgWithImages(${JSON.stringify(svg)})`
      : `penpot.createShapeFromSvg(${JSON.stringify(svg)})`;

    const lines = [
      `if (!penpot.currentPage) return { status: "no_page", error: "No Penpot page is focused." };`,
      `const group = ${createCall};`,
      `if (!group) return { status: "error", error: "Failed to parse SVG." };`,
      `group.name = ${JSON.stringify(assetName)};`
    ];
    if (x !== undefined) lines.push(`group.x = ${x};`);
    if (y !== undefined) lines.push(`group.y = ${y};`);
    if (targetW !== undefined || targetH !== undefined) {
      const wExpr = targetW !== undefined ? targetW : `group.width`;
      const hExpr = targetH !== undefined ? targetH : `group.height`;
      lines.push(`group.resize(${wExpr}, ${hExpr});`);
    }
    lines.push(`return { id: group.id, name: group.name, width: group.width, height: group.height };`);

    return {
      kind: "svg",
      name: assetName,
      bytes: Buffer.byteLength(svg, "utf8"),
      width: targetW ?? width,
      height: targetH ?? height,
      hasExternalImages,
      svg,
      code: lines.join("\n")
    };
  }

  let buf = readFileSync(filePath);
  let downscaled = false;

  if (buf.length > MAX_INLINE_BYTES && options.downscale && process.platform === "darwin") {
    const tmpFile = join(tmpdir(), `penpot-asset-${ process.pid }-${ Date.now() }.jpg`);
    try {
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "75", "-Z", "512", filePath, "--out", tmpFile], {
        stdio: "ignore"
      });
      if (existsSync(tmpFile)) {
        buf = readFileSync(tmpFile);
        downscaled = true;
      }
    } finally {
      if (existsSync(tmpFile)) {
        try { unlinkSync(tmpFile); } catch {}
      }
    }
  }

  if (buf.length > MAX_INLINE_BYTES) {
    const kb = (buf.length / 1024).toFixed(1);
    throw new Error(
      `Asset "${assetName}" is ${kb} KB, exceeding the 15 KB remote MCP base64 ceiling. ` +
      `Do NOT chunk base64. Use Path A: penpot.uploadMediaUrl(name, publicHttpsUrl), ` +
      `Path B: Local MCP (@penpot/mcp) import_image, or pass --downscale for a low-res preview.`
    );
  }

  const info = parseImageHeader(buf);
  const mimeByExt = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  const mimeType = info?.mimeType || mimeByExt[ext];
  if (!mimeType) {
    throw new Error(`Unsupported asset extension "${ext}". Supported: .svg, .png, .jpg, .jpeg, .webp, .gif`);
  }

  const base64 = buf.toString("base64");
  const code = [
    `if (!penpot.currentPage) return { status: "no_page", error: "No Penpot page is focused." };`,
    `const shape = await penpotUtils.importImage(`,
    `  ${JSON.stringify(base64)},`,
    `  ${JSON.stringify(mimeType)},`,
    `  ${JSON.stringify(assetName)},`,
    `  ${x !== undefined ? x : "undefined"},`,
    `  ${y !== undefined ? y : "undefined"},`,
    `  ${targetW !== undefined ? targetW : "undefined"},`,
    `  ${targetH !== undefined ? targetH : "undefined"}`,
    `);`,
    `return { id: shape.id, name: shape.name, x: shape.x, y: shape.y, width: shape.width, height: shape.height };`
  ].join("\n");

  return {
    kind: "raster",
    name: assetName,
    mimeType,
    bytes: buf.length,
    width: info?.width ?? null,
    height: info?.height ?? null,
    downscaled,
    base64,
    code
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith("--"));
  const nonFlags = args.filter(a => !a.startsWith("--"));
  const [filePath] = nonFlags;

  if (!filePath) {
    console.error("Usage: node scripts/prepare-asset.mjs <file> [--js | --json] [--name=NAME] [--x=N] [--y=N] [--width=N] [--height=N] [--downscale]");
    process.exit(2);
  }

  const getFlagVal = prefix => {
    const f = flags.find(arg => arg.startsWith(`${prefix}=`));
    return f ? f.slice(prefix.length + 1) : undefined;
  };

  const result = prepareAsset(filePath, {
    name: getFlagVal("--name"),
    x: getFlagVal("--x"),
    y: getFlagVal("--y"),
    width: getFlagVal("--width"),
    height: getFlagVal("--height"),
    downscale: flags.includes("--downscale")
  });

  if (flags.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(result.code + "\n");
  }
}
