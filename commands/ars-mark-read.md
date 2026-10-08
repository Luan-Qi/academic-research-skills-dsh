---
name: ars-mark-read
description: "ARS /ars-mark-read — record a user-attested reading signal for citation keys"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-mark-read`. This command drives the ported ARS Python CLI directly; it does not load a skill first.

---

Record the user's `USER_ATTESTED_READ` declaration for the source(s) backing the named citation key(s). This is a user statement, not independent evidence that a person read or understood the source. A finalizer may promote `<!--ref:slug LOW-WARN-->` to `<!--ref:slug ok-->` only when the declared scope covers that citation's anchor. Per v3.6.8 spec §3.6, the signal is stored in a session-scoped peer file `<passport-stem>_human_read_log.yaml` next to the active Material Passport; `literature_corpus[]` is adapter-owned and is NEVER mutated to carry reading state.

The dispatching agent substitutes `<path>` below with the active Material Passport path from session context before executing (the quoting is preserved so paths containing spaces remain a single argument). The CLI handles validation (citation_key must exist in `literature_corpus[]`; on miss emit `[ARS-MARK-READ ERROR: citation_key '<slug>' not in literature_corpus[]]` and refuse to write), 4 fail-fast environment checks (no active passport / passport not found / parent unreadable / read-log unwritable), and append-only write per §3.6 firm rule 3.

Read scope is required for every new mark (#738; declaration-only — pass through whatever the user states, never infer): `--scope {full_text,sections,abstract_only,toc_only,unknown}` records the declared coverage; `--locator "<text>"` (repeatable, requires `--scope sections`) names the read sections/pages; `--note "<text>"` free text (requires `--scope`). Use `--scope unknown` when the user cannot specify coverage. Missing scope is accepted only in legacy ledger records. Explicit `unknown` and legacy missing scope remain `coverage_unknown`; they acknowledge the declaration but can never promote an anchored citation to `ok`. Page coverage requires an explicit `page`, `p.`, or `pp.` locator—bare numbers and `section <n>` never count as page ranges. The deterministic resolver in `scripts/human_read_attestation_resolver.py` strictly validates the current ledger and computes a transient routing decision on every finalizer pass; its output is not a persisted audit receipt.

Implementation:
```bash
python scripts/ars_mark_read.py <args from the user's message> --passport-path "<path>"
```

**Interpreter and arguments (DSH).** This plugin bundles the upstream `scripts/` directory, so the CLI is present at the plugin root.
Resolve a real interpreter — `py -3` on Windows, otherwise `python`, otherwise `python3`.
On Windows `python3` is frequently a 0-byte Microsoft Store stub that fails before the script runs, so prefer `py -3`.
DSH does not substitute slash-command arguments: take the citation key(s) and paths from the user's own message.

Mode reference: `MODE_REGISTRY.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
