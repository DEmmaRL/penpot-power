# Power vs. direct MCP: evaluation protocol

This compares two setups on the same Penpot tasks:

- **Arm A, direct MCP:** Kiro configured with only the Penpot MCP server. No power, no skills, no steering from this repo.
- **Arm B, power:** the penpot-power installed, with the same MCP server.
- **Arm C, local MCP (optional, separate comparison):** Kiro configured with the local Penpot MCP server (`npx -y @penpot/mcp@latest`, endpoint `http://localhost:4401/mcp`), no power. This is the only setup where `import_image` exists, so it is the only arm that can handle large local images without a public URL.

Arms A and B differ only in the power. Arm C differs in the MCP server too, so compare it against A and B separately, not pooled with them.

### Arm C setup

1. Start the servers: `npx -y @penpot/mcp@latest`. Keep the terminal open.
2. In Penpot, load the plugin from `http://localhost:4400/manifest.json`, open it, and click **Connect to MCP server**. Keep the plugin open and the tab active.
3. Browser: approve the local network access prompt. Brave needs its Shield off for Penpot.
4. Add the server to Kiro's MCP config as `"type": "streamable-http"` with `url` `http://localhost:4401/mcp`. Do not install the power.
5. Confirm `import_image` appears in the tool list. If it does not, the server is running in remote mode: check that `PENPOT_MCP_REMOTE_MODE` is not `true`.

Arm C runs the same tasks T01–T13 with the same prompts. Add a large-image task only as a separate, documented addition, because the fixture must be a real file you control.

## Files

- `tasks.json`: 13 tasks. Each has a prompt and a verifier. Tasks T12 and T13 are controls not covered by any skill.
- `schedule.mjs`: generates a seeded, reproducible run order.
- `fixtures/`: `icon.svg` for T07 and `dot.png` (8×8, under 100 bytes) for T08.
- `out/`: generated artifacts from runs. Git-ignored.

## Setup (once)

1. Create the test file in Penpot. Add the required shapes from `tasks.json` → `fixtures.requiredShapes`: `EVAL_FIX_Board` (400×300, white, with three `#FF0000` rectangles) and `EVAL_T12_old`. Add a few other top-level boards so that T01 and T06 are meaningful.
2. Host a public PNG under 1 MB, and put its HTTPS URL in place of `<PUBLIC_PNG_URL>` in `tasks.json`. T09 needs it.
3. Save the file as the untouched original. Never run tasks on it.
4. Record the Kiro version, the model, and the Penpot MCP endpoint in your run log.

## Per run

1. Duplicate the original file and open the duplicate. Confirm it is connected: File → MCP Server → Connect.
2. Open a new Kiro chat for that run. Do not reuse chats.
3. Arm A: make sure the power is not installed and no steering from this repo is loaded. Arm B: install the power and confirm its tools are listed.
4. Paste the task prompt exactly as written. Do not add hints.
5. When the agent says it is done, run the task's verifier against the duplicate file. Record `pass` and `detail`.
6. Log the run: `order, rep, task, arm, pass, execute_code_calls, execute_code_errors, seconds, human_intervention (yes/no)`.
7. Delete the duplicate file.

If the MCP connection drops during a run, log it and repeat that run later. Do not count it as a failure.

## Verifiers

- `type: penpot` verifiers run in the Penpot plugin context. Run them with `execute_code` on the duplicate file. They rely on `penpotUtils` helpers. That namespace is not in the public Plugin API docs, so check it works before the first real run.
- `type: shell` verifiers run from the repo root against the files in `evals/out/`.

Verifiers do not judge answers, so the grader does not need to know the arm.

## Analysis

- Success rate per arm, per category, and for the controls. Report each separately.
- Use Wilson 95% intervals. With 5 runs per task, a single task's difference is not conclusive. Look at the pooled result per category.
- Report every run, including failures and dropped connections.

## Known biases

- **Task bias.** The author has already read the skills, so the tasks may match them. Only T12 and T13 are free of this, and two tasks are not enough to rule it out.
- **Model variance.** Runs are not deterministic. That is why 5 repetitions are required.
- **Connection instability.** A suspended Penpot tab can affect one arm more if it happens more often in that arm. Log it and rerun it.
