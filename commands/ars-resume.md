---
name: ars-resume
description: "ARS academic-pipeline `resume_from_passport` mode — resume a run from a Material Passport boundary"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-resume`. Call the `skill` tool with name `academic-pipeline` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-pipeline/SKILL.md`.

**Mode:** `resume_from_passport=<hash>` (skill `academic-pipeline`)

**Input this mode needs:** the boundary hash, printed by a run started with ARS_PASSPORT_RESET=1. If the user has not supplied it, ask for it in those terms before starting.

---

Read `academic-pipeline/SKILL.md` and follow its instructions for the `resume_from_passport=<hash>` mode exactly as written, together with any reference files that mode names. Do not improvise a shorter procedure.

Mode reference: `MODE_REGISTRY.md` § academic-pipeline.
Skill entry: `academic-pipeline/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
