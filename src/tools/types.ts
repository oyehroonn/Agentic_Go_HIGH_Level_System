import type { z } from "zod";
import type { GhlClient } from "../ghl/client.js";
import type { MemoryStore } from "../memory/store.js";

/**
 * The tool contract — the heart of extensibility. The agent loop and router are
 * capability-agnostic: they only know that a tool has a name, a description, a
 * risk level, an input schema, and a handler. Adding a GHL capability = adding
 * one file in src/tools/ that calls register(). See docs/BUILD_SPEC.md §8.
 */

// Room to add "medium" / "blocked" later without touching the loop or router.
export type RiskLevel = "low" | "high";

export interface ToolContext {
  ghl: GhlClient;
  memory: MemoryStore;
  locationId: string;
}

export interface ToolResult {
  ok: boolean;
  /** Short human/agent-readable line for the audit log + transcript. */
  summary: string;
  data?: unknown;
}

export interface ToolDefinition<I = any> {
  /** e.g. "create_contact" */
  name: string;
  /** Shown to Claude; be precise about side effects. */
  description: string;
  /** Router uses this for the approval gate. */
  risk: RiskLevel;
  /** Validates Claude's arguments before the handler ever runs. */
  inputSchema: z.ZodType<I>;
  handler: (input: I, ctx: ToolContext) => Promise<ToolResult>;
}
