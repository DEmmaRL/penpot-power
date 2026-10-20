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

## Keeping the Penpot tab awake (per browser)

Because MCP runs inside the Penpot tab, you want the browser to avoid
suspending it during long sessions. Options vary by browser:

- **Chrome / Edge (Chromium):** look for a per-site "keep active / don't put to
  sleep" option in the performance settings and add your Penpot site; pinning
  the tab also reduces the chance it gets suspended.
- **Firefox:** there is no per-site control. Advanced users can disable
  low-memory tab unloading in `about:config`, at the cost of higher memory use.
- **Safari:** no comparable per-site control — simply keep the Penpot tab open
  and in the foreground while agents are running.

Exact menu paths change between browser versions; check your browser's current
performance/power settings.

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
- **Local** (`npx -y @penpot/mcp@stable`): advanced users needing local-resource
  access. Serves the plugin at `http://localhost:4400/manifest.json` and the MCP
  endpoint at `http://localhost:4401/mcp`. A future variant of this power could
  add a local mode.

## Sources

- Penpot MCP Help Center: https://help.penpot.app/mcp/
- Penpot official MCP server README: https://github.com/penpot/penpot/blob/main/mcp/README.md

Guidance derived from Penpot's MPL-2.0 docs and rewritten in original language;
see the [NOTICE](../../../NOTICE) file for attribution.
