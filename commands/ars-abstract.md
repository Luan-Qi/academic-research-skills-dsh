---
name: ars-abstract
description: "ARS academic-paper `abstract-only` mode — bilingual abstract + keywords"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-abstract`. Call the `skill` tool with name `academic-paper` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-paper/SKILL.md`.

**Mode:** `abstract-only` (skill `academic-paper`)

---

Trigger the `academic-paper` skill in `abstract-only` mode. Produces a bilingual abstract plus keywords. Abstract languages follow the run's declared `output_language_pair`, which is a per-run value defaulting to `zh-tw-en` (zh-TW + EN) — so an unconfigured run keeps the pre-#862 pairing. Fidelity spectrum, medium oversight. Carries the v3.6.7 `report_compiler_agent` PATTERN PROTECTION layer when invoked through the pipeline.

Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

Mode reference: `MODE_REGISTRY.md` § academic-paper.
Skill entry: `academic-paper/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
