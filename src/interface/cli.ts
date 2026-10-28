import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgent } from "../agent/loop.js";
import { approvalsService } from "../approvals/service.js";
import { readRecentAudit } from "../audit/logger.js";
import { buildContext } from "../runtime/context.js";
import "../tools/index.js"; // register all tools

/**
 * Interactive chat for the demo. Type a natural-language goal to run the agent;
 * use slash commands to manage approvals and inspect the audit trail. See §14.
 */

const HELP = `
Commands:
  <goal text>          Run the agent toward a natural-language goal
  /approvals           List pending approvals
  /approve <id>        Approve & execute a staged action
  /reject <id>         Reject a staged action
  /audit [n]           Show the last n audit events (default 20)
  /help                Show this help
  /quit                Exit
`;

export async function startCli(): Promise<void> {
  const ctx = buildContext();
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("GHL ClaudeBot — interactive CLI. Type /help for commands.\n");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = (await rl.question("\n› ")).trim();
    if (!line) continue;

    if (line === "/quit" || line === "/exit") break;
    if (line === "/help") {
      console.log(HELP);
      continue;
    }

    if (line === "/approvals") {
      const pending = approvalsService.listPending();
      if (pending.length === 0) console.log("No pending approvals.");
      for (const a of pending) {
        console.log(`  [${a.id}] ${a.tool}  ${JSON.stringify(a.input)}  (staged ${a.createdAt})`);
      }
      continue;
    }

    if (line.startsWith("/approve ")) {
      const id = line.slice("/approve ".length).trim();
      const res = await approvalsService.approve(id, ctx);
      console.log(res.ok ? `✓ ${res.summary}` : `✗ ${res.summary}`);
      continue;
    }

    if (line.startsWith("/reject ")) {
      const id = line.slice("/reject ".length).trim();
      const res = approvalsService.reject(id);
      console.log(res.ok ? `✓ ${res.summary}` : `✗ ${res.summary}`);
      continue;
    }

    if (line === "/audit" || line.startsWith("/audit ")) {
      const n = Number(line.split(/\s+/)[1]) || 20;
      const events = readRecentAudit(n);
      if (events.length === 0) console.log("Audit trail is empty.");
      for (const e of events) {
        console.log(`  ${e.ts}  ${e.kind.padEnd(8)} ${e.tool} — ${e.summary}`);
      }
      continue;
    }

    if (line.startsWith("/")) {
      console.log(`Unknown command. ${HELP}`);
      continue;
    }

    // Treat anything else as a goal for the agent.
    console.log("\n── Running agent ─────────────────────────────");
    try {
      const result = await runAgent(line, ctx, (e) => {
        if (e.type === "thinking") console.log(`\n💭 ${e.text}`);
        else if (e.type === "tool_decision") console.log(`   ${e.text}`);
      });
      console.log("\n── Final report ──────────────────────────────");
      console.log(result.report);
      console.log(
        `\n(${result.iterations} iteration(s), ${result.stoppedReason}. Use /approvals to review staged actions.)`,
      );
    } catch (err) {
      console.error("Agent run failed:", err instanceof Error ? err.message : err);
    }
  }

  rl.close();
  console.log("Bye.");
}
