import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Loads and validates all environment configuration up front so the rest of the
 * app can rely on a typed, present config. Fails loud (process exit) if anything
 * required is missing or malformed — no silent defaults for secrets.
 */
const RiskThreshold = z.enum(["low", "high"]);

const EnvSchema = z.object({
  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  CLAUDE_MODEL: z.string().min(1).default("claude-sonnet-4-6"),

  // GoHighLevel
  GHL_API_KEY: z.string().min(1, "GHL_API_KEY is required"),
  GHL_LOCATION_ID: z.string().min(1, "GHL_LOCATION_ID is required"),
  GHL_BASE_URL: z.string().url().default("https://services.leadconnectorhq.com"),
  GHL_API_VERSION: z.string().min(1).default("2021-07-28"),

  // Behavior
  APPROVAL_THRESHOLD: RiskThreshold.default("high"),
  STALE_OPPORTUNITY_DAYS: z.coerce.number().int().positive().default(14),
  MAX_AGENT_ITERATIONS: z.coerce.number().int().positive().default(15),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

/**
 * Returns the validated config. Throws a readable aggregated error on first use
 * if validation fails. Memoized so dotenv + zod only run once.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration. Fix your .env (copy .env.example):\n${issues}`,
    );
  }

  cached = parsed.data;
  return cached;
}
