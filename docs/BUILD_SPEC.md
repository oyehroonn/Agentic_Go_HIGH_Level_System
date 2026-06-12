# GHL ClaudeBot — Weekend MVP Build Spec (Single Source of Truth)

> This document is the **single source of truth** for the first build. Build exactly what's in
> Phase 1. Keep the structure clean so later phases slot in without refactoring.
>
> **Governance rule:** Any deviation from this spec must be approved by the project owner and
> recorded in [`DEVIATIONS.md`](../DEVIATIONS.md). Do not silently diverge.
>
> _This file reproduces the original hand-off spec. Obvious transmission/OCR corruptions in the
> source text were repaired during transcription; that repair is logged as deviation D-000. All
> substantive content is preserved verbatim._

---

## 0. Instructions for the building agent (read first)

You are building **GHL ClaudeBot** — an AI "control plane" that operates a GoHighLevel account
through reasoning and approved tools, not by clicking the UI.

Ground rules you must follow:

1. **Do not invent GHL API endpoints.** Before writing the GHL client, complete **Step 0
   (Section 6)** and verify every endpoint, header, and payload shape against the official docs.
   If an endpoint in this spec doesn't match the live docs, trust the docs and note the difference
   in `README.md`.
2. **Build in the order given in Section 17.** Get the smallest end-to-end loop working (one read
   tool → agent loop → audit log) before adding more tools.
3. **Every action goes through the router.** No tool handler is ever called directly by the agent
   loop. The router enforces the approval gate and writes the audit log. This is the whole point of
   the project — do not bypass it.
4. **Keep capabilities as isolated, self-describing modules.** Adding a new GHL capability later
   must mean adding one file in `src/tools/` and registering it — nothing else. If you find yourself
   editing the agent loop or router to add a tool, the abstraction is wrong; fix the abstraction.
5. **Fail loud, log everything.** Structured logs, typed errors, no silent catches.
6. **TypeScript strict mode on.** Validate all external input (env, tool args, API responses) with
   `zod`.

Success = the three demo flows in Section 16 run live against a real GHL sub-account and can be
screen-recorded.

---

## 1. What we're building

A command-driven AI operator for a single GoHighLevel location. The user (or a schedule) gives it a
goal in natural language. Claude plans the work, calls a set of approved GHL tools, executes the
safe steps autonomously, stages risky steps for one-click approval, and logs everything.

This is the **proof-of-architecture** version. It is deliberately single-tenant, file-persisted, and
CLI-driven so it can be built and demoed in a weekend, while using the exact structure the full
multi-tenant SaaS will grow into.

**Out of scope this weekend** (see Section 19): browser automation, Circle, ads, multi-tenant, web
dashboard, database. The code must leave clean seams for all of these.

---

## 2. Core principle — control plane, not a clicker bot

```
User / Scheduler
      │  natural-language goal
      ▼
┌──────────────────────────────────────────────┐
│  AGENT (Claude)                                │
│  reasons → plans → emits tool calls            │
└──────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────┐
│  ROUTER (approval gate + audit)                │
│  • LOW  → execute immediately                  │
│  • HIGH → stage as pending approval, do NOT run│
│  • always write audit log                      │
└──────────────────────────────────────────────┘
      │ low-risk only
      ▼
┌──────────────────────────────────────────────┐
│  TOOL HANDLER → GHL API v2 client              │
└──────────────────────────────────────────────┘
```

Claude never touches GHL directly. It only proposes tool calls. The router decides whether they run.
That separation is what makes the system safe, auditable, and extensible.

---

## 3. Tech stack

- **Language:** TypeScript (Node.js ≥ 20)
- **Reasoning model:** Claude via `@anthropic-ai/sdk`, using native tool-use.
  - Model string: `claude-sonnet-4-6` (see deviation D-001; spec originally said `claude-fable-5`,
    which is not a real model).
- **Persistence (MVP):** local JSON files under `data/` (swap for a DB later — see Section 20).

One language end-to-end. The GHL MCP ecosystem and the eventual web dashboard are both TS-friendly,
so this avoids a Python/Node split later.

---

## 4. Repository structure

