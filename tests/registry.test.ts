import { describe, expect, it } from "vitest";
import { allTools, getAnthropicTools, register } from "../src/tools/registry.js";
import "../src/tools/index.js"; // register the real Phase-1 tools

/**
 * The registry must hold all Phase-1 tools with valid, Anthropic-ready schemas
 * and reject duplicates. docs/BUILD_SPEC.md §8/§15.
 */

const EXPECTED_LOW = [
  "search_contacts",
  "get_contact",
  "create_contact",
  "update_contact",
  "add_tags",
  "get_pipelines",
  "search_opportunities",
  "create_opportunity",
  "move_opportunity_stage",
  "get_conversations",
  "get_messages",
  "get_calendar_slots",
  "create_task",
  "create_note",
];
const EXPECTED_HIGH = ["send_message", "book_appointment"];

describe("tool registry", () => {
  it("registers every Phase-1 tool", () => {
    const names = allTools().map((t) => t.name).sort();
    for (const n of [...EXPECTED_LOW, ...EXPECTED_HIGH]) {
      expect(names).toContain(n);
    }
  });

  it("marks send_message and book_appointment as high risk", () => {
    const byName = new Map(allTools().map((t) => [t.name, t]));
    for (const n of EXPECTED_HIGH) expect(byName.get(n)?.risk).toBe("high");
    for (const n of EXPECTED_LOW) expect(byName.get(n)?.risk).toBe("low");
  });

  it("produces valid Anthropic tool schemas", () => {
    for (const t of getAnthropicTools()) {
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.input_schema).toBeTypeOf("object");
      expect((t.input_schema as { type?: string }).type).toBe("object");
    }
  });

  it("rejects duplicate registration", () => {
    const dup = allTools()[0]!;
    expect(() => register({ ...dup })).toThrow(/duplicate/i);
  });
});
