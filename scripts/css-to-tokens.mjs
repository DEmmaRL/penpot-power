// Reverse token compiler: converts CSS (:root / @theme) or W3C DTCG JSON into:
//   1. Standard W3C DTCG JSON (--dtcg, default when input is .css)
//   2. Ready-to-run Penpot execute_code JS payload (--penpot-js) to populate penpot.library.local.tokens
//
// Usage:
//   node scripts/css-to-tokens.mjs <input.css|tokens.json> [output] [--dtcg | --penpot-js] [--set-name="Project Tokens"]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { extractTokens } from "./tokens-to-css.mjs";

const DTCG_TYPE_MAP = {
  color: "color",
  spacing: "dimension",
  sizing: "dimension",
  borderRadius: "dimension",
  borderWidth: "dimension",
  fontSizes: "dimension",
  fontSize: "dimension",
  dimension: "dimension",
  fontFamilies: "fontFamily",
  fontFamily: "fontFamily",
  fontWeights: "fontWeight",
  fontWeight: "fontWeight",
  opacity: "number",
  number: "number"
};

export function propToTokenMeta(propName, rawValue) {
  const cleanProp = propName.replace(/^--+/, "").trim().toLowerCase();
  const val = rawValue.trim();

  let penpotType = "dimension";
  let tokenName = cleanProp.replace(/-/g, ".");

  if (cleanProp.startsWith("color-")) {
    penpotType = "color";
    const rest = cleanProp.slice("color-".length).replace(/-/g, ".");
    tokenName = `color.${rest}`;
  } else if (cleanProp.startsWith("font-size-") || cleanProp.startsWith("text-")) {
    const rest = cleanProp.replace(/^(font-size|text)-/, "");
    // Distinguish Tailwind v4 --text-* font sizes vs --text-* colors
    if (/^#[0-9a-f]{3,8}$/i.test(val) || /^rgba?\(|^hsla?\(|^oklch\(/i.test(val) || /^var\(--color-/.test(val)) {
      penpotType = "color";
      tokenName = `color.text.${rest.replace(/-/g, ".")}`;
    } else {
      penpotType = "fontSizes";
      tokenName = `font.size.${rest.replace(/-/g, ".")}`;
    }
  } else if (cleanProp.startsWith("font-weight-")) {
    penpotType = "fontWeights";
    const rest = cleanProp.slice("font-weight-".length).replace(/-/g, ".");
    tokenName = `font.weight.${rest}`;
  } else if (cleanProp.startsWith("font-family-") || cleanProp.startsWith("font-")) {
    penpotType = "fontFamilies";
    const rest = cleanProp.replace(/^(font-family|font)-/, "").replace(/-/g, ".");
    tokenName = `font.family.${rest}`;
  } else if (cleanProp.startsWith("radius-") || cleanProp.startsWith("border-radius-")) {
    penpotType = "borderRadius";
    const rest = cleanProp.replace(/^(border-radius|radius)-/, "").replace(/-/g, ".");
    tokenName = `radius.${rest}`;
  } else if (cleanProp.startsWith("spacing-") || cleanProp.startsWith("space-")) {
    penpotType = "spacing";
    const rest = cleanProp.replace(/^(spacing|space)-/, "").replace(/-/g, ".");
    tokenName = `spacing.${rest}`;
  } else if (cleanProp.startsWith("sizing-") || cleanProp.startsWith("size-")) {
    penpotType = "sizing";
    const rest = cleanProp.replace(/^(sizing|size)-/, "").replace(/-/g, ".");
    tokenName = `sizing.${rest}`;
  } else if (cleanProp.startsWith("opacity-")) {
    penpotType = "opacity";
    const rest = cleanProp.slice("opacity-".length).replace(/-/g, ".");
    tokenName = `opacity.${rest}`;
  } else if (/^#[0-9a-f]{3,8}$/i.test(val) || /^rgba?\(|^hsla?\(|^oklch\(/i.test(val)) {
    penpotType = "color";
  }

  return { tokenName, penpotType, dtcgType: DTCG_TYPE_MAP[penpotType] || penpotType };
}

function normalizeValue(rawValue, penpotType, propMap) {
  const trimmed = rawValue.trim();
  const varMatch = trimmed.match(/^var\(\s*(--[a-zA-Z0-9-_]+)\s*(?:,[^)]+)?\)$/);
  if (varMatch) {
    const refProp = varMatch[1].toLowerCase();
    const mappedName = propMap.get(refProp) || propToTokenMeta(refProp, "").tokenName;
    return `{${mappedName}}`;
  }
  if (penpotType === "fontFamilies" || penpotType === "fontFamily") {
    return trimmed
      .split(",")
      .map(s => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
      .join(", ");
  }
  if (/^-?\d+(\.\d+)?rem$/i.test(trimmed)) {
    const rem = parseFloat(trimmed);
    return `${Math.round(rem * 16 * 100) / 100}px`;
  }
  return trimmed;
}

