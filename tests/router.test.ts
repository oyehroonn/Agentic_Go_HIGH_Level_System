import { existsSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { register } from "../src/tools/registry.js";
import { actionRouter } from "../src/router/actionRouter.js";
import { approvalsService } from "../src/approvals/service.js";
import { MemoryStore } from "../src/memory/store.js";
import type { ToolContext } from "../src/tools/types.js";

/**
 * The core safety guarantee: a high-risk tool must NEVER reach its handler
 * without explicit human approval. docs/BUILD_SPEC.md §10/§18.
 */

function freshCtx(): ToolContext {
  return {
    ghl: {} as ToolContext["ghl"], // handlers under test don't touch GHL
    memory: new MemoryStore(),
    locationId: "test-location",
  };
}

// Track whether each handler actually executed.
const flags = { high: false, low: false };

register({
  name: "test_high_risk",
  description: "A high-risk test tool that must be gated.",
  risk: "high",
  inputSchema: z.object({ value: z.string() }),
  handler: async (input: { value: string }) => {
    flags.high = true;
    return { ok: true, summary: `executed with ${input.value}` };
  },
});

register({
  name: "test_low_risk",
  description: "A low-risk test tool that runs immediately.",
  risk: "low",
  inputSchema: z.object({ value: z.string() }),
  handler: async (input: { value: string }) => {
    flags.low = true;
    return { ok: true, summary: `executed with ${input.value}` };
  },
});

beforeEach(() => {
  flags.high = false;
  flags.low = false;
  // Start each test from a clean approvals file.
  if (existsSync("data/approvals.json")) rmSync("data/approvals.json");
});

afterEach(() => {
  if (existsSync("data/approvals.json")) rmSync("data/approvals.json");
});

describe("approval gate", () => {
  it("stages a high-risk tool instead of executing it", async () => {
    const res = await actionRouter.handle("test_high_risk", { value: "x" }, freshCtx());

    expect(flags.high).toBe(false); // handler must NOT have run
    expect(res.ok).toBe(true);
    expect(res.summary.toLowerCase()).toContain("staged");

    const pending = approvalsService.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.tool).toBe("test_high_risk");
  });

  it("executes a low-risk tool immediately", async () => {
    const res = await actionRouter.handle("test_low_risk", { value: "y" }, freshCtx());

    expect(flags.low).toBe(true);
    expect(res.ok).toBe(true);
    expect(approvalsService.listPending()).toHaveLength(0);
  });

  it("runs the handler only after explicit approval", async () => {
    const staged = await actionRouter.handle("test_high_risk", { value: "z" }, freshCtx());
    const approvalId = (staged.data as { approvalId: string }).approvalId;
    expect(flags.high).toBe(false);

    const approved = await approvalsService.approve(approvalId, freshCtx());
    expect(flags.high).toBe(true); // NOW it runs
    expect(approved.ok).toBe(true);

    // It is consumed: a second approval is a no-op.
    const again = await approvalsService.approve(approvalId, freshCtx());
    expect(again.ok).toBe(false);
  });

  it("rejects unknown tools without executing anything", async () => {
    const res = await actionRouter.handle("does_not_exist", {}, freshCtx());
    expect(res.ok).toBe(false);
    expect(res.summary.toLowerCase()).toContain("unknown tool");
  });

  it("rejects invalid input before reaching the handler", async () => {
    const res = await actionRouter.handle("test_low_risk", { value: 123 }, freshCtx());
    expect(flags.low).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.summary.toLowerCase()).toContain("invalid input");
  });
});
