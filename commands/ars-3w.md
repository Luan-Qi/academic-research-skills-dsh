---
name: ars-3w
description: "ARS deep-research `three-way-scan` mode — WHY/HOW/WHAT paper shortlist"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-3w`. Call the `skill` tool with name `deep-research` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `deep-research/SKILL.md`.

**Mode:** `three-way-scan` (skill `deep-research`)

---

Trigger the `deep-research` skill in `three-way-scan` mode. Produces a compact paper shortlist compared by WHY / HOW / WHAT plus a cross-paper synthesis (common WHY, divergent HOW, strongest WHAT, unresolved gap). Lighter than `lit-review`; escalate to `lit-review` / `systematic-review` for full coverage. Fidelity spectrum, low oversight.

Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

Mode reference: `MODE_REGISTRY.md` § deep-research.
Skill entry: `deep-research/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
