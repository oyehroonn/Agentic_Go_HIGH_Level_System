import type Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config/env.js";
import { actionRouter } from "../router/actionRouter.js";
import { getAnthropicTools } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { getAnthropic, getModel } from "./brain.js";

/**
 * The plan→act→observe tool-use loop. It is capability-agnostic and risk-blind:
 * it asks Claude for the next step, hands every proposed tool call to the
 * actionRouter (which decides execute vs. stage), feeds results back, and
 * repeats until Claude stops requesting tools or the iteration cap is hit.
 * See docs/BUILD_SPEC.md §9.
 */

export interface AgentEvent {
  type: "thinking" | "tool_decision" | "iteration";
  text: string;
}

export interface AgentRunResult {
  report: string;
  iterations: number;
  stoppedReason: "completed" | "max_iterations";
}

export async function runAgent(
  goal: string,
  ctx: ToolContext,
  onEvent?: (e: AgentEvent) => void,
): Promise<AgentRunResult> {
  const cfg = getConfig();
  const anthropic = getAnthropic();
  const system = buildSystemPrompt(ctx.memory.get(ctx.locationId));
  const tools = getAnthropicTools() as Anthropic.Tool[];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: goal }];
  let finalText = "";

  for (let iteration = 1; iteration <= cfg.MAX_AGENT_ITERATIONS; iteration++) {
    onEvent?.({ type: "iteration", text: `Iteration ${iteration}` });

    const resp = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 4096,
      system,
      tools,
      messages,
    });

    // Surface any prose Claude emitted this turn.
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) onEvent?.({ type: "thinking", text });

    messages.push({ role: "assistant", content: resp.content });

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      // No more tool calls — this turn's text is the final report.
      finalText = text;
      return { report: finalText, iterations: iteration, stoppedReason: "completed" };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const result = await actionRouter.handle(block.name, block.input, ctx);
      onEvent?.({
        type: "tool_decision",
        text: `${result.ok ? "✓" : "✗"} ${block.name} — ${result.summary}`,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.summary,
        is_error: !result.ok,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    report:
      finalText ||
      `Stopped after ${cfg.MAX_AGENT_ITERATIONS} iterations without a final report.`,
    iterations: cfg.MAX_AGENT_ITERATIONS,
    stoppedReason: "max_iterations",
  };
}
