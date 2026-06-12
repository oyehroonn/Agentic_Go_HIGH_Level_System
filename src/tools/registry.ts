import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "./types.js";

/**
 * Global tool registry. Tool files call register() at import time; nothing else
 * mutates this map. The agent loop reads getAnthropicTools(); the router reads
 * getTool(). See docs/BUILD_SPEC.md §8.
 */
const tools = new Map<string, ToolDefinition>();

export function register(tool: ToolDefinition): void {
  if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
  tools.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function allTools(): ToolDefinition[] {
  return [...tools.values()];
}

/** Anthropic tool-use schema array, derived from each tool's zod input schema. */
export function getAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return [...tools.values()].map((t) => {
    const schema = zodToJsonSchema(t.inputSchema, { target: "jsonSchema7" }) as Record<
      string,
      unknown
    >;
    // Anthropic expects a top-level object schema; strip the $schema/$ref noise.
    delete schema["$schema"];
    return {
      name: t.name,
      description: t.description,
      input_schema: schema,
    };
  });
}