```
ghl-claudebot/
├── README.md                  # setup, run, demo instructions
├── package.json
├── tsconfig.json              # strict: true
├── .env.example
├── .gitignore                 # ignores .env, data/, node_modules, dist
├── src/
│   ├── index.ts               # bootstrap: parses mode (cli | schedule) and starts it
│   ├── config/
│   │   └── env.ts             # load + zod-validate env, export typed config
│   ├── ghl/
│   │   ├── client.ts          # GHL API v2 HTTP client (auth, retries, rate-limit handling)
│   │   └── types.ts           # GHL domain types (Contact, Opportunity, Conversation, ...)
│   ├── tools/
│   │   ├── types.ts           # ToolDefinition (name, description, risk, schema, handler)
│   │   ├── registry.ts        # register() + getAnthropicTools() + getTool() + allTools()
│   │   ├── contacts.ts        # contact capabilities
│   │   ├── opportunities.ts   # pipeline / opportunity capabilities
│   │   ├── conversations.ts   # read messages, draft/send message
│   │   ├── calendar.ts        # availability, book appointment
│   │   ├── tasks-notes.ts     # tasks + notes
│   │   └── index.ts           # imports every tool file so they self-register
│   ├── agent/
│   │   ├── systemPrompt.ts    # operator persona + hard rules
│   │   ├── brain.ts           # Anthropic client wrapper
│   │   └── loop.ts            # the plan→act→observe tool-use loop
│   ├── router/
│   │   ├── riskPolicy.ts      # maps tool → risk + the approval threshold
│   │   └── actionRouter.ts    # the only thing allowed to invoke a handler
│   ├── approvals/
│   │   ├── store.ts           # pending-approvals persistence (data/approvals.json)
│   │   └── service.ts         # list / approve / reject
│   ├── audit/
│   │   └── logger.ts          # append-only structured log (data/audit.jsonl)
│   ├── memory/
│   │   └── store.ts           # per-location context (data/memory/<locationId>.json)
│   ├── scheduler/
│   │   └── morningRun.ts      # the autonomous daily job
│   └── interface/
│       └── cli.ts             # interactive chat for the demo
├── scripts/
│   └── check-ghl-api.ts       # Step-0 helper: pings endpoints, prints what works
├── data/                      # gitignored runtime state
└── tests/
    ├── router.test.ts         # approval gate enforced
    └── registry.test.ts       # tools register + schema validity
```

**Why this is extensible:** the agent loop and router are capability-agnostic. They only know "tools
have a name, a schema, a risk level, and a handler." New capability = new file in `src/tools/`. New
surface (browser, Circle, ads) = new client + new tool file, same router, same loop, same audit
trail.

---

## 5. Environment & secrets (`.env.example`)

```
# Anthropic
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-6

# GoHighLevel (Private Integration Token — Settings → Private Integrations)
GHL_API_KEY=
GHL_LOCATION_ID=
GHL_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2021-07-28

# Behavior
APPROVAL_THRESHOLD=high        # actions at this risk or above require approval
STALE_OPPORTUNITY_DAYS=14      # used by the morning run
LOG_LEVEL=info
```

Use a GHL **Private Integration Token (PIT)** with only the scopes you need (contacts,
opportunities, conversations, calendars). Never commit `.env`.

---

## 6. Step 0 — verify the GHL API surface (do before any GHL coding)

GHL's API changes; do not trust the endpoint shapes below blindly.

1. Open the official references and confirm current paths, headers, and payloads:
   - GHL API v2 docs (Stoplight): `https://highlevel.stoplight.io/`
   - Official API docs repo: `https://github.com/GoHighLevel/highlevel-api-docs`
   - Official MCP server tool list (the ~21 official tools) for comparison.
2. Confirm auth headers. Expected: `Authorization: Bearer <GHL_API_KEY>`, `Version:
   <GHL_API_VERSION>`, `Content-Type: application/json`, and `LocationId` where required.
3. Confirm rate limits and encode them in the client (back off on 429).
4. Implement `scripts/check-ghl-api.ts` to hit one read endpoint per capability (list contacts, list
   pipelines, search opportunities, search conversations, calendar free-slots) and print which
   succeed. Run it before building tools so you build only against endpoints that actually work for
   this token/plan.
5. Record confirmed endpoints in `README.md` under "Verified GHL endpoints."

**Expected endpoints (verify, then correct):** contacts `POST/GET/PUT /contacts/`, tags `POST
/contacts/{id}/tags`, opportunities `POST /opportunities/`, `GET /opportunities/search`, `PUT
/opportunities/{id}`, pipelines `GET /opportunities/pipelines`, conversations `GET
/conversations/search`, `GET /conversations/{id}/messages`, send `POST /conversations/messages`,
calendar `GET /calendars/{id}/free-slots`, appointments `POST /calendars/events`, tasks `POST
/contacts/{id}/tasks`, notes `POST /contacts/{id}/notes`.

