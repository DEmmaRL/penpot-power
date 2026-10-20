# Penpot MCP — Connection Troubleshooting

Reference for the `connection-setup` skill. Remote (hosted) MCP server mode.

## Connectivity matrix

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Tool calls fail fast with "tab appears suspended" | Browser froze/unloaded the Penpot tab (MCP runs inside it) | Focus the Penpot tab, wait for MCP to reconnect, retry. Keep the tab active/pinned. |
| "No Penpot plugin instance is connected" | The in-file plugin isn't connected, or the tab was unloaded | In Penpot: **File → MCP Server → Connect**; keep the plugin connected. |
| Client lists no Penpot tools | MCP not enabled, bad URL, or key missing/expired | Check **Your account → Integrations → MCP Server** is enabled and the URL/key in the client config are current. |
| "Connection cannot be established" / expired key | The MCP key expired | Regenerate the key in Integrations and update `PENPOT_MCP_KEY`. Regenerating revokes the old key immediately. |
| Agent edits the wrong page | MCP always targets the **focused page** in the **active MCP tab** | Focus the intended file/page; ensure that tab owns MCP (only one tab can at a time). |
| `execute_code` throws a confusing `ReferenceError` | No Penpot plugin is connected, so the API globals aren't available | Connect the plugin (**File → MCP Server → Connect**) before running code; re-run after the status shows connected. |
| Browser blocks the connection | Chromium private-network / local restrictions (mostly local mode) | Allow local network access, or use Firefox. (Primarily affects local mode.) |
| Weak/garbled design results | Underpowered model | Use a capable vision-language model; design tasks need visual inspection. |

## Diagnostic Healthcheck Snippet

Run this in `execute_code` before any operations or immediately after any failure:

```javascript
if (!penpot.currentPage) {
  return { status: "no_page", error: "No Penpot page is focused or plugin is not connected." };
}
return {
  status: "connected",
  page: penpot.currentPage.name,
  pageId: penpot.currentPage.id,
  boards: penpotUtils.findShapes(s => s.type === "board", penpot.currentPage.root).length
};
```

## Detailed Recovery Procedures

### 1. Tab Suspended ("tab appears suspended", timeout, transport closed)
1. **Wake up the tab:** Click inside the Penpot browser tab. Wait 2 seconds.
2. **Re-probe:** Re-run the diagnostic snippet above.
3. **Prevent background freezing:**
   - **Chrome / Brave:** Navigate to `chrome://settings/performance`. Look for **"Memory Saver"** → **"Always keep these sites active"** → Add `design.penpot.app` (or your domain).
   - **Edge:** Navigate to `edge://settings/system`. Look for **"Never put these sites to sleep"** → Add `design.penpot.app`.
   - **Pin the tab:** Right-click the Penpot tab header → **Pin tab**. Pinned tabs have higher memory priority in modern browsers.

### 2. Plugin Disconnected ("No Penpot plugin instance is connected")
1. Open your Penpot design file.
2. In the top menu, click **File → MCP Server → Connect** (or click the floating MCP plugin dialog).
3. Confirm the status turns green ("Connected").
4. Re-run the diagnostic snippet.

### 3. Key Expired or Revoked (401 / 403 Unauthorized)
1. In Penpot, navigate to **Your account → Integrations → MCP Server**.
2. Click **Generate / Regenerate MCP Key**. (This invalidates any previous key immediately).
3. Copy the URL containing the new `userToken`.
4. Update `PENPOT_MCP_KEY` in your Kiro environment.
5. Re-run the diagnostic snippet.

### 4. Wrong Page Focused
1. Remote MCP commands always apply to the **currently focused page** in Penpot.
2. Compare the `page` name returned by the diagnostic snippet with your target.
3. If they differ, switch pages in Penpot before making edits.

## The MCP key (userToken)

- Personal, non-recoverable token that authenticates your client with the hosted
  MCP server. Only one key per user at a time. Shown **once** on creation.
- Embedded in the server URL as `?userToken=...`. This power keeps it out of
  source via the `PENPOT_MCP_KEY` placeholder in `mcp.json`.
- Treat it like a password: never commit it, screenshot it, or paste it in chat.
  Regenerate if it may have leaked (this disconnects clients using the old key).

## Remote vs local (why this power uses remote)

- **Remote/hosted** (this power): recommended for most users. Hosted by Penpot,
  no local install. **No local file-system access** — `import_image` from local
  paths is unavailable and `export_shape` cannot write to local paths. URL form:
  `https://<domain>/mcp/stream?userToken=YOUR_MCP_KEY` (SaaS domain:
  `design.penpot.app`).
- **Local** (`npx -y @penpot/mcp@latest`): advanced users needing local-resource
  access. Serves the plugin at `http://localhost:4400/manifest.json` and the MCP
  endpoint at `http://localhost:4401/mcp`. A future variant of this power could
  add a local mode.

## Sources

- Penpot MCP Help Center: https://help.penpot.app/mcp/
- Penpot official MCP server README: https://github.com/penpot/penpot/blob/main/mcp/README.md

Guidance derived from Penpot's MPL-2.0 docs and rewritten in original language;
see the [NOTICE](../../../NOTICE) file for attribution.
