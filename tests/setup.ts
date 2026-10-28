/**
 * Provides a valid env so getConfig() succeeds without a real .env. These are
 * dummy values — tests never make real network calls. Set before any module
 * reads process.env.
 */
process.env["ANTHROPIC_API_KEY"] ??= "test-anthropic-key";
process.env["CLAUDE_MODEL"] ??= "claude-sonnet-4-6";
process.env["GHL_API_KEY"] ??= "test-ghl-key";
process.env["GHL_LOCATION_ID"] ??= "test-location";
process.env["APPROVAL_THRESHOLD"] ??= "high";
process.env["LOG_LEVEL"] ??= "error";
