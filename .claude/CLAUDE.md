# Academic Research Skills — DeepSeek Harness port

This repository is an unaffiliated **DSH port** of Academic Research Skills (ARS)
by Cheng-I Wu ([Imbad0202](https://github.com/Imbad0202)), tracking upstream
**v3.23.0**. See [PORTING-NOTES.md](../PORTING-NOTES.md) for the complete
statement of changes and [README.md](../README.md) for install and usage.

- **Suite version**: 3.23.0
- **Last Updated**: 2026-10-03
- **Upstream tracked**: 3.23.0 (2026-10-03)

**On DSH this file is inert.** DSH loads no repo-level `CLAUDE.md`; the five
skills are registered directly into the skill catalog by `lib/startup.js`, and
each skill body inlines the routing core below. This file exists so that
`scripts/check_routing_core_sync.py` can keep a working cross-copy guard on the
routing core, and so that a reader opening this checkout in any
Claude-Code-compatible tool finds the repo-level guidance instead of nothing.

## Skills Overview

| Skill | Role |
|---|---|
| `deep-research` v2.12.1 | ARS skill bundle |
| `academic-paper` v3.3.1 | ARS skill bundle |
| `academic-paper-reviewer` v1.11.1 | ARS skill bundle |
| `academic-pipeline` v3.23.0 | ARS skill bundle |
| `sr-screener` v1.0.0 | ARS skill bundle |

All five skills keep upstream's content: the table above pins the version each
one is at, and `MODE_REGISTRY.md` is the single source of truth for the 35 modes.

## v3.23.0 Key Additions

Upstream 3.23.0 (2026-10-03): `sr-screener` as a fifth skill, repairs from a pipeline walk-through, and evidence and ledger hardening.

This port tracks that release in full. For what *this port* changed on top of it,
see [PORTING-NOTES.md](../PORTING-NOTES.md); for upstream's own release history,
see [CHANGELOG.md](../CHANGELOG.md).

The routing-core block below is reproduced **byte-identically** from
[`shared/references/routing_core.md`](../shared/references/routing_core.md) by `build/generate-repo-docs.mjs`. Do not
edit it here: edit the canonical file and re-run the generator.

<!-- routing-core:begin -->
**Step 0 — Escape hatch check (before any classification):** If the user's first message begins with `[direct-mode]` (case-insensitive byte-0 token, optionally preceded by whitespace/newlines that are stripped on parse), record this fact, strip the prefix and surrounding whitespace from the message, and skip directly to **Step 1 explicit-intent handling** on the stripped content. The literal `[direct-mode]` is NOT passed through to the dispatched agent. If the stripped message itself has no clear skill named, Step 1 falls through to Step 3 clarification (the escape hatch bypasses cross-phase clarification (Step 2), not all routing). When the token is honored and the named agent or skill needs inputs the message does not supply, read that agent's or skill's file and ask for what it requires, in its terms. Without the byte-0 token, naming an agent is not explicit intent: such a message goes through Steps 1-3 like any other, so cross-phase materials still get Step 2 clarification.

Otherwise, classify the user's input:

1. **Explicit clear intent** — user invokes a specific skill via `/ars-*` slash command, or uses an unambiguous trigger keyword that maps to a single skill (e.g., "lit-review this", "review my paper", "draft an abstract"):
   → Route directly; no clarification, no orchestrator detour.
   → The request stays explicit when the mode's usual input is absent or a word in it has other everyday senses. A revision request with no reviewer comments is revision mode's "feel certain sections need improvement" case, and "revisar artículo" is the reviewer's trigger. Route to that mode and let the mode handle what is missing; do not reopen the choice of workflow.

2. **Cross-phase materials detected** — user provides artifacts spanning ≥ 2 pipeline phases without naming a specific skill (e.g., pre-written abstract + pre-collected literature; full draft + reviewer comments + bibliography):
   → **Clarify**. Do NOT auto-route to a single-phase agent. List candidate workflows as a-d options in markdown body (NOT via ask_user_question tool). See `shared/references/intent_clarification_protocol.md` for the message template.
   → Reason: clarification is the safest action when materials don't unambiguously identify intent. (v3.10 active conductor (#134) will handle this via structured intake; v3.9.2 asks.)

3. **Ambiguous intent, no materials** — user provides no artifacts and no clear request:
   → Clarify per `shared/references/intent_clarification_protocol.md`.

**Screening boundary (sr-screener):** a request to screen records the user already has (database exports, pasted abstracts, full-text PDFs) against a review's eligibility criteria, or to build a screening protocol, pilot the screening, adjudicate screening conflicts, audit exclusions, or report the selection counts, routes to `sr-screener`. A request to write a literature review, or to run a systematic review, meta-analysis, or PRISMA report, does not route to `sr-screener`. Screening starts only when the user asks for it: `deep-research` `systematic-review` mode may mention `sr-screener`, but never hands over to it automatically.

**Anti-pattern (caused #133):** Receiving ambiguous cross-phase materials and silently auto-routing to a single-phase agent based on which phase the materials "look closest to." This bypasses orchestrator-level reconciliation and lets the subagent inherit the full ambiguity without independent oversight.
<!-- routing-core:end -->
