---
name: ars-reviewer
description: "ARS academic-paper-reviewer `full` mode — 5-seat peer review panel + editorial decision"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-reviewer`. Call the `skill` tool with name `academic-paper-reviewer` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-paper-reviewer/SKILL.md`.

**Mode:** `full` (skill `academic-paper-reviewer`)

---

Trigger the `academic-paper-reviewer` skill in `full` mode. Honor explicit alternate modes when present: `quick`, `methodology-focus`, `re-review`, `guided`, or `calibration`. Runs on the inherited session model — the v3.7.0 `opus` frontmatter floor was retired in the 2026-06 harness pass so a stronger session model is never silently downgraded.

Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

Mode reference: `MODE_REGISTRY.md` § academic-paper-reviewer.
Skill entry: `academic-paper-reviewer/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
