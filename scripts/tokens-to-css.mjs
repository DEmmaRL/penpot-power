// Converts a Penpot token export or W3C DTCG file (see asset-and-token-sync) into CSS or Tailwind config.
//
// Usage: node scripts/tokens-to-css.mjs <tokens.json> [output] [--theme | --tailwind]
//
// Rules:
// - Only active sets are used. When a name exists in several active sets, the later set wins
//   (this matches Penpot's precedence: the order in the catalog defines it).
// - Token names become custom properties: "color.brand.primary" -> "--color-brand-primary".
// - In --theme mode (Tailwind v4), variable names are normalized to Tailwind v4 @theme namespaces
//   (--color-*, --text-*, --font-*, --font-weight-*, --radius-*, --spacing-*).
// - Alias values ("{group.name}") become var(--group-name) references in CSS and are resolved in Tailwind v3.
// - Types that have no single CSS equivalent (shadow, typography, ...) are skipped and reported.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const UNITLESS_TO_PX = new Set([
  "dimension",
  "spacing",
  "sizing",
  "borderRadius",
  "borderWidth",
  "fontSizes",
  "fontSize",
  "letterSpacing"
]);
const PASS_THROUGH = new Set([
  "color",
  "fontWeights",
  "fontWeight",
  "opacity",
  "number",
  "rotation"
]);
const ALIAS = /^\{([^}]+)\}$/;

export function cssName(tokenName, options = {}) {
  const { theme = false, type = null } = options;
  const slug = tokenName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!theme) {
    return "--" + slug;
  }
  // Normalize to Tailwind v4 @theme namespaces
  if (type === "fontSizes" || type === "fontSize" || slug.startsWith("font-size-")) {
    const rest = slug.replace(/^(font-size|fontsize|text-size|text|size)-/, "");
    return `--text-${rest}`;
  }
  if (type === "fontFamilies" || type === "fontFamily" || slug.startsWith("font-family-")) {
    const rest = slug.replace(/^(font-family|fontfamily|font)-/, "");
    return `--font-${rest}`;
  }
  if (type === "fontWeights" || type === "fontWeight" || slug.startsWith("font-weight-")) {
    const rest = slug.replace(/^(font-weight|fontweight|weight)-/, "");
    return `--font-weight-${rest}`;
  }
  if (type === "borderRadius" || slug.startsWith("border-radius-") || slug.startsWith("radius-")) {
    const rest = slug.replace(/^(border-radius|borderradius|radius)-/, "");
    return `--radius-${rest}`;
  }
  if (type === "spacing" || slug.startsWith("spacing-") || slug.startsWith("space-")) {
    const rest = slug.replace(/^(spacing|space)-/, "");
    return `--spacing-${rest}`;
  }
  if (type === "color" && !slug.startsWith("color-")) {
    return `--color-${slug}`;
  }
  return "--" + slug;
}

