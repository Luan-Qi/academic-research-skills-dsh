---
name: ars-sr-ft-screen
description: "ARS sr-screener `ft-screen` mode — full-text screening with one reason per exclusion"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-sr-ft-screen`. Call the `skill` tool with name `sr-screener` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `sr-screener/SKILL.md`.

**Mode:** `ft-screen` (skill `sr-screener`)

**Input this mode needs:** the full texts of records that advanced. If the user has not supplied it, ask for it in those terms before starting.

---

Read `sr-screener/SKILL.md` and follow its instructions for the `ft-screen` mode exactly as written, together with any reference files that mode names. Do not improvise a shorter procedure.

Mode reference: `MODE_REGISTRY.md` § sr-screener.
Skill entry: `sr-screener/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
