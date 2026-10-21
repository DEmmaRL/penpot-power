// Penpot Runtime Helper Suite for `storage.helpers` inside `execute_code`.
//
// Installing these helpers once per MCP session avoids regenerating 60+ lines of
// AST traversal, token linting, WCAG contrast math, and DTCG export code on every turn.
//
// Usage (CLI):
//   node scripts/runtime-helpers.mjs               # prints the bootstrap JS for execute_code
//   node scripts/runtime-helpers.mjs --call=audit  # prints bootstrap + immediate auditPage() call
import { pathToFileURL } from "node:url";

export function installRuntimeHelpers(penpot, penpotUtils, storage) {
  function parseHex(hex) {
    if (typeof hex !== "string") return null;
    const clean = hex.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(clean)) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16)
      ];
    }
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16)
      ];
    }
    return null;
  }

  function luminance(rgb) {
    const [r, g, b] = rgb.map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(hex1, hex2) {
    const rgb1 = parseHex(hex1);
    const rgb2 = parseHex(hex2);
    if (!rgb1 || !rgb2) return null;
    const l1 = luminance(rgb1);
    const l2 = luminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  }

  function healthcheck(expectedPageName) {
    if (!penpot.currentPage) {
      return { status: "no_page", error: "No Penpot page is focused or plugin is not connected." };
    }
    const page = penpot.currentPage;
    if (expectedPageName && page.name !== expectedPageName) {
      return {
        status: "wrong_page",
        page: page.name,
        pageId: page.id,
        expected: expectedPageName,
        error: `Focused page is "${page.name}", expected "${expectedPageName}".`
      };
    }
    const boards = penpotUtils.findShapes(s => s.type === "board", page.root);
    return {
      status: "connected",
      page: page.name,
      pageId: page.id,
      totalBoards: boards.length
    };
  }

  function nextBoardPosition(gap = 100, y = 0) {
    if (!penpot.currentPage) return { x: 0, y };
    const boards = (penpot.currentPage.root.children || []).filter(s => s.type === "board");
    let nextX = 0;
    for (const b of boards) {
      nextX = Math.max(nextX, (b.x || 0) + (b.width || 0) + gap);
    }
    return { x: nextX, y };
  }

  function iterTokensByType(set) {
    const raw = set.tokensByType || [];
    if (Array.isArray(raw)) {
      return raw.map(entry =>
        Array.isArray(entry) ? [entry[0], entry[1] || []] : [entry.type, entry.tokens || []]
      );
    }
    if (typeof raw === "object") {
      return Object.entries(raw);
    }
    return [];
  }

  function auditPage(targetRoot, options = {}) {
    if (!penpot.currentPage) return { status: "no_page", error: "No Penpot page is focused." };
    const root = targetRoot || penpot.currentPage.root;
    const gridBase = options.gridBase || 4;
    const tokenCatalog = penpot.library?.local?.tokens || { sets: [] };

    const knownColors = new Map();
    const knownFontSizes = new Map();
    const knownRadii = new Map();
    const knownSpacing = new Map();

    for (const set of tokenCatalog.sets || []) {
      if (!set.active) continue;
      for (const [type, tokens] of iterTokensByType(set)) {
        for (const t of tokens || []) {
          const val = String(t.value ?? t.resolvedValueString ?? t.resolvedValue ?? "").toUpperCase();
          const num = parseFloat(val);
          if (type === "color" && val.startsWith("#")) knownColors.set(val, t.name);
          else if ((type === "fontSizes" || type === "dimension") && !isNaN(num)) knownFontSizes.set(num, t.name);
          if ((type === "borderRadius" || type === "dimension") && !isNaN(num)) knownRadii.set(num, t.name);
          if ((type === "spacing" || type === "dimension") && !isNaN(num)) knownSpacing.set(num, t.name);
        }
      }
    }
    for (const c of penpot.library?.local?.colors || []) {
      if (c.color) knownColors.set(c.color.toUpperCase(), `library:${c.name}`);
    }

    const allShapes = penpotUtils.findShapes(() => true, root);
    let totalAudited = 0;
    let tokenizedCount = 0;
    let boundTokenCount = 0;
    const deviations = [];
    const a11yIssues = [];

    const hasBoundToken = (shape, prop) => {
      if (!shape.tokens || typeof shape.tokens !== "object") return false;
      return Boolean(shape.tokens[prop]);
    };

    const findBgHex = shape => {
      let curr = shape.parent || shape.board || root;
      while (curr) {
        if (Array.isArray(curr.fills)) {
          const solid = curr.fills.find(f => f && f.fillColor && (f.fillOpacity ?? 1) >= 0.5);
          if (solid) return solid.fillColor.toUpperCase();
        }
        curr = curr.parent;
      }
      return "#FFFFFF";
    };

    for (const s of allShapes) {
      const label = s.name || s.id;
      // 1. Fills
      if (Array.isArray(s.fills)) {
        for (const f of s.fills) {
          if (f && f.fillColor) {
            totalAudited++;
            const hex = f.fillColor.toUpperCase();
            const isBound = hasBoundToken(s, "fill");
            if (isBound) boundTokenCount++;
            if (isBound || knownColors.has(hex)) {
              tokenizedCount++;
            } else {
              deviations.push({ shape: label, prop: "fill", actual: hex, hint: "off-system fill color" });
            }
          }
        }
      }

      // 2. Strokes
      if (Array.isArray(s.strokes)) {
        for (const st of s.strokes) {
          if (st && st.strokeColor) {
            totalAudited++;
            const hex = st.strokeColor.toUpperCase();
            const isBound = hasBoundToken(s, "stroke-color") || hasBoundToken(s, "stroke");
            if (isBound) boundTokenCount++;
            if (isBound || knownColors.has(hex)) {
              tokenizedCount++;
            } else {
              deviations.push({ shape: label, prop: "strokeColor", actual: hex, hint: "off-system stroke color" });
            }
          }
        }
      }

      // 3. Text fontSize + WCAG contrast
      if (s.type === "text" && s.fontSize) {
        totalAudited++;
        const sz = parseFloat(s.fontSize);
        const isBound = hasBoundToken(s, "font-size") || hasBoundToken(s, "fontSize");
        if (isBound) boundTokenCount++;
        if (isBound || knownFontSizes.has(sz)) {
          tokenizedCount++;
        } else {
          deviations.push({ shape: label, prop: "fontSize", actual: `${s.fontSize}px`, hint: "off-scale font size" });
        }

        const fgHex = s.fills?.[0]?.fillColor;
        if (fgHex) {
          const bgHex = findBgHex(s);
          const ratio = contrastRatio(fgHex, bgHex);
          const weight = parseFloat(s.fontWeight || 400);
          const isLargeText = sz >= 24 || (sz >= 18.66 && weight >= 700);
          const minRatio = isLargeText ? 3.0 : 4.5;
          if (ratio !== null && ratio < minRatio) {
            a11yIssues.push({
              shape: label,
              rule: "WCAG-AA-contrast",
              ratio,
              required: minRatio,
              fg: fgHex.toUpperCase(),
              bg: bgHex
            });
          }
        }
      }

      // 4. Flex layout gap grid check
      if (s.flex) {
        for (const gapProp of ["rowGap", "columnGap"]) {
          const val = Number(s.flex[gapProp] || 0);
          if (val > 0) {
            totalAudited++;
            if (knownSpacing.has(val) || val % gridBase === 0) {
              tokenizedCount++;
            } else {
              deviations.push({ shape: label, prop: gapProp, actual: `${val}px`, hint: `off-${gridBase}px spacing grid` });
            }
          }
        }
      }

      // 5. Interactive touch target size check (WCAG 2.2 AA >= 24x24)
      const isInteractive =
        (Array.isArray(s.interactions) && s.interactions.length > 0) ||
        /\b(button|btn|cta|input|checkbox|radio|toggle|switch|icon-btn)\b/i.test(s.name || "");
      if (isInteractive && s.width != null && s.height != null) {
        if (s.width < 24 || s.height < 24) {
          a11yIssues.push({
            shape: label,
            rule: "WCAG-2.5.8-target-size",
            size: `${Math.round(s.width)}x${Math.round(s.height)}`,
            required: "24x24"
          });
        }
      }
    }

    const coverage = totalAudited > 0 ? Math.round((tokenizedCount / totalAudited) * 100) : 100;
    const strictBoundCoverage = totalAudited > 0 ? Math.round((boundTokenCount / totalAudited) * 100) : 0;

    return {
      coverage: `${coverage}%`,
      strictBoundCoverage: `${strictBoundCoverage}%`,
      totalAudited,
      tokenizedCount,
      boundTokenCount,
      deviationsCount: deviations.length,
      deviations: deviations.slice(0, 15),
      a11yIssuesCount: a11yIssues.length,
      a11yIssues: a11yIssues.slice(0, 15)
    };
  }

  function exportTokensDtcg() {
    const catalog = penpot.library?.local?.tokens || { sets: [] };
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
      for (const [type, tokens] of iterTokensByType(set)) {
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
            $value: t.value ?? t.resolvedValueString ?? t.resolvedValue,
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
  }

  function exportTokensRawSets() {
    const catalog = penpot.library?.local?.tokens || { sets: [] };
    const sets = [];
    for (const set of catalog.sets || []) {
      const tokensByType = [];
      for (const [type, tokens] of iterTokensByType(set)) {
        tokensByType.push({
          type,
          tokens: (tokens || []).map(t => ({
            name: t.name,
            value: t.value ?? t.resolvedValueString ?? t.resolvedValue,
            resolvedValue: t.resolvedValueString ?? t.resolvedValue ?? t.value
          }))
        });
      }
      sets.push({
        name: set.name,
        active: Boolean(set.active),
        tokensByType
      });
    }
    return { sets };
  }

  const helpers = {
    contrastRatio,
    healthcheck,
    nextBoardPosition,
    auditPage,
    exportTokensDtcg,
    exportTokensRawSets
  };

  if (storage && typeof storage === "object") {
    storage.helpers = helpers;
  }
  return helpers;
}

export function getRuntimeHelpersBootstrapCode(callExpr = null) {
  const fnSource = installRuntimeHelpers.toString();
  const base = `(${fnSource})(penpot, penpotUtils, storage);`;
  if (!callExpr) {
    return `${base}\nreturn { installed: Object.keys(storage.helpers) };`;
  }
  return `${base}\nreturn storage.helpers.${callExpr};`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const callFlag = process.argv.slice(2).find(a => a.startsWith("--call="));
  const callMap = {
    healthcheck: "healthcheck()",
    audit: "auditPage()",
    dtcg: "exportTokensDtcg()",
    sets: "exportTokensRawSets()",
    nextBoard: "nextBoardPosition()"
  };
  const key = callFlag ? callFlag.split("=")[1] : null;
  const expr = key ? callMap[key] || key : null;
  process.stdout.write(getRuntimeHelpersBootstrapCode(expr) + "\n");
}
