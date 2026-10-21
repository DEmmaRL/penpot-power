---
name: connection-setup
description: >
  Connect the agent to a Penpot design file through the official Penpot remote
  (hosted) MCP server. Use this skill FIRST, before any read, create, or
  design-to-code task, whenever Penpot tools are not yet reachable. Handles
  enabling MCP in Penpot, the MCP key, the server URL, connecting the in-file
  plugin, and the common connectivity gotchas (keeping the tab active, the
  single active MCP tab, the focused page).
---

# Connect to Penpot (Remote / Hosted MCP Server)

This power targets Penpot's **remote (hosted) MCP server** — the recommended
option for most users. Nothing runs on the user's machine. The agent reaches it
through the `penpot` MCP server in this power's `mcp.json`, which wraps the
hosted Streamable HTTP endpoint natively.

Important facts (from Penpot's official docs):

- Remote MCP **does** require a personal **MCP key** (`userToken`). It is **not**
  credential-free. The key is embedded in the server URL.
- The remote server URL has the form
  `https://<your-penpot-domain>/mcp/stream?userToken=YOUR_MCP_KEY`.
  On the official SaaS the domain is `design.penpot.app`.
- MCP always acts on the **currently focused page** in the **active Penpot tab**.
  Only one tab can own MCP at a time.
- Remote mode has no direct MCP server file-system access: `import_image` is not
  registered as an MCP tool, and `export_shape` returns image data inline rather
  than writing to disk. **However, you CAN still send local workspace assets to
  Penpot in remote mode:** SVGs via `penpot.createShapeFromSvg`, public raster images
  via `penpot.uploadMediaUrl`, or tiny local raster previews (≤ 15 KB) via
  `penpotUtils.importImage` inside `execute_code` — see `asset-and-token-sync`!

## Step 0: Diagnostic Healthcheck Probe

Before any read, create, or modify operation, verify that the canvas connection is live:

```javascript
if (!penpot.currentPage) {
  return { status: "no_page", error: "No Penpot page is focused or plugin is not connected." };
}
return {
  status: "connected",
  page: penpot.currentPage.name,
  pageId: penpot.currentPage.id,
  totalBoards: penpotUtils.findShapes(s => s.type === "board", penpot.currentPage.root).length
};
```

If the call succeeds and returns `status: "connected"`, verify that `page` is indeed the target page the user wants to work on, then proceed.

If the call throws an error or returns `status: "no_page"`, immediately run the corresponding **Diagnostic & Recovery Protocol** below.

---

## Diagnostic & Recovery Protocol

### Procedure 1: Tab Suspended (Browser Sleeping Tab / Inactivity)

**Symptoms:** Tool call fails with `"tab appears suspended"`, socket closed, transport error, or execution timeout.
**Root Cause:** Chromium, Brave, or Edge put background tabs to sleep after several minutes of inactivity to save RAM/CPU.
**Agent Action Protocol:**
1. Tell the user:
   > "The Penpot browser tab was suspended by your browser. Please click into your Penpot tab to wake it up."
2. Wait 2–3 seconds for the WebSocket connection between the in-file plugin and the hosted server to re-establish.
3. Re-run the **Step 0 Healthcheck Probe**.
4. **Prevent repeat suspensions:** Instruct the user:
   - **Pin the tab:** Right-click the Penpot tab → **Pin tab** (keeps browser from unloading it).
   - **Chrome / Brave / Edge:** Go to `chrome://settings/performance` → under **"Always keep these sites active"** (or Memory Saver exceptions), add `design.penpot.app` (or your self-hosted domain).

### Procedure 2: In-File Plugin Disconnected

**Symptoms:** `"No Penpot plugin instance is connected"`, `"Plugin not found"`, or `status: "no_page"`.
**Root Cause:** The file was refreshed, closed, or the MCP plugin session dropped.
**Agent Action Protocol:**
1. Tell the user:
   > "The Penpot MCP plugin is not connected to this file. In your Penpot tab, click **File → MCP Server → Connect**."
2. Ask the user to confirm once the plugin status shows connected.
3. Re-run the **Step 0 Healthcheck Probe**.

### Procedure 3: Expired or Revoked Key (401 / 403 Unauthorized)

**Symptoms:** Tool calls fail with authorization errors, HTTP 401/403, or invalid token.
**Root Cause:** The MCP key was regenerated in Penpot or expired.
**Agent Action Protocol:**
1. Direct the user to **Your account → Integrations → MCP Server** in Penpot.
2. Click **Generate / Regenerate MCP Key**. (Note: this invalidates old keys).
3. Update the client environment with the new `PENPOT_MCP_KEY`.
4. Re-run the **Step 0 Healthcheck Probe**.

### Procedure 4: Target Page Guard (Prevent Mutating Wrong Page)

**Symptoms:** The healthcheck succeeds, but `page` does not match what the user is working on.
**Root Cause:** The remote MCP server always targets the **active focused page** of the currently active Penpot tab.
**Agent Action Protocol:**
1. **Never perform create or modify operations on an unverified page.**
2. Report the discrepancy to the user:
   > "The MCP plugin is currently focused on page **'{page}'**, but your task seems to target another page. Please switch to the desired page in Penpot before I proceed."
3. Re-run probe after the user confirms they switched.

---

## Step 1: Initial Setup (When setting up for the first time)

Ask the user to:

1. Open **Your account → Integrations → MCP Server** in Penpot.
2. Toggle **MCP Server** on.
3. Generate an **MCP key** if they don't have one. It is shown **once** — store
   it safely. Treat it like a password; never paste it into chat or logs.
4. Copy the **server URL** shown there (it already includes the key as
   `userToken`).

## Step 2: Provide credentials to this power (not via chat)

This power's `mcp.json` uses placeholders rather than hardcoded secrets:

- `PENPOT_DOMAIN` — e.g. `design.penpot.app` (or the user's self-hosted domain)
- `PENPOT_MCP_KEY` — the `userToken` value from the generated key

Kiro prompts for these on first activation / use. Do not ask the user to type
the key into the conversation; it should go into the environment/secret prompt.
If the user prefers, they can instead paste the full ready-made JSON snippet
Penpot generates into their MCP client config.

## Step 3: Connect the plugin to the file

In Penpot, have the user open the target design file and use
**File → MCP Server → Connect** to connect the plugin to the currently focused
page. Keep that tab active and the plugin connected for the whole session.

## Step 4: Available remote tools

The remote MCP server exposes four tools (`import_image` is local-mode only and not registered in remote mode):

| Tool | Notes |
| --- | --- |
| `execute_code` | Run JS in the Penpot plugin context (`penpot`, `penpotUtils`, `storage` globals) |
| `high_level_overview` | Fast overview and API usage guide for Penpot tools |
| `penpot_api_info` | Retrieve Plugin API docs for types and members |
| `export_shape` | Export a shape (`shapeId`, `"selection"`, or `"page"`) as PNG/SVG (returned inline; no local-path export) |

Kiro namespaces these when the power is installed (e.g. `power-penpot-penpot-...`).

## Guardrails

- **Page Guard:** Always verify `penpot.currentPage.name` before applying edits.
- **Fail fast, recover cleanly:** When a call fails, identify if it is tab suspension (Procedure 1) or plugin disconnection (Procedure 2) instead of repeating failed calls blindly.
- **Credential security:** Treat the MCP key like a password. Never echo it in chat, logs, or exports. If it may have leaked, tell the user to regenerate it in Integrations.
- **Mutations:** Connected MCP can perform **write** operations on the focused page. Start read-only, describe intended changes before applying, and prefer small reversible steps.
- Prefer a vision-language model — image understanding is required for many design tasks.

---

*Connection guidance derived from the [Penpot MCP Help Center](https://help.penpot.app/mcp/) and [penpot/penpot MCP README](https://github.com/penpot/penpot/blob/main/mcp/README.md) (MPL-2.0), rewritten in original language. See the [NOTICE](../../NOTICE) file.*
