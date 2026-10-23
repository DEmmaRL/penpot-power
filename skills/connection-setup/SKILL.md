---
name: connection-setup
description: >
  Connect the agent to a Penpot design file through the official Penpot MCP server
  (Local Docker via penpot-local or Remote SaaS via penpot-remote). Use this skill
  FIRST, before any read, create, or design-to-code task, whenever Penpot tools are
  not yet reachable. Handles switching between local and remote, MCP keys, connecting
  the in-file plugin, and diagnostic recovery (sleeping tabs, focused page guard).
---

# Connect to Penpot (Local Docker & Remote SaaS MCP)

This power supports both **Local Docker instances** (`penpot-local`) and **Remote SaaS / Hosted instances** (`penpot-remote`). The agent reaches Penpot through the configured servers in `mcp.json`.

Important facts (from Penpot's official docs & architecture):

- **Dual Server Profiles:**
  - `penpot-local`: Connects to your local Docker instance (default: `http://penpot.localhost/mcp/stream?userToken=...`).
  - `penpot-remote`: Connects to Penpot SaaS or remote host (default: `https://design.penpot.app/mcp/stream?userToken=...`).
  - Identify which instance you are interacting with from the tool name prefix (`penpot-local:execute_code` vs `penpot-remote:execute_code`).
- Both local and remote MCP require a personal **MCP key** (`userToken`). The key is embedded in the server stream URL.
- MCP always acts on the **currently focused page** in the **active Penpot tab**. Only one tab can own MCP at a time.
- **Worker Sandbox Isolation:** Code executed inside `execute_code` runs in an isolated Web Worker sandbox where `window` and `location` are `undefined`. Do not attempt to detect domain or environment via `window.location`.
- **SSRF Protection:** Even on local Docker, `penpot.uploadMediaUrl` is executed by the Penpot backend container, which enforces SSRF protection and rejects private subnets (`localhost`, `127.0.0.1`, `host.docker.internal`). Always send SVGs via `penpot.createShapeFromSvg` and local raster images via `penpotUtils.importImage`!

## Step 0: Diagnostic Healthcheck Probe

Before any read, create, or modify operation, verify that the canvas connection is live:

```javascript
if (!penpot.currentPage) {
  return { status: "no_page", error: "No Penpot page is focused or plugin is not connected." };
}
return {
  status: "connected",
  file: penpot.currentFile ? penpot.currentFile.name : null,
  fileId: penpot.currentFile ? penpot.currentFile.id : null,
  page: penpot.currentPage.name,
  pageId: penpot.currentPage.id,
  version: penpot.version,
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
3. Update the client environment with the new `PENPOT_LOCAL_KEY` or `PENPOT_REMOTE_KEY`.
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

This power's `mcp.json` supports dual connection profiles:

- **Local Docker (`penpot-local`):**
  - `PENPOT_LOCAL_HOST` — default: `penpot.localhost` (or custom host:port)
  - `PENPOT_LOCAL_KEY` — the personal `userToken` from your local instance's **Integrations → MCP Server**
- **Remote SaaS (`penpot-remote`):**
  - `PENPOT_REMOTE_DOMAIN` — default: `design.penpot.app` (or custom domain)
  - `PENPOT_REMOTE_KEY` — the personal `userToken` from **Integrations → MCP Server**

Kiro prompts for these variables on first activation / use. Do not ask the user to type
the key into the conversation; it should go into the environment/secret prompt.
*(Note: Most users only work in one environment at a time—either `penpot-local` or `penpot-remote`. It is normal for the unused profile to remain unconfigured or show as disconnected).*

## Step 3: Connect the plugin to the file

In Penpot, have the user open the target design file and use
**File → MCP Server → Connect** to connect the plugin to the currently focused
page. Keep that tab active and the plugin connected for the whole session.

## Step 4: Available tools (Local & Remote)

Both `penpot-local` and `penpot-remote` expose the official Penpot Plugin API tools:

| Tool | Notes |
| --- | --- |
| `execute_code` | Run JS in the Penpot plugin context (`penpot`, `penpotUtils`, `storage` globals) |
| `high_level_overview` | Fast overview and API usage guide for Penpot tools |
| `penpot_api_info` | Retrieve Plugin API docs for types and members |
| `export_shape` | Export a shape (`shapeId`, `"selection"`, or `"page"`) as PNG/SVG (returned inline) |

Kiro namespaces these per server profile (e.g. `penpot-local:execute_code` vs `penpot-remote:execute_code`). Select the tool matching the user's active environment.

## Guardrails

- **Page Guard:** Always verify `penpot.currentPage.name` before applying edits.
- **Fail fast, recover cleanly:** When a call fails, identify if it is tab suspension (Procedure 1) or plugin disconnection (Procedure 2) instead of repeating failed calls blindly.
- **SSRF Guard:** Never attempt to call `penpot.uploadMediaUrl` on local addresses (`localhost`, `127.0.0.1`, `host.docker.internal`). Penpot's backend rejects internal targets with `:ssrf-blocked-target`.
- **Never Chunk SVGs:** Always pass the complete SVG string to `penpot.createShapeFromSvg` in a single tool call.
- **Credential security:** Treat the MCP key like a password. Never echo it in chat, logs, or exports. If it may have leaked, tell the user to regenerate it in Integrations.
- **Mutations:** Connected MCP can perform **write** operations on the focused page. Start read-only, describe intended changes before applying, and prefer small reversible steps.
- Prefer a vision-language model — image understanding is required for many design tasks.

---

*Connection guidance derived from the [Penpot MCP Help Center](https://help.penpot.app/mcp/) and [penpot/penpot MCP README](https://github.com/penpot/penpot/blob/main/mcp/README.md) (MPL-2.0), rewritten in original language. See the [NOTICE](../../NOTICE) file.*
