import { audit } from "../audit/logger.js";
import { getTool } from "../tools/registry.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { approvalsStore, type Approval } from "./store.js";

/**
 * Human-in-the-loop service over the approvals store. `approve` is the only path
 * by which a high-risk, staged action ever reaches its handler. See §11.
 */
export const approvalsService = {
  list(): Approval[] {
    return approvalsStore.list();
  },

  listPending(): Approval[] {
    return approvalsStore.list({ status: "pending" });
  },

  /** Approve a staged action: re-validate, run its handler, audit, resolve. */
  async approve(id: string, ctx: ToolContext): Promise<ToolResult> {
    const record = approvalsStore.get(id);
    if (!record) return { ok: false, summary: `No approval with id=${id}` };
    if (record.status !== "pending") {
      return { ok: false, summary: `Approval ${id} already ${record.status}` };
    }

    const tool = getTool(record.tool);
    if (!tool) {
      approvalsStore.setStatus(id, "rejected");
      audit("rejected", record.tool, record.input, `unknown tool on approval ${id}`);
      return { ok: false, summary: `Unknown tool ${record.tool}; approval voided.` };
    }

    const parsed = tool.inputSchema.safeParse(record.input);
    if (!parsed.success) {
      audit("failed", record.tool, record.input, `invalid stored input on approval ${id}`);
      return { ok: false, summary: `Stored input for approval ${id} is invalid.` };
    }

    audit("approved", record.tool, parsed.data, `human approved id=${id}`);
    try {
      const result = await tool.handler(parsed.data, ctx);
      audit(result.ok ? "executed" : "failed", record.tool, parsed.data, result.summary);
      ctx.memory.recordAction(ctx.locationId, `${record.tool} (approved): ${result.summary}`);
      approvalsStore.setStatus(id, "approved");
      return result;
    } catch (err) {
      const summary = err instanceof Error ? err.message : String(err);
      audit("failed", record.tool, parsed.data, summary);
      // Leave as pending so it can be retried after the cause is fixed.
      return { ok: false, summary: `Approval ${id} execution failed: ${summary}` };
    }
  },

  reject(id: string): ToolResult {
    const record = approvalsStore.get(id);
    if (!record) return { ok: false, summary: `No approval with id=${id}` };
    if (record.status !== "pending") {
      return { ok: false, summary: `Approval ${id} already ${record.status}` };
    }
    approvalsStore.setStatus(id, "rejected");
    audit("rejected", record.tool, record.input, `human rejected id=${id}`);
    return { ok: true, summary: `Rejected approval ${id}.` };
  },
};
