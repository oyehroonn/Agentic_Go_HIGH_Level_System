import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config/env.js";

/**
 * Thin wrapper around the Anthropic client so the loop doesn't construct SDK
 * objects directly. One shared client; model + key come from validated config.
 */

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return client;
}

export function getModel(): string {
  return getConfig().CLAUDE_MODEL;
}
