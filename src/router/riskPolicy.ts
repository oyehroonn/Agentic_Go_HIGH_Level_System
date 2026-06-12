import type { RiskLevel, ToolDefinition } from "../tools/types.js";

/**
 * Maps a tool's risk to a routing decision by comparing it against the
 * configured approval threshold. Pure function — no I/O — so it's trivial to
 * test. See docs/BUILD_SPEC.md §10.
 */

export type RoutingDecision = "execute" | "stage";

// Ordered severity. Adding "medium"/"blocked" later slots in here only.
const RANK: Record<RiskLevel, number> = { low: 0, high: 1 };

/**
 * Returns "stage" if the tool's risk is at or above the approval threshold,
 * otherwise "execute".
 */
export function decideRouting(
  tool: Pick<ToolDefinition, "risk">,
  threshold: RiskLevel,
): RoutingDecision {
  return RANK[tool.risk] >= RANK[threshold] ? "stage" : "execute";
}
