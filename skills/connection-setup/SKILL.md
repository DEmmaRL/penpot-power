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
  than writing to disk. **However, you CAN still send local workspace images and
  SVGs to Penpot in remote mode** by calling `penpotUtils.importImage`,
  `penpot.uploadMediaUrl`, or `penpot.createShapeFromSvg` inside `execute_code`
  — see the `asset-and-token-sync` skill!

## Step 0: Check if tools already work

Try a lightweight read-only tool call first (e.g. `high_level_overview` or
`penpot_api_info`). If it succeeds, you are connected — skip to the user's task.
If it fails or reports no connected plugin, continue below.

## Step 1: Enable MCP and get the key (user does this in Penpot)

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

## Step 4: Validate end to end (read-only first)

Run one read-only call and report back, to prove the chain
(agent → hosted MCP server → in-file plugin → focused page) works before any
mutation. Good first prompts:

- "List pages in this file."
- "Give a high-level overview of the current page."
- "List the color styles and how they are used."

## Available remote tools

The remote MCP server exposes four tools (`import_image` is local-mode only and not registered in remote mode):

| Tool | Notes |
| --- | --- |
| `execute_code` | Run JS in the Penpot plugin context (`penpot`, `penpotUtils`, `storage` globals) |
| `high_level_overview` | Fast overview and API usage guide for Penpot tools |
| `penpot_api_info` | Retrieve Plugin API docs for types and members |
| `export_shape` | Export a shape (`shapeId`, `"selection"`, or `"page"`) as PNG/SVG (returned inline; no local-path export) |

Kiro namespaces these when the power is installed (e.g. `power-penpot-penpot-...`).

## Troubleshooting

See [references/troubleshooting.md](references/troubleshooting.md). Most common:

- **Tool calls fail fast / "tab suspended"** → the Penpot tab was frozen or
  unloaded by the browser. Focus the tab, wait for reconnect, retry. In Chrome:
  *Settings → Performance → Always keep these sites active* (or pin the tab).
- **Expired key** → regenerate it in Integrations; update the power's
  `PENPOT_MCP_KEY`. Regenerating revokes the old key immediately.
- **Agent acts on the wrong page** → MCP follows the focused page/active tab;
  make sure the intended file is focused and owns MCP.

## Guardrails

- Treat the MCP key like a password. Never echo it in chat, logs, or exports.
  If it may have leaked, tell the user to regenerate it in Integrations.
- Connected MCP can perform **write** operations on the focused page. Start
  read-only, describe intended changes before applying, and prefer small
  reversible steps.
- Prefer a vision-language model — image understanding is required for many
  design tasks.

---

*Connection guidance derived from the [Penpot MCP Help Center](https://help.penpot.app/mcp/) and [penpot/penpot MCP README](https://github.com/penpot/penpot/blob/main/mcp/README.md) (MPL-2.0), rewritten in original language. See the [NOTICE](../../NOTICE) file.*
