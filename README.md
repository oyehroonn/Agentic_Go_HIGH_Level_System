# GHL ClaudeBot

An AI **control plane** that operates a single GoHighLevel (GHL) location through reasoning and
**approved tools** — not by clicking the UI. You give it a natural-language goal; Claude plans the
work, runs safe steps autonomously, **stages risky steps for one-click human approval**, and logs
everything to an append-only audit trail.

> **Single source of truth:** [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md). Any departure from it is
> recorded in [`DEVIATIONS.md`](DEVIATIONS.md).

## Architecture (control plane, not a clicker bot)

```
You / Scheduler ──goal──▶ AGENT (Claude, tool-use loop)
                              │ proposes tool calls
                              ▼
                       ROUTER (approval gate + audit)
                        • low  → execute now
                        • high → STAGE for approval
                              ▼ low-risk only
                       TOOL HANDLER → GHL API v2 client
```

Claude never calls a tool handler directly. Every action flows through `actionRouter`, which enforces
the risk policy and writes `data/audit.jsonl`. Adding a capability = adding **one file** in
`src/tools/` — the loop and router never change.

## Requirements

- Node.js ≥ 20 (developed on Node 25)
- An Anthropic API key
- A GHL **Private Integration Token (PIT)** with scopes: contacts, opportunities, conversations,
  calendars — and your Location ID.

## Setup (<10 minutes)

```bash
npm install
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, GHL_API_KEY (PIT), GHL_LOCATION_ID
```

`.env` keys:

| Key | What |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic key |
| `CLAUDE_MODEL` | Defaults to `claude-sonnet-4-6` |
| `GHL_API_KEY` | GHL Private Integration Token |
| `GHL_LOCATION_ID` | The sub-account/location id |
| `APPROVAL_THRESHOLD` | `high` (default) — risk at/above this is approval-gated |
| `STALE_OPPORTUNITY_DAYS` | Used by the morning run (default 14) |
| `MAX_AGENT_ITERATIONS` | Loop safety cap (default 15) |

## Step 0 — verify the GHL API surface (do this first)

GHL's API drifts. Before trusting any endpoint, confirm what works for **your** token/plan:

```bash
npm run check-ghl
```

It pings one read endpoint per capability (contacts, pipelines, opportunities, conversations,
calendars) and prints which succeed. Record the results below.

## Run

```bash
npm run cli         # interactive chat (the demo)
npm run schedule    # run the autonomous morning job once (Flow C)
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest — approval gate + registry guarantees
```

### CLI commands

| Command | Action |
|---|---|
| `<goal text>` | Run the agent toward a goal |
| `/approvals` | List pending (staged) actions |
| `/approve <id>` | Approve & execute a staged action |
| `/reject <id>` | Reject a staged action |
| `/audit [n]` | Show the last n audit events |
| `/help`, `/quit` | — |

## Demo flows

- **A — Onboarding:** `Onboard Jane Doe, jane@acme.com, as a new coaching client.`
  → creates contact, tags, an opportunity, a task, a note, and **stages** a welcome message.
- **B — Pipeline review:** `Review my pipeline and follow up on stale deals.`
  → reads pipelines + opportunities, drafts follow-ups for stale deals (all **staged**). Then
  `/approve <id>` to actually send one.
- **C — Autonomous morning run:** `npm run schedule` → runs Flow B unattended, writes
  `data/reports/<date>.md`, leaves drafts in `/approvals`.

## Phase-1 tools

**Low risk (auto-execute):** `search_contacts`, `get_contact`, `create_contact`, `update_contact`,
`add_tags`, `get_pipelines`, `search_opportunities`, `create_opportunity`, `move_opportunity_stage`,
`get_conversations`, `get_messages`, `get_calendar_slots`, `create_task`, `create_note`.

**High risk (approval-gated):** `send_message`, `book_appointment`.

## Project layout

```
src/
  config/env.ts         zod-validated env
  ghl/                  client.ts (auth/retry/typed) + types.ts (zod boundaries)
  tools/                one file per capability; index.ts self-registers them
  agent/                brain.ts, systemPrompt.ts, loop.ts (generic tool-use loop)
  router/               riskPolicy.ts + actionRouter.ts (only caller of handlers)
  approvals/            store.ts + service.ts (stage / approve / reject)
  audit/logger.ts       data/audit.jsonl append-only trail + console logger
  memory/store.ts       per-location JSON context
  scheduler/morningRun  the autonomous daily job
  interface/cli.ts      interactive demo chat
scripts/check-ghl-api   Step-0 endpoint verification
tests/                  router (approval gate) + registry guarantees
```

## Verified GHL endpoints

> Fill this in after running `npm run check-ghl` against your token. The client currently targets the
> documented v2 shapes; correct any path/payload differences here and in `src/ghl/client.ts`.

| Capability | Endpoint (expected) | Verified? |
|---|---|---|
| Contacts list/search | `GET /contacts/` | ⬜ |
| Contact CRUD | `GET/POST/PUT /contacts/{id}` | ⬜ |
| Tags | `POST /contacts/{id}/tags` | ⬜ |
| Pipelines | `GET /opportunities/pipelines` | ⬜ |
| Opportunities | `GET /opportunities/search`, `POST /opportunities/`, `PUT /opportunities/{id}` | ⬜ |
| Conversations | `GET /conversations/search`, `GET /conversations/{id}/messages` | ⬜ |
| Send message | `POST /conversations/messages` | ⬜ |
| Calendar slots | `GET /calendars/{id}/free-slots` | ⬜ |
| Appointment | `POST /calendars/events/appointments` | ⬜ |
| Tasks | `POST /contacts/{id}/tasks` | ⬜ |
| Notes | `POST /contacts/{id}/notes` | ⬜ |

## Safety guarantee

`tests/router.test.ts` proves a high-risk tool can never reach its handler without explicit approval.
That invariant is the whole point — keep it green.
