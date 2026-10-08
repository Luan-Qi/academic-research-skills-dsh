---
name: ars-reviewer-re-review
description: "ARS reviewer `re-review` mode — verify revisions, residual issues, R&R traceability"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-reviewer-re-review`. Call the `skill` tool with name `academic-paper-reviewer` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-paper-reviewer/SKILL.md`.

**Mode:** `re-review` (skill `academic-paper-reviewer`)

**Input this mode needs:** the revised draft, the original draft, and the round-1 review. If the user has not supplied it, ask for it in those terms before starting.

---

Read `academic-paper-reviewer/SKILL.md` and follow its instructions for the `re-review` mode exactly as written, together with any reference files that mode names. Do not improvise a shorter procedure.

Mode reference: `MODE_REGISTRY.md` § academic-paper-reviewer.
Skill entry: `academic-paper-reviewer/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
