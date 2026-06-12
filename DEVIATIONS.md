# Deviations Log

Every departure from [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md) (the single source of truth) is
recorded here. Each entry: what the spec said, what we did instead, why, and the approval status.

| ID | Status | Date | Topic |
|----|--------|------|-------|
| D-000 | Approved (implicit) | 2026-06-12 | Repaired OCR/transmission corruptions when transcribing the spec |
| D-001 | **Approved** | 2026-06-12 | Model string `claude-fable-5` → `claude-sonnet-4-6` |

---

## D-000 — Repaired corrupted spec text during transcription

**Spec said:** The hand-off text contained transmission/OCR corruptions, e.g. `rouo tool handler`,
`imporz`, `da: contact`, `aw.handler`, `getToolSchemas`, truncated sentences in Sections 1, 2, 4, 5,
6, 16, 17, 18, 19.

**We did:** Reconstructed the clearly-intended clean text when writing
`docs/BUILD_SPEC.md` (e.g. `router`, `import { z }`, `data: contact`, `await tool.handler`). No
substantive design decisions were changed — only obviously-garbled tokens were repaired.

**Why:** A single source of truth must be unambiguous. Leaving corrupted code fragments in the SSOT
would propagate errors into the build.

**Status:** Approved implicitly (transcription fidelity, no design change). Flag if you disagree with
any specific repair.

---

## D-001 — Reasoning model: `claude-fable-5` → `claude-sonnet-4-6`

**Spec said:** Section 3 — "Claude Fable 5 via `@anthropic-ai/sdk`, model string `claude-fable-5`".

**We did:** Use model string `claude-sonnet-4-6`, configured via `CLAUDE_MODEL` env var (so it can be
changed without code edits).

**Why:** `claude-fable-5` is not a real Anthropic model ID — it appears to be a placeholder/garble.
`claude-sonnet-4-6` is a current, capable, cost-effective model with strong native tool-use, which
suits a multi-iteration agentic loop.

**Status:** **Approved by project owner** (2026-06-12, via build kickoff Q&A). Model is env-driven, so
switching to Opus 4.8 (`claude-opus-4-8`) later is a one-line `.env` change, no deviation needed.

---

## Process

- Propose a deviation **before** implementing it whenever it changes behavior, scope, or a design
  decision in the SSOT.
- Get explicit owner approval; record the approval here with date.
- Pure transcription/typo fixes (like D-000) can be logged retroactively.