---

## 7. The GHL client (`src/ghl/client.ts`)

A single class wrapping `fetch`:

- Constructor takes the validated config.
- Private `request(method, path, body?)` that injects auth headers, JSON-encodes, parses, and
  throws a typed `GhlApiError` on non-2xx (include status, path, GHL error body).
- Retry with exponential backoff on `429` and `5xx` (max 3 attempts).
- Typed methods per capability (`getContact`, `searchContacts`, `createContact`, `updateContact`,
  `addTags`, `searchOpportunities`, `createOpportunity`, `updateOpportunity`, `getPipelines`,
  `searchConversations`, `getMessages`, `sendMessage`, `getFreeSlots`, `createAppointment`,
  `createTask`, `createNote`).
- All inputs/outputs typed via `src/ghl/types.ts`; validate API responses with zod at the boundary.

The client only talks to GHL. It contains **no** risk logic — that lives in the router.

---

## 8. The tool registry — the heart of extensibility

`src/tools/types.ts`:

```ts
import { z } from "zod";

export type RiskLevel = "low" | "high"; // room to add "medium"/"blocked" later

export interface ToolContext {
  ghl: GhlClient;
  memory: MemoryStore;
  locationId: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;        // short human/agent-readable line for the audit log + transcript
  data?: unknown;
}

export interface ToolDefinition<I = unknown> {
  name: string;                       // e.g. "create_contact"
  description: string;                // shown to Claude; be precise about side effects
  risk: RiskLevel;                    // router uses this for the approval gate
  inputSchema: z.ZodType<I>;          // validates Claude's arguments
  handler: (input: I, ctx: ToolContext) => Promise<ToolResult>;
}
```

`src/tools/registry.ts`:

```ts
const tools = new Map<string, ToolDefinition>();

export function register(tool: ToolDefinition) {
  if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
  tools.set(tool.name, tool);
}

export function getTool(name: string) {
  return tools.get(name);
}

// Convert registered tools into Anthropic tool-use schema
export function getAnthropicTools() {
  return [...tools.values()].map(t => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.inputSchema), // use a zod→jsonschema helper
  }));
}

export function allTools() {
  return [...tools.values()];
}
```

Example tool (`src/tools/contacts.ts`):

```ts
register({
  name: "create_contact",
  description: "Create a new contact in GHL. Reversible/internal. Use for onboarding.",
  risk: "low",
  inputSchema: z.object({
    firstName: z.string(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  handler: async (input, ctx) => {
    const contact = await ctx.ghl.createContact({ ...input, locationId: ctx.locationId });
    return { ok: true, summary: `Created contact ${input.firstName} (${contact.id})`, data: contact };
  },
});

register({
  name: "send_message",
  description: "Send an SMS/email to a contact. SENDS TO A REAL PERSON — high risk, requires approval.",
  risk: "high",
  inputSchema: z.object({
    contactId: z.string(),
    channel: z.enum(["SMS", "Email"]),
    body: z.string(),
    subject: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const res = await ctx.ghl.sendMessage(input);
    return { ok: true, summary: `Sent ${input.channel} to ${input.contactId}`, data: res };
  },
});
```

`src/tools/index.ts` simply imports every tool file so the `register()` calls run on startup.

---

## 9. The agent loop (`src/agent/loop.ts`)

Standard Anthropic tool-use loop. Claude proposes tool calls; the **router** (not the loop) executes
or stages them.

```
function runAgent(goal, ctx):
    messages = [{ role: "user", content: goal }]
    loop (max N iterations):
        resp = anthropic.messages.create({
            model: env.CLAUDE_MODEL,
            system: SYSTEM_PROMPT,
            tools: getAnthropicTools(),
            messages,
        })
        append resp to messages
        if resp has no tool_use blocks:
            return resp.text            # final answer / report
        toolResults = []
        for each tool_use block:
            result = actionRouter.handle(block.name, block.input, ctx)
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.summary })
        append { role: "user", content: toolResults } to messages
```

Cap iterations (e.g. 15) to avoid runaway loops. The loop is fully generic — it has zero GHL
knowledge and zero risk logic.

