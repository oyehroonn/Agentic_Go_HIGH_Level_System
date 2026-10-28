import { getConfig } from "./config/env.js";
import { log } from "./audit/logger.js";

/**
 * Bootstrap. Parses the run mode and starts it:
 *   cli       — interactive chat (default)
 *   schedule  — run the autonomous morning job once
 */
async function main(): Promise<void> {
  // Validate config early and fail loud if the environment is misconfigured.
  getConfig();

  const mode = process.argv[2] ?? "cli";

  switch (mode) {
    case "cli": {
      const { startCli } = await import("./interface/cli.js");
      await startCli();
      break;
    }
    case "schedule": {
      const { runMorning } = await import("./scheduler/morningRun.js");
      await runMorning();
      break;
    }
    default:
      log.error(`Unknown mode "${mode}". Use: cli | schedule`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error("Fatal", err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
