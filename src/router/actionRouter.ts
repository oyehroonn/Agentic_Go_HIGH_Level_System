import { getConfig } from "../config/env.js";
import { audit } from "../audit/logger.js";
import { approvalsStore } from "../approvals/store.js";
import { getTool } from "../tools/registry.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { decideRouting } from "./riskPolicy.js";

/**
 * The ONLY module permitted to invoke a tool handler. It enforces the approval
 * gate and writes the audit trail. The agent loop must route every tool call
 * through here — never call a handler directly. See docs/BUILD_SPEC.md §10.
 */
export const actionRouter = {
  async handle(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = getTool(name);
    if (!tool) {
      audit("rejected", name, rawInput, "unknown tool");
      return { ok: false, summary: `Unknown tool: ${name}` };
    }

    // Validate Claude's arguments before anything else can happen.
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      audit("failed", name, rawInput, `invalid input — ${detail}`);
      return { ok: false, summary: `Invalid input for ${name}: ${detail}` };
    }
    const input = parsed.data;

    const threshold = getConfig().APPROVAL_THRESHOLD;
    const decision = decideRouting(tool, threshold);

    if (decision === "stage") {
      const id = approvalsStore.create({ tool: name, input });
      audit("staged", name, input, `pending approval id=${id}`);
      return {
        ok: true,
        summary: `Staged for approval (id=${id}). NOT executed — awaiting human sign-off.`,
        data: { approvalId: id },
      };
    }

    // Low-risk path: execute immediately.
    try {
      const result = await tool.handler(input, ctx);
      audit(result.ok ? "executed" : "failed", name, input, result.summary);
      ctx.memory.recordAction(ctx.locationId, `${name}: ${result.summary}`);
      return result;
    } catch (err) {
      const summary = err instanceof Error ? err.message : String(err);
      audit("failed", name, input, summary);
      return { ok: false, summary: `${name} failed: ${summary}` };
    }
  },
};