`src/agent/systemPrompt.ts` defines the operator persona. It must state, at minimum:

- You are a GoHighLevel operator. Reason, plan, then call approved tools. Never click around; you
  only have the tools provided.
- Never assume a contact's intent or invent data. If a required field is missing, ask or skip —
  don't fabricate.
- High-risk actions (sending messages, anything involving money or deletion) will be staged for
  human approval; draft them fully and call the tool — the system handles the gate. Do not pretend
  they were sent.
- When finishing, produce a concise report: what you did, what was staged for approval, what failed.

---

## 10. Action router + approval gate (`src/router/`)

`riskPolicy.ts`: reads the tool's `risk` and compares to `APPROVAL_THRESHOLD`. Returns `"execute"`
or `"stage"`.

`actionRouter.ts` — **the only module permitted to call a tool handler:**

```
function handle(name, rawInput, ctx) -> ToolResult:
    tool = getTool(name)
    if !tool: audit("rejected", name, "unknown tool"); return { ok:false, summary:"Unknown tool" }
    input = tool.inputSchema.parse(rawInput)        # zod-validate Claude's args
    decision = riskPolicy(tool)
    if decision == "stage":
        id = approvals.create({ tool: name, input, createdAt })
        audit("staged", name, input)
        return { ok:true, summary:`Staged for approval (id=${id}). Not executed.` }
    result = await tool.handler(input, ctx)
    audit(result.ok ? "executed" : "failed", name, input, result.summary)
    return result
```

So: low-risk runs immediately; high-risk is captured as a pending approval and reported back to
Claude as "staged," which Claude then reflects in its final report. **Test this hard**
(`tests/router.test.ts`): a high-risk tool must never reach its handler without approval.

---

## 11. Approvals (`src/approvals/`)

- `store.ts`: CRUD over `data/approvals.json`. Each record: `{ id, tool, input, status:
  "pending"|"approved"|"rejected", createdAt, resolvedAt }`.
- `service.ts`: `list()`, `approve(id, ctx)` → loads the tool, runs its handler, audits, marks
  resolved; `reject(id)`.
- Expose these in the CLI (`/approvals`, `/approve <id>`, `/reject <id>`). This is the "one-click
  approval" in MVP form; later it becomes a dashboard button.

---

## 12. Audit log (`src/audit/logger.ts`)

Append-only JSONL at `data/audit.jsonl`. One line per event: `{ ts, kind:
"executed"|"staged"|"failed"|"rejected", tool, input, summary }`. Also mirror to console. This is
what proves to the client exactly what the bot did — make it clean and human-readable.

---

## 13. Memory (`src/memory/store.ts`)

Per-location JSON at `data/memory/<locationId>.json`: business context, active offers, known
pipeline names, and a short rolling list of recent actions. Tools read it via `ctx.memory` for
context; the morning run appends a daily summary. Keep the interface DB-swappable (just
`get(locationId)` / `set(locationId, data)`).

---

## 14. Interface — CLI (`src/interface/cli.ts`)

A readline chat for the demo:

- Type a goal → `runAgent(goal, ctx)` → print the transcript + final report.
- Commands: `/approvals`, `/approve <id>`, `/reject <id>`, `/audit` (tail recent), `/quit`.
- Print each tool decision inline (`✓ executed create_contact`, `⏸ staged send_message #3`) so a
  screen recording reads clearly.

---

## 15. Phase 1 tool list (build exactly these this weekend)

LOW risk (auto-execute):
- `search_contacts`, `get_contact`, `create_contact`, `update_contact`, `add_tags`
- `get_pipelines`, `search_opportunities`, `create_opportunity`, `move_opportunity_stage`
- `get_conversations`, `get_messages`
- `get_calendar_slots`
- `create_task`, `create_note`

HIGH risk (approval-gated):
- `send_message` (SMS/Email)
- `book_appointment`

That's enough for all three demo flows. Resist adding more until these are solid.

---

## 16. The three demo flows (success criteria)

**Flow A — Client onboarding.** Goal: _"Onboard Jane Doe, jane@acme.com, as a new coaching client."_
Expect: create_contact → add_tags(`new-client`,`coaching`) → create_opportunity in the right
pipeline/stage → create_task (onboarding checklist) → create_note (context) → draft `send_message`
welcome (staged). Final report lists all of it; the welcome message sits in `/approvals`.