function formatFontFamilyList(list) {
  return list
    .map(f => String(f).trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .map(f => (/^[a-z-]+$/i.test(f) ? f : `"${f}"`))
    .join(", ");
}

function cssValue(token, type, options = {}) {
  const { theme = false, tokenTypeMap = new Map() } = options;
  const raw = token.value;
  if (typeof raw === "string" && ALIAS.test(raw)) {
    const targetName = raw.match(ALIAS)[1];
    const targetType = tokenTypeMap.get(targetName) || type;
    return { value: `var(${cssName(targetName, { theme, type: targetType })})` };
  }
  if (type === "fontFamilies" || type === "fontFamily") {
    if (Array.isArray(raw) && raw.length > 0) {
      return { value: formatFontFamilyList(raw) };
    }
    if (typeof raw === "string" && raw.trim().length > 0) {
      return { value: formatFontFamilyList(raw.split(",")) };
    }
    return { skip: "font family without a literal value" };
  }
  if (UNITLESS_TO_PX.has(type)) {
    const text = typeof raw === "string" || typeof raw === "number" ? String(raw) : token.resolvedValue;
    if (text == null || text === "") return { skip: "no value" };
    return { value: /^-?\d+(\.\d+)?$/.test(text) ? `${text}px` : text };
  }
  if (PASS_THROUGH.has(type)) {
    if (raw == null || raw === "") return { skip: "no value" };
    return { value: String(raw) };
  }
  return { skip: `type "${type}" has no direct CSS custom-property form` };
}

function inferDimensionSubtype(path, currentType, explicitSubtype) {
  if (explicitSubtype) return explicitSubtype;
  if (currentType !== "dimension") return currentType;
  const joined = path.join(".").toLowerCase();
  if (/^(radius|border-radius|borderradius|rounded)(\.|$)/.test(joined)) return "borderRadius";
  if (/^(font\.size|font-size|fontsize|fontsizes|text\.size|text-size)(\.|$)/.test(joined)) return "fontSizes";
  if (/^(spacing|space|gap|padding|margin)(\.|$)/.test(joined)) return "spacing";
  if (/^(sizing|size|width|height)(\.|$)/.test(joined)) return "sizing";
  if (/^(border\.width|border-width|borderwidth)(\.|$)/.test(joined)) return "borderWidth";
  return currentType;
}

export function extractDtcgTokens(node, path = [], inheritedType = null) {
  const tokens = [];
  if (!node || typeof node !== "object") return tokens;

  const currentType = node.$type || node.type || inheritedType;

  // Check if this node is a leaf token
  if ("$value" in node || "value" in node) {
    const rawVal = node.$value !== undefined ? node.$value : node.value;
    const extType =
      node.$extensions?.["app.penpot"]?.type ||
      node.$extensions?.penpot?.type ||
      null;
    const effectiveType = inferDimensionSubtype(path, currentType, extType);
    tokens.push({
      name: path.join("."),
      value: rawVal,
      resolvedValue: node.resolvedValue ?? node.resolvedValueString,
      type: effectiveType,
      dtcgType: currentType
    });
    return tokens;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") && key !== "$type") continue;
    if (child && typeof child === "object") {
      tokens.push(...extractDtcgTokens(child, [...path, key], currentType));
    }
  }
  return tokens;
}

function normalizeTokensByType(tokensByType) {
  if (!tokensByType) return [];
  if (Array.isArray(tokensByType)) {
    return tokensByType.map(entry => {
      if (Array.isArray(entry)) {
        return { type: entry[0], tokens: entry[1] ?? [] };
      }
      if (entry && typeof entry === "object") {
        return { type: entry.type, tokens: entry.tokens ?? [] };
      }
      return { type: "unknown", tokens: [] };
    });
  }
  if (typeof tokensByType === "object") {
    return Object.entries(tokensByType).map(([type, tokens]) => ({
      type,
      tokens: Array.isArray(tokens) ? tokens : []
    }));
  }
  return [];
}

export function extractTokens(data) {
  if (!data || typeof data !== "object") throw new Error("Input must be a valid JSON object or sets array.");
  if (Array.isArray(data.sets)) {
    const byName = new Map();
    for (const set of data.sets) {
      if (!set.active) continue;
      for (const group of normalizeTokensByType(set.tokensByType)) {
        for (const token of group.tokens ?? []) {
          const resolved = token.resolvedValue ?? token.resolvedValueString;
          byName.set(token.name, {
            name: token.name,
            value: token.value ?? resolved,
            resolvedValue: resolved,
            type: group.type,
            set: set.name
          });
        }
      }
    }
    return [...byName.values()];
  }
  const extracted = extractDtcgTokens(data);
  if (extracted.length === 0 && !Array.isArray(data.sets)) {
    throw new Error("No tokens found. Input must be a valid W3C DTCG token object or Penpot sets export.");
  }
  return extracted;
}

function resolveAliasValue(token, tokenMap, visited = new Set()) {
  const raw = token.value;
  if (typeof raw === "string" && ALIAS.test(raw)) {
    if (token.resolvedValue != null && token.resolvedValue !== "") {
      return token.resolvedValue;
    }
    const targetName = raw.match(ALIAS)[1];
    if (visited.has(targetName)) return raw;
    const target = tokenMap.get(targetName);
    if (!target) return raw;
    visited.add(targetName);
    return resolveAliasValue(target, tokenMap, visited);
  }
  return raw ?? token.resolvedValue;
}

export function tokensToCss(data, sourceName = "tokens.json", options = {}) {
  const { wrapper = ":root" } = options;
  const isTheme = wrapper === "@theme";
  const rawTokens = extractTokens(data);
  const tokenTypeMap = new Map(rawTokens.map(t => [t.name, t.type]));
  const byName = new Map();
  const skipped = [];
  for (const token of rawTokens) {
    const result = cssValue(token, token.type, { theme: isTheme, tokenTypeMap });
    if (result.skip) {
      skipped.push(`${token.name} (${result.skip})`);
      continue;
    }
    const propName = cssName(token.name, { theme: isTheme, type: token.type });
    byName.set(propName, { name: propName, value: result.value });
  }
  const entries = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    `/* Generated by penpot-power from ${basename(sourceName)}. Do not edit by hand; regenerate instead. */`,
    `${wrapper} {`,
    ...entries.map(e => `  ${e.name}: ${e.value};`),
    "}",
    "",
  ];
  return { css: lines.join("\n"), count: entries.length, skipped, entries };
}

