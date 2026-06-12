import { getConfig } from "../config/env.js";
import { GhlClient } from "../ghl/client.js";
import { MemoryStore } from "../memory/store.js";
import type { ToolContext } from "../tools/types.js";

/**
 * Builds the shared ToolContext (GHL client + memory + locationId) from
 * validated config. One place to assemble runtime dependencies so the CLI,
 * scheduler, and approval flows all share identical wiring.
 */
export function buildContext(): ToolContext {
  const cfg = getConfig();
  return {
    ghl: new GhlClient(cfg),
    memory: new MemoryStore(),
    locationId: cfg.GHL_LOCATION_ID,
  };
}
