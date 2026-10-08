---
name: ars-disclosure
description: "ARS academic-paper `disclosure` mode — venue-specific AI usage statement"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-disclosure`. Call the `skill` tool with name `academic-paper` to load that skill (skip this step if it is already loaded in this session), then run the mode below. This wrapper is a pointer, not the instructions: the authoritative text for the mode is `academic-paper/SKILL.md`.

**Mode:** `disclosure` (skill `academic-paper`)

---

Trigger the `academic-paper` skill in standalone `disclosure` mode. Agent 9 must load `academic-paper/references/disclosure_mode_protocol.md` before rendering; the generic formatter disclosure is not a fallback. The default venue path returns `REQUIRED`, `ACTION_ONLY`, `NOT_REQUIRED`, or `UNKNOWN` applicability plus an explicit typed halt status when needed (15 policy targets supported: ICLR / NeurIPS / Nature / Science / ACL / EMNLP plus medical-publishing targets — ICMJE / NEJM / The Lancet / JAMA / BMJ / PLOS / Frontiers / publisher-wide 中华护理杂志社 / journal-level 国际眼科杂志). The `--policy-anchor` path uses its separate anchor-specific renderer. Fidelity spectrum, low oversight.

Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from the paper project's working directory. If the skill or a required file cannot be loaded, report the loading failure and stop; do not substitute this command summary for the mode instructions.

Mode reference: `MODE_REGISTRY.md` § academic-paper.
Skill entry: `academic-paper/SKILL.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
