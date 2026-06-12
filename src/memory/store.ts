import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

/**
 * Per-location context store. JSON-backed for the MVP; the public interface
 * (`get` / `set` / mutators) is deliberately DB-swappable — later this becomes a
 * Postgres-backed, multi-tenant store with the same surface. See §13 / §20.
 */

export const RecentActionSchema = z.object({
  ts: z.string(),
  summary: z.string(),
});

export const MemorySchema = z.object({
  locationId: z.string(),
  businessContext: z.string().default(""),
  activeOffers: z.array(z.string()).default([]),
  knownPipelines: z.array(z.string()).default([]),
  recentActions: z.array(RecentActionSchema).default([]),
});
export type LocationMemory = z.infer<typeof MemorySchema>;

const DIR = "data/memory";
const MAX_RECENT = 25;

function pathFor(locationId: string): string {
  // Guard against path traversal from an unexpected locationId value.
  const safe = locationId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${DIR}/${safe}.json`;
}

export class MemoryStore {
  /** Load memory for a location, creating an empty record if none exists. */
  get(locationId: string): LocationMemory {
    const file = pathFor(locationId);
    if (!existsSync(file)) {
      return MemorySchema.parse({ locationId });
    }
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return MemorySchema.parse(raw);
  }

  /** Persist a full memory record. */
  set(locationId: string, data: LocationMemory): void {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    writeFileSync(pathFor(locationId), JSON.stringify(data, null, 2), "utf8");
  }

  /** Append a short summary to the rolling recent-actions list (capped). */
  recordAction(locationId: string, summary: string): void {
    const mem = this.get(locationId);
    mem.recentActions.push({ ts: new Date().toISOString(), summary });
    mem.recentActions = mem.recentActions.slice(-MAX_RECENT);
    this.set(locationId, mem);
  }
}
