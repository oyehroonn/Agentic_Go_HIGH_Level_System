import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * Pending-approvals persistence over data/approvals.json. The CRUD interface is
 * DB-swappable; in MVP it's a single JSON document. See docs/BUILD_SPEC.md §11.
 */

export const ApprovalStatus = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalSchema = z.object({
  id: z.string(),
  tool: z.string(),
  input: z.unknown(),
  status: ApprovalStatus,
  createdAt: z.string(),
  resolvedAt: z.string().nullable().default(null),
});
export type Approval = z.infer<typeof ApprovalSchema>;

const FILE = "data/approvals.json";

function readAll(): Approval[] {
  if (!existsSync(FILE)) return [];
  const raw = JSON.parse(readFileSync(FILE, "utf8"));
  return z.array(ApprovalSchema).parse(raw);
}

function writeAll(records: Approval[]): void {
  const dir = dirname(FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FILE, JSON.stringify(records, null, 2), "utf8");
}

export const approvalsStore = {
  /** Stage a new pending approval and return its short id. */
  create(input: { tool: string; input: unknown }): string {
    const records = readAll();
    const record: Approval = {
      id: randomUUID().slice(0, 8),
      tool: input.tool,
      input: input.input,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    records.push(record);
    writeAll(records);
    return record.id;
  },

  list(filter?: { status?: ApprovalStatus }): Approval[] {
    const records = readAll();
    return filter?.status ? records.filter((r) => r.status === filter.status) : records;
  },

  get(id: string): Approval | undefined {
    return readAll().find((r) => r.id === id);
  },

  setStatus(id: string, status: ApprovalStatus): Approval | undefined {
    const records = readAll();
    const record = records.find((r) => r.id === id);
    if (!record) return undefined;
    record.status = status;
    record.resolvedAt = new Date().toISOString();
    writeAll(records);
    return record;
  },
};
