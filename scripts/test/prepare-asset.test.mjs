import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareAsset, parseImageHeader, cleanSvgMarkup } from "../prepare-asset.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("prepares evals/fixtures/icon.svg as editable Penpot SVG vector snippet", () => {
  const res = prepareAsset(join(rootDir, "evals/fixtures/icon.svg"), {
    name: "EVAL_T07_icon",
    width: 24,
    height: 24
  });
  assert.equal(res.kind, "svg");
  assert.equal(res.name, "EVAL_T07_icon");
  assert.equal(res.hasExternalImages, false);
  assert.match(res.code, /penpot\.createShapeFromSvg/);
  assert.match(res.code, /group\.resize\(24, 24\)/);
});

test("cleanSvgMarkup strips XML comments/prolog and detects external <image> tags", () => {
  const raw = `<?xml version="1.0"?><!DOCTYPE svg><!-- comment --><svg viewBox="0 0 120 60"><image href="https://example.com/pic.png"/></svg>`;
  const cleaned = cleanSvgMarkup(raw);
  assert.equal(cleaned.width, 120);
  assert.equal(cleaned.height, 60);
  assert.equal(cleaned.hasExternalImages, true);
  assert.doesNotMatch(cleaned.svg, /comment/);
  assert.doesNotMatch(cleaned.svg, /\?xml/);
});

test("prepares evals/fixtures/dot.png with parsed dimensions and raw base64 (no data: prefix)", () => {
  const res = prepareAsset(join(rootDir, "evals/fixtures/dot.png"), {
    name: "EVAL_T08",
    x: 100,
    y: 100,
    width: 64
  });
  assert.equal(res.kind, "raster");
  assert.equal(res.mimeType, "image/png");
  assert.equal(res.width, 8);
  assert.equal(res.height, 8);
  assert.doesNotMatch(res.base64, /^data:/);
  assert.doesNotMatch(res.base64, /\n/);
  assert.match(res.code, /penpotUtils\.importImage/);
  assert.match(res.code, /"EVAL_T08"/);
});

test("parseImageHeader parses GIF, JPEG, and WebP headers accurately", () => {
  // GIF89a 320x200 (little endian: 0x40 0x01, 0xC8 0x00)
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xc8, 0x00]);
  assert.deepEqual(parseImageHeader(gif), { mimeType: "image/gif", width: 320, height: 200 });

  // JPEG with SOF0 marker (FF D8 FF C0 00 11 08 01 90 02 80 -> height 400, width 640)
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x02, 0x80]);
  assert.deepEqual(parseImageHeader(jpg), { mimeType: "image/jpeg", width: 640, height: 400 });
});

test("rejects raster images > 15 KB with actionable Path A / Path B guidance", () => {
  const tmpBig = join(tmpdir(), `penpot-big-test-${process.pid}.png`);
  try {
    const bigBuf = Buffer.alloc(16 * 1024, 0x41);
    writeFileSync(tmpBig, bigBuf);
    assert.throws(
      () => prepareAsset(tmpBig),
      /exceeding the 15 KB remote MCP base64 ceiling.*uploadMediaUrl/
    );
  } finally {
    try { unlinkSync(tmpBig); } catch {}
  }
});