**Flow B — Pipeline review.** Goal: _"Review my pipeline and follow up on stale deals."_ Expect:
get_pipelines → search_opportunities → identify opportunities with no activity older than
`STALE_OPPORTUNITY_DAYS` → draft a follow-up `send_message` per stale deal (all staged) → report a
summary. Then demo `/approve <id>` actually sending one.

**Flow C — Autonomous morning run.** `scheduler/morningRun.ts` runs Flow B on a cron, writes a dated
report to `data/reports/`, and leaves drafts in approvals. This is the "runs while you sleep" moment
— trigger it manually in the demo to show the same logic running unattended.

---

## 17. Build order (do not reorder)

1. Scaffold repo, `package.json`, `tsconfig` (strict), `.gitignore`, `.env.example`,
   `config/env.ts`.
2. **Step 0** (Section 6) + `scripts/check-ghl-api.ts`. Confirm endpoints.
3. `ghl/client.ts` + `ghl/types.ts` with just `searchContacts` working; smoke-test it.
4. `tools/types.ts` + `tools/registry.ts`. Implement **one** low-risk tool (`search_contacts`).
5. `audit/logger.ts`, `router/riskPolicy.ts`, `router/actionRouter.ts`.
6. `agent/brain.ts`, `agent/systemPrompt.ts`, `agent/loop.ts`. **Get the minimal loop working:
   "find the contact named X" → tool executes → report.** This is the milestone; everything after is
   additive.
7. Add remaining LOW-risk tools (Section 15).
8. `approvals/` + add the HIGH-risk tools. Verify staging works and the router test passes.
9. `interface/cli.ts` with approval commands.
10. `memory/store.ts`; wire context into onboarding + morning run.
11. `scheduler/morningRun.ts`.
12. Run Flows A, B, C end-to-end against a real sandbox location. Write `README.md` demo steps.

---

## 18. Definition of done (weekend)

- [ ] All Phase-1 tools registered and individually working against a real GHL location.
- [ ] Agent loop completes Flows A, B, C.
- [ ] Approval gate verified: no high-risk action executes without explicit approval (test passes).
- [ ] `data/audit.jsonl` shows a clean, readable trail of every run.
- [ ] CLI can list/approve/reject and the morning run produces a report file.
- [ ] `README.md` lets a stranger clone, set env, and reproduce the demo in <10 minutes.
- [ ] One screen recording of Flows A→B→C with an approval click.

---

## 19. Explicitly out of scope this weekend (and where each lands later)

| Deferred | Why | Where it slots in |
|---|---|---|
| Browser automation (funnel builder, UI-only settings) | Fragile, breaks on UI change; not needed for the demo | New `src/browser/` worker exposed as `risk:"high"` tools — same router |
| Multi-tenant / multiple locations | MVP is single-location | `memory` + config keyed by tenant; client instantiated per tenant |
| Web dashboard | CLI proves the loop | New `packages/web` calling the same router/approval services |
| Database | JSON files are fine for one user | Swap `store.ts` implementations; interfaces already abstract this |
| Circle community layer | Separate surface | New `src/circle/` client + tool file |
| Ads (Meta/Google) generation + spend | Compliance + cost | Tool file with `risk:"high"`; spend always approval-gated |
| Bulk SMS/Email | A2P 10DLC / TCPA / deliverability risk | Dedicated send pipeline with compliance checks + batch approval |

The MVP code must not make any of these harder. If a Phase-1 decision would block one of them, choose
the other decision.

---

## 20. Extension roadmap (keep it from getting messy)

The rule that keeps the repo clean: **new capability = new tool file; new surface = new client + tool
file; everything routes through the existing router, approval, and audit layers.** You should almost
never edit `agent/loop.ts` or `router/actionRouter.ts` again after the MVP.

Rough sequencing after the demo:
1. Harden + expand GHL tools (invoices, payments, social planner) via the community 500+-tool API
   surface — all as new tool files.
2. Swap JSON stores for a database (Postgres) behind the same interfaces; add multi-tenant keys.
3. Web dashboard (approvals, audit timeline, "what Claude did") over the same services.
4. Browser-automation worker for the API gaps, isolated, screenshot-verified, high-risk by default.
5. Circle integration + ads layer, both approval-gated.
6. Per-tenant memory enrichment and the daily report mechanic as a product feature.

---

_End of spec. Build Phase 1 only. Keep the seams clean._
