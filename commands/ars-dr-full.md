---
name: ars-dr-full
description: "ARS deep-research `full` mode — complete APA 7.0 research report (3,000–8,000 words)"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-dr-full`. Call the `skill` tool with name `deep-research` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `deep-research/SKILL.md`.

**Mode:** `full` (skill `deep-research`)

**Input this mode needs:** the research topic or question. If the user has not supplied it, ask for it in those terms before starting.

---

Read `deep-research/SKILL.md` and follow its instructions for the `full` mode exactly as written, together with any reference files that mode names. Do not improvise a shorter procedure.

Mode reference: `MODE_REGISTRY.md` § deep-research.
Skill entry: `deep-research/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
