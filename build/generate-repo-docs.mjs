#!/usr/bin/env node
/**
 * generate-repo-docs.mjs — sync the four rostered agent mirrors.
 *
 * `scripts/check_agents_mirror_sync.py` requires the four plugin agents upstream
 * designates as dispatchable to exist at the repo root and be **byte-identical**
 * to their canonical files in the skill bundles. On DSH these files are inert
 * (there is no agent registry and no per-agent allowlist), but they are exactly
 * how a DSH user consumes such a role — by passing the file to the `subagent`
 * tool — so they are shipped. Syncing rather than hand-copying is upstream's own
 * instruction ("restore with `cp <source> <mirror>`").
 *
 * WHAT THIS SCRIPT NO LONGER GENERATES, AND WHY
 *
 * It used to also emit `.claude/CLAUDE.md`, because upstream's
 * `check_routing_core_sync.py` looks for the routing-core marker block there (it
 * treats that file as one of the block's carriers, next to the five `SKILL.md`
 * copies). That file was dropped deliberately: shipping a Claude-Code repo
 * document inside a DeepSeek Harness plugin is misleading, and the only thing it
 * bought was one upstream lint.
 *
 * The guard it anchored is NOT lost. The routing core is load-bearing — it
 * decides whether a request routes straight to a skill or the user is first
 * asked which workflow they want (the failure #133 it prevents) — so
 * `build/validate-skills.mjs` now extracts the block from
 * `shared/references/routing_core.md` and asserts it is byte-identical across
 * all five `SKILL.md` copies, which is the same invariant the upstream lint
 * checks, minus the `.claude/` carrier.
 *
 * Usage:
 *   node build/generate-repo-docs.mjs           # write
 *   node build/generate-repo-docs.mjs --check    # verify, write nothing
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

/** The four rostered plugin agents and their canonical in-bundle sources. */
const MIRRORS = [
  ['deep-research/agents/report_compiler_agent.md', 'agents/report_compiler_agent.md'],
  ['deep-research/agents/research_architect_agent.md', 'agents/research_architect_agent.md'],
  ['deep-research/agents/synthesis_agent.md', 'agents/synthesis_agent.md'],
  ['sr-screener/agents/screening_reviewer_agent.md', 'agents/screening_reviewer_agent.md'],
];

let drift = 0;

for (const [source, mirror] of MIRRORS) {
  const text = readFileSync(join(ROOT, source), 'utf8');
  const file = join(ROOT, mirror);
  const existed = existsSync(file);
  const current = existed ? readFileSync(file, 'utf8') : null;
  if (current === text) {
    console.log(`ok     ${mirror}`);
    continue;
  }
  if (CHECK) {
    drift += 1;
    console.error(`DRIFT  ${mirror}${existed ? '' : ' (missing)'}`);
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  console.log(`${existed ? 'update' : 'create'} ${mirror}  <- ${source}`);
}

if (CHECK) {
  console.log(`\ngenerate-repo-docs.mjs --check — ${drift} file(s) drifted; ${MIRRORS.length} mirrors checked`);
  process.exitCode = drift === 0 ? 0 : 1;
} else {
  console.log(`\ngenerate-repo-docs.mjs — ${MIRRORS.length} agent mirrors synced`);
}