export function findAvailableName(baseName, existingNames, suffix = "base") {
  let candidate = `${baseName}.${suffix}`;
  if (!existingNames.has(candidate)) return candidate;
  candidate = `${baseName}.default`;
  if (!existingNames.has(candidate)) return candidate;
  let counter = 1;
  while (existingNames.has(`${baseName}.${suffix}-${counter}`)) {
    counter++;
  }
  return `${baseName}.${suffix}-${counter}`;
}

export function resolveTokenCollisions(tokens, options = {}) {
  const { suffix = "base" } = options;
  if (!Array.isArray(tokens) || tokens.length === 0) return tokens;

  const names = new Set(tokens.map(t => t.name));
  const renames = new Map();

  for (const name of names) {
    const prefix = name + ".";
    for (const other of names) {
      if (other.startsWith(prefix)) {
        const newName = findAvailableName(name, names, suffix);
        renames.set(name, newName);
        names.add(newName);
        break;
      }
    }
  }

  if (renames.size === 0) return tokens;

  return tokens.map(t => {
    let name = t.name;
    if (renames.has(name)) {
      name = renames.get(name);
    }
    let value = t.value;
    if (typeof value === "string") {
      for (const [oldName, newName] of renames) {
        if (value.includes(`{${oldName}}`)) {
          value = value.replaceAll(`{${oldName}}`, `{${newName}}`);
        }
      }
    }
    return {
      ...t,
      name,
      value
    };
  });
}

export function parseCssTokens(cssText, options = {}) {
  if (typeof cssText !== "string") {
    throw new Error("CSS input must be a string.");
  }
  // Remove block comments
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const declRegex = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;{}]+);/g;
  const rawDecls = [];
  const propMap = new Map();

  let match;
  while ((match = declRegex.exec(stripped)) !== null) {
    const prop = match[1].trim().toLowerCase();
    const rawVal = match[2].trim();
    const meta = propToTokenMeta(prop, rawVal);
    propMap.set(prop, meta.tokenName);
    rawDecls.push({ prop, rawVal, ...meta });
  }

  if (rawDecls.length === 0) {
    throw new Error("No CSS custom properties (--*) found in input.");
  }

  // Detect and resolve hierarchical prefix collisions (leaf vs branch nodes).
  // In Penpot and DTCG, token paths use dot notation. If "color.primary" and "color.primary.hover"
  // both exist, "color.primary" cannot simultaneously be a leaf value and a branch container.
  // We resolve this by appending a suffix (default: ".base") to the parent node.
  const allNames = new Set(rawDecls.map(d => d.tokenName));
  const collisionRenames = new Map();
  for (const name of allNames) {
    const prefix = name + ".";
    for (const other of allNames) {
      if (other.startsWith(prefix)) {
        const newName = findAvailableName(name, allNames, options.suffix || "base");
        collisionRenames.set(name, newName);
        allNames.add(newName);
        break;
      }
    }
  }

  if (collisionRenames.size > 0) {
    for (const d of rawDecls) {
      if (collisionRenames.has(d.tokenName)) {
        const newName = collisionRenames.get(d.tokenName);
        d.tokenName = newName;
        propMap.set(d.prop, newName);
      }
    }
  }

  const byName = new Map();
  for (const d of rawDecls) {
    let value = normalizeValue(d.rawVal, d.penpotType, propMap);
    if (typeof value === "string") {
      for (const [oldName, newName] of collisionRenames) {
        if (value.includes(`{${oldName}}`)) {
          value = value.replaceAll(`{${oldName}}`, `{${newName}}`);
        }
      }
    }
    byName.set(d.tokenName, {
      name: d.tokenName,
      value,
      type: d.penpotType,
      dtcgType: d.dtcgType
    });
  }
  return [...byName.values()];
}

export function tokensToDtcgObject(tokens) {
  const dtcg = {};
  for (const t of tokens) {
    const parts = t.name.split(".");
    let curr = dtcg;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]] || typeof curr[parts[i]] !== "object" || "$value" in curr[parts[i]]) {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    const dtcgType = t.dtcgType || DTCG_TYPE_MAP[t.type] || t.type;
    const entry = {
      $value: t.value,
      $type: dtcgType
    };
    if (t.type && t.type !== dtcgType) {
      entry.$extensions = { "app.penpot": { type: t.type } };
    }
    curr[leaf] = entry;
  }
  return dtcg;
}

export function cssToDtcg(cssText) {
  const tokens = parseCssTokens(cssText);
  const dtcg = tokensToDtcgObject(tokens);
  return { dtcg, tokens, count: tokens.length };
}

