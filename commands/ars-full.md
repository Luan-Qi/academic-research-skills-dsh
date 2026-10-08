---
name: ars-full
description: "ARS full pipeline — research → write → integrity → review → revise → finalize (10 stages)"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-full`. Call the `skill` tool with name `academic-pipeline` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-pipeline/SKILL.md`.

**Mode:** `(pipeline)` (skill `academic-pipeline`)

---

Trigger the `academic-pipeline` orchestrator (`(pipeline)` in `MODE_REGISTRY.md` — the orchestrator has no named mode of its own). Loads the skill and executes the complete academic research workflow (10-stage orchestration: deep-research → academic-paper → integrity → academic-paper-reviewer → revision → re-review → final integrity → finalize).

Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

Mode reference: `MODE_REGISTRY.md` § academic-pipeline.
Skill entry: `academic-pipeline/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
