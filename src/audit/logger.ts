import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Two things live here:
 *   1. `log`   — a tiny structured console logger with level filtering.
 *   2. `audit` — the append-only JSONL action trail (data/audit.jsonl) that
 *                proves exactly what the bot did. See docs/BUILD_SPEC.md §12.
 *
 * Kept dependency-free and synchronous: the audit trail must never be lost to a
 * dropped async write, and ordering must match execution order.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function currentLevel(): number {
  const env = (process.env["LOG_LEVEL"] ?? "info").toLowerCase() as Level;
  return LEVELS[env] ?? LEVELS.info;
}

function emit(level: Level, msg: string, meta?: unknown): void {
  if (LEVELS[level] < currentLevel()) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (meta !== undefined) out(line, typeof meta === "string" ? meta : JSON.stringify(meta));
  else out(line);
}

export const log = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta),
};

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export type AuditKind = "executed" | "staged" | "failed" | "rejected" | "approved";

export interface AuditEvent {
  ts: string;
  kind: AuditKind;
  tool: string;
  input: unknown;
  summary: string;
}

const AUDIT_PATH = "data/audit.jsonl";

const KIND_ICON: Record<AuditKind, string> = {
  executed: "✓",
  staged: "⏸",
  failed: "✗",
  rejected: "⊘",
  approved: "▶",
};

/** Append one event to the JSONL trail and mirror a readable line to console. */
export function audit(
  kind: AuditKind,
  tool: string,
  input: unknown,
  summary = "",
): AuditEvent {
  const event: AuditEvent = { ts: new Date().toISOString(), kind, tool, input, summary };

  ensureDir(AUDIT_PATH);
  appendFileSync(AUDIT_PATH, JSON.stringify(event) + "\n", "utf8");

  console.log(`${KIND_ICON[kind]} ${kind.padEnd(8)} ${tool}${summary ? ` — ${summary}` : ""}`);
  return event;
}

/** Tail the last `n` audit events (for the CLI `/audit` command). */
export function readRecentAudit(n = 20): AuditEvent[] {
  if (!existsSync(AUDIT_PATH)) return [];
  const lines = readFileSync(AUDIT_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines
    .slice(-n)
    .map((l) => {
      try {
        return JSON.parse(l) as AuditEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is AuditEvent => e !== null);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
