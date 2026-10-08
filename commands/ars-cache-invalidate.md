---
name: ars-cache-invalidate
description: "ARS /ars-cache-invalidate — drop cached citation-verification entries for one key"
disable-model-invocation: true
user-invocable: true
---

The user invoked `/ars-cache-invalidate`. This command drives the ported ARS Python CLI directly; it does not load a skill first.

---

Invalidate the persistent verification cache for one citation key, so the next pipeline run re-verifies it live against Crossref / OpenAlex / Semantic Scholar / arXiv instead of returning a stale cached verdict. Use this when a citation's metadata changed (e.g. a preprint gained a published DOI) or when a prior verification looks wrong.

The cache (spec v3.11 #182 Delta 2) is a local SQLite store at `~/.cache/ars/verification.db` (override via `ARS_VERIFICATION_CACHE_PATH`), keyed by `(citation_key, resolver_name, query_form)` with a 90-day TTL. This command removes **every** cached entry for the named citation key (all four resolvers, all query forms); other citations are untouched. It is idempotent — invalidating a key with no cached rows succeeds as a no-op.

**Invalidation cascade (#541, unconditional)**: after invalidation the next gate regenerates the citation's verification summary row and re-runs Phase E audit verdicts for claims citing it — unconditionally (no baseline is retained to diff against), covering existence status, metadata, and retrieved evidence alike. An age-based advisory also surfaces stale cache entries automatically at the gates (`ARS_CACHE_STALE_ADVISORY_DAYS`, default 30; opt-in live re-verification via `ARS_CACHE_REVALIDATE=1`).

To invalidate the **entire** cache at once (e.g. after a systemic resolver bug cached many false negatives), delete the database file directly: `rm ~/.cache/ars/verification.db`. It is recreated empty on the next run.

Implementation:
```bash
python scripts/ars_cache_invalidate.py <args from the user's message>
```

**Interpreter and arguments (DSH).** This plugin bundles the upstream `scripts/` directory, so the CLI is present at the plugin root.
Resolve a real interpreter — `py -3` on Windows, otherwise `python`, otherwise `python3`.
On Windows `python3` is frequently a 0-byte Microsoft Store stub that fails before the script runs, so prefer `py -3`.
DSH does not substitute slash-command arguments: take the citation key(s) and paths from the user's own message.

Mode reference: `MODE_REGISTRY.md`.

Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.