export function tokensToTailwind(data, sourceName = "tokens.json") {
  const rawTokens = extractTokens(data);
  const tokenMap = new Map(rawTokens.map(t => [t.name, t]));
  const theme = {
    colors: {},
    spacing: {},
    borderRadius: {},
    fontSize: {},
    fontWeight: {},
    fontFamily: {}
  };
  const skipped = [];
  for (const token of rawTokens) {
    const raw = resolveAliasValue(token, tokenMap);
    if (raw == null) continue;
    const cleanKey = token.name
      .toLowerCase()
      .replace(/^(color|spacing|space|dimension|sizing|radius|border-radius|border-width|font-size|font-weight|font-family|font|shadow)\./g, "")
      .replace(/^(size|family|weight)\./g, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const type = token.type;
    if (type === "color") {
      theme.colors[cleanKey] = String(raw);
    } else if (type === "spacing" || type === "dimension" || type === "sizing") {
      theme.spacing[cleanKey] = /^-?\d+(\.\d+)?$/.test(String(raw)) ? `${raw}px` : String(raw);
    } else if (type === "borderRadius") {
      theme.borderRadius[cleanKey] = /^-?\d+(\.\d+)?$/.test(String(raw)) ? `${raw}px` : String(raw);
    } else if (type === "fontSizes" || type === "fontSize") {
      theme.fontSize[cleanKey] = /^-?\d+(\.\d+)?$/.test(String(raw)) ? `${raw}px` : String(raw);
    } else if (type === "fontWeights" || type === "fontWeight") {
      theme.fontWeight[cleanKey] = String(raw);
    } else if (type === "fontFamilies" || type === "fontFamily") {
      theme.fontFamily[cleanKey] = Array.isArray(raw)
        ? raw
        : String(raw)
            .split(",")
            .map(s => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
    } else {
      skipped.push(`${token.name} (${type})`);
    }
  }
  const cleanTheme = Object.fromEntries(
    Object.entries(theme).filter(([, val]) => Object.keys(val).length > 0)
  );
  const content = `/** Generated by penpot-power from ${basename(sourceName)}. Do not edit by hand; regenerate instead. */\nmodule.exports = {\n  theme: {\n    extend: ${JSON.stringify(cleanTheme, null, 6).replace(/\n/g, "\n  ")}\n  }\n};\n`;
  const count = Object.values(cleanTheme).reduce((acc, cat) => acc + Object.keys(cat).length, 0);
  return { js: content, theme: cleanTheme, count, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith("--")));
  const nonFlags = args.filter(a => !a.startsWith("--"));
  const [input, output] = nonFlags;

  if (!input) {
    console.error("Usage: node scripts/tokens-to-css.mjs <tokens.json> [output] [--theme | --tailwind]");
    console.error("  --theme     Format as Tailwind v4 @theme CSS block");
    console.error("  --tailwind  Format as Tailwind v3 JavaScript configuration module");
    process.exit(2);
  }

  const rawJson = JSON.parse(readFileSync(input, "utf8"));

  if (flags.has("--tailwind")) {
    const { js, count, skipped } = tokensToTailwind(rawJson, input);
    if (output) writeFileSync(output, js);
    else process.stdout.write(js);
    console.error(`Wrote ${count} Tailwind tokens${output ? ` to ${output}` : ""}.`);
    if (skipped.length) {
      console.error(`Skipped ${skipped.length} token(s):`);
      for (const s of skipped) console.error(`  - ${s}`);
    }
  } else {
    const wrapper = flags.has("--theme") ? "@theme" : ":root";
    const { css, count, skipped } = tokensToCss(rawJson, input, { wrapper });
    if (output) writeFileSync(output, css);
    else process.stdout.write(css);
    console.error(`Wrote ${count} custom properties (${wrapper})${output ? ` to ${output}` : ""}.`);
    if (skipped.length) {
      console.error(`Skipped ${skipped.length} token(s):`);
      for (const s of skipped) console.error(`  - ${s}`);
    }
  }
}
