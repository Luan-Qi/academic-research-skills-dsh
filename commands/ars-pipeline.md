---
name: ars-pipeline
description: "ARS academic-pipeline — the 10-stage orchestrator (alias of /ars-full)"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-pipeline`. Call the `skill` tool with name `academic-pipeline` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-pipeline/SKILL.md`.

**Mode:** `(pipeline)` (skill `academic-pipeline`)

---

Read `academic-pipeline/SKILL.md` and follow its instructions for the `(pipeline)` mode exactly as written, together with any reference files that mode names. Do not improvise a shorter procedure.

Mode reference: `MODE_REGISTRY.md` § academic-pipeline.
Skill entry: `academic-pipeline/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
