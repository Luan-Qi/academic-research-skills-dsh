---
name: ars-lit-review
description: "ARS academic-paper `lit-review` mode — annotated bibliography as a paper"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-lit-review`. Call the `skill` tool with name `academic-paper` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-paper/SKILL.md`.

**Mode:** `lit-review` (skill `academic-paper`)

---

Trigger the `academic-paper` skill in `lit-review` mode. Produces an annotated bibliography rendered as a literature review section. Fidelity spectrum, medium oversight.

Stay in `academic-paper` `lit-review` mode and do not reopen the choice of workflow: if the papers or sources the request refers to are missing, ask the user for them or offer to search for them within this mode.

The skill's review-form note (#921) belongs to this mode and does not reopen that choice: show it and wait when the skill says to, and continue in `lit-review` mode if the author skips it.

Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

Mode reference: `MODE_REGISTRY.md` § academic-paper.
Skill entry: `academic-paper/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