function penpotValueString(token) {
  const val = token.value;
  if (Array.isArray(val)) return val.join(", ");
  const str = String(val ?? "");
  // Strip trailing "px" for numeric Penpot dimension tokens if not an alias
  if (
    ["spacing", "sizing", "borderRadius", "borderWidth", "fontSizes", "fontSize", "dimension"].includes(token.type) &&
    /^-?\d+(\.\d+)?px$/i.test(str)
  ) {
    return str.replace(/px$/i, "");
  }
  return str;
}

export function tokensToPenpotScript(input, options = {}) {
  const { setName = "Project Tokens", suffix = "base" } = options;
  let tokens;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      tokens = resolveTokenCollisions(extractTokens(JSON.parse(trimmed)), { suffix });
    } else {
      tokens = parseCssTokens(trimmed, { suffix });
    }
  } else if (input && typeof input === "object") {
    tokens = resolveTokenCollisions(extractTokens(input), { suffix });
  } else {
    throw new Error("Input must be a CSS string or valid token JSON object.");
  }

  const payload = tokens.map(t => ({
    type: t.type === "fontSize" ? "fontSizes" : t.type === "fontFamily" ? "fontFamilies" : t.type === "fontWeight" ? "fontWeights" : t.type,
    name: t.name,
    value: penpotValueString(t)
  }));

  const code = [
    `if (!penpot.currentPage) return { status: "no_page", error: "No Penpot page is focused." };`,
    `const catalog = penpot.library.local.tokens;`,
    `const setName = ${JSON.stringify(setName)};`,
    `let set = (catalog.sets || []).find(s => s.name === setName);`,
    `if (!set) set = catalog.addSet({ name: setName });`,
    `if (!set.active) set.toggleActive();`,
    `const incoming = ${JSON.stringify(payload, null, 2)};`,
    `let created = 0, updated = 0, removed = 0;`,
    `const incomingNames = new Set(incoming.map(t => t.name));`,
    `for (const existing of [...(set.tokens || [])]) {`,
    `  if (!incomingNames.has(existing.name)) {`,
    `    const isPrefix = incoming.some(item => item.name.startsWith(existing.name + "."));`,
    `    const isChild = incoming.some(item => existing.name.startsWith(item.name + "."));`,
    `    if (isPrefix || isChild) {`,
    `      if (typeof existing.remove === "function") existing.remove();`,
    `      removed++;`,
    `    }`,
    `  }`,
    `}`,
    `const existingByName = new Map((set.tokens || []).map(t => [t.name, t]));`,
    `for (const item of incoming) {`,
    `  const found = existingByName.get(item.name);`,
    `  if (found && typeof found === "object" && "value" in found) {`,
    `    found.value = item.value;`,
    `    updated++;`,
    `  } else {`,
    `    set.addToken(item);`,
    `    created++;`,
    `  }`,
    `}`,
    `return { set: set.name, active: set.active, total: incoming.length, created, updated, removed };`
  ].join("\n");

  return { code, count: payload.length, tokens: payload };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith("--"));
  const nonFlags = args.filter(a => !a.startsWith("--"));
  const [inputPath, outputPath] = nonFlags;

  if (!inputPath) {
    console.error("Usage: node scripts/css-to-tokens.mjs <input.css|tokens.json> [output] [--dtcg | --penpot-js] [--set-name=\"Project Tokens\"]");
    process.exit(2);
  }

  const setFlag = flags.find(f => f.startsWith("--set-name="));
  const setName = setFlag ? setFlag.split("=").slice(1).join("=") : "Project Tokens";
  const wantPenpotJs = flags.includes("--penpot-js");
  const rawText = readFileSync(inputPath, "utf8");

  if (wantPenpotJs) {
    const { code, count } = tokensToPenpotScript(rawText, { setName });
    if (outputPath) writeFileSync(outputPath, code + "\n");
    else process.stdout.write(code + "\n");
    console.error(`Generated Penpot execute_code script for ${count} token(s) in set "${setName}".`);
  } else {
    const isJson = inputPath.endsWith(".json") || rawText.trim().startsWith("{");
    const tokens = isJson ? resolveTokenCollisions(extractTokens(JSON.parse(rawText))) : parseCssTokens(rawText);
    const dtcg = tokensToDtcgObject(tokens);
    const jsonOut = JSON.stringify(dtcg, null, 2) + "\n";
    if (outputPath) writeFileSync(outputPath, jsonOut);
    else process.stdout.write(jsonOut);
    console.error(`Wrote ${tokens.length} W3C DTCG token(s)${outputPath ? ` to ${outputPath}` : ""}.`);
  }
}
