---
name: ars-dr-socratic
description: "ARS deep-research `socratic` mode — guided dialogue to a Research Plan Summary (very high oversight)"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-dr-socratic`. Call the `skill` tool with name `deep-research` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `deep-research/SKILL.md`.

**Mode:** `socratic` (skill `deep-research`)

---

Read `deep-research/SKILL.md` and follow its instructions for the `socratic` mode exactly as written, together with any reference files that mode names. Do not improvise a shorter procedure.

Mode reference: `MODE_REGISTRY.md` § deep-research.
Skill entry: `deep-research/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
