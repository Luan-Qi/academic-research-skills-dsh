---
name: ars-unmark-read
description: "ARS /ars-unmark-read — withdraw a recorded reading signal"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-unmark-read`. This command drives the ported ARS Python CLI directly; it does not load a skill first.

---

Rescind a previously recorded `USER_ATTESTED_READ` declaration for the named citation key(s). Per v3.6.8 spec §3.6 firm rule 3, the session-scoped peer file `<passport-stem>_human_read_log.yaml` is append-only: rescind writes a `rescinded_at: <ISO 8601>` field on the matching entry rather than deleting it, so audit replay can reconstruct the user's signal trajectory. The next finalizer pass will demote any coverage-dependent `<!--ref:slug ok-->` back to `<!--ref:slug LOW-WARN-->` for each rescinded slug.

The dispatching agent substitutes `<path>` below with the active Material Passport path from session context before executing (the quoting is preserved so paths containing spaces remain a single argument). The CLI requires the citation_key to exist in `literature_corpus[]` AND to have an unrescinded prior mark in the read-log; hard-fails otherwise with the canonical `[ARS-MARK-READ ERROR: ...]` message.

Implementation:
```bash
python scripts/ars_mark_read.py <args from the user's message> --passport-path "<path>" --unmark
```

**Interpreter and arguments (DSH).** This plugin bundles the upstream `scripts/` directory, so the CLI is present at the plugin root.
Resolve a real interpreter — `py -3` on Windows, otherwise `python`, otherwise `python3`.
On Windows `python3` is frequently a 0-byte Microsoft Store stub that fails before the script runs, so prefer `py -3`.
DSH does not substitute slash-command arguments: take the citation key(s) and paths from the user's own message.

Mode reference: `MODE_REGISTRY.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
