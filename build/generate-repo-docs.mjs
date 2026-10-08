#!/usr/bin/env node
/**
 * generate-repo-docs.mjs — regenerate the two repo-level files whose bytes
 * upstream's own lints pin.
 *
 * Both files exist to keep a bundled guard working, not to satisfy a linter for
 * its own sake:
 *
 *   1. `.claude/CLAUDE.md` — `scripts/check_routing_core_sync.py` requires the
 *      routing-core marker block to appear there byte-identically to the
 *      canonical `shared/references/routing_core.md`, alongside the five
 *      `SKILL.md` copies. The routing core is load-bearing (it decides whether a
 *      request routes straight to a skill or the user is first asked which
 *      workflow they want — the failure #133 it prevents), so keeping a working
 *      cross-copy guard on it matters. Upstream ships an 82 KB Claude Code repo
 *      document here; this port writes a short DSH-appropriate file instead and
 *      extracts the block from the canonical source so it cannot drift.
 *
 *   2. `agents/*.md` — `scripts/check_agents_mirror_sync.py` requires the four
 *      rostered plugin agents to exist at the repo root and be byte-identical to
 *      their canonical files in the skill bundles. On DSH these files are inert
 *      (there is no agent registry and no per-agent allowlist), but they are the
 *      four roles upstream designates as subagent-dispatchable, which is exactly
 *      how a DSH user can consume them — by passing the file to the `subagent`
 *      tool. Syncing rather than hand-copying is upstream's own instruction
 *      ("restore with `cp <source> <mirror>`").
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

const CANONICAL = 'shared/references/routing_core.md';
const BEGIN = '<!-- routing-core:begin -->';
const END = '<!-- routing-core:end -->';

/** The five skill bundles, in MODE_REGISTRY order. */
const SKILL_DIRS = [
  'deep-research',
  'academic-paper',
  'academic-paper-reviewer',
  'academic-pipeline',
  'sr-screener',
];

/** The four rostered plugin agents and their canonical in-bundle sources. */
const MIRRORS = [
  ['deep-research/agents/report_compiler_agent.md', 'agents/report_compiler_agent.md'],
  ['deep-research/agents/research_architect_agent.md', 'agents/research_architect_agent.md'],
  ['deep-research/agents/synthesis_agent.md', 'agents/synthesis_agent.md'],
  ['sr-screener/agents/screening_reviewer_agent.md', 'agents/screening_reviewer_agent.md'],
];

let drift = 0;
const report = (rel, existed) => {
  drift += 1;
  console.error(`DRIFT  ${rel}${existed ? '' : ' (missing)'}`);
};

/** Write a file only when its bytes differ, so an unchanged tree stays untouched. */
function put(rel, text) {
  const file = join(ROOT, rel);
  const existed = existsSync(file);
  const current = existed ? readFileSync(file, 'utf8') : null;
  if (current === text) {
    console.log(`ok     ${rel}`);
    return;
  }
  if (CHECK) return report(rel, existed);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  console.log(`${existed ? 'update' : 'create'} ${rel}`);
}

// --- 1. .claude/CLAUDE.md ---------------------------------------------------
const canonical = readFileSync(join(ROOT, CANONICAL), 'utf8');
const begin = canonical.indexOf(BEGIN);
const end = canonical.indexOf(END);
if (begin === -1 || end === -1 || end < begin) {
  console.error(`${CANONICAL} is missing the ${BEGIN} / ${END} marker pair`);
  process.exit(1);
}
// The block is everything from BEGIN through the END marker's line, inclusive.
const endLine = canonical.indexOf('\n', end);
const block = canonical.slice(begin, endLine === -1 ? undefined : endLine);

// Version facts are read from the canonical sources so this document cannot
// drift: the suite version and date come from CITATION.cff, each skill version
// from its own SKILL.md frontmatter.
const citation = readFileSync(join(ROOT, 'CITATION.cff'), 'utf8');
const suiteVersion = /^version:\s*(\S+)/m.exec(citation)?.[1];
const releasedOn = /^date-released:\s*(\S+)/m.exec(citation)?.[1];
if (!suiteVersion || !releasedOn) {
  console.error('CITATION.cff is missing `version:` or `date-released:`');
  process.exit(1);
}

const skillVersions = SKILL_DIRS.map((skill) => {
  const fm = readFileSync(join(ROOT, skill, 'SKILL.md'), 'utf8');
  const version = /^\s*version:\s*"?([^"\n]+?)"?\s*$/m.exec(fm)?.[1];
  if (!version) {
    console.error(`${skill}/SKILL.md has no metadata.version — cannot build the overview table`);
    process.exit(1);
  }
  return [skill, version];
});

const overviewRows = skillVersions
  .map(([skill, version]) => `| \`${skill}\` v${version} | ARS skill bundle |`)
  .join('\n');

// The release summary comes from the CHANGELOG's own heading for this version, so
// the Key Additions section states what upstream shipped rather than a paraphrase.
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
const releaseHeading = new RegExp(
  `^## \\[?v?${suiteVersion.replace(/\./g, '\\.')}\\]?\\s*[-—]\\s*(\\d{4}-\\d{2}-\\d{2})\\s*[—–-]\\s*(.+)$`,
  'm',
).exec(changelog);
const releaseSummary = releaseHeading?.[2]?.trim();

put(
  '.claude/CLAUDE.md',
  `# Academic Research Skills — DeepSeek Harness port

This repository is an unaffiliated **DSH port** of Academic Research Skills (ARS)
by Cheng-I Wu ([Imbad0202](https://github.com/Imbad0202)), tracking upstream
**v${suiteVersion}**. See [PORTING-NOTES.md](../PORTING-NOTES.md) for the complete
statement of changes and [README.md](../README.md) for install and usage.

- **Suite version**: ${suiteVersion}
- **Last Updated**: ${releasedOn}
- **Upstream tracked**: ${suiteVersion} (${releasedOn})

**On DSH this file is inert.** DSH loads no repo-level \`CLAUDE.md\`; the five
skills are registered directly into the skill catalog by \`lib/startup.js\`, and
each skill body inlines the routing core below. This file exists so that
\`scripts/check_routing_core_sync.py\` can keep a working cross-copy guard on the
routing core, and so that a reader opening this checkout in any
Claude-Code-compatible tool finds the repo-level guidance instead of nothing.

## Skills Overview

| Skill | Role |
|---|---|
${overviewRows}

All five skills keep upstream's content: the table above pins the version each
one is at, and \`MODE_REGISTRY.md\` is the single source of truth for the 35 modes.

## v${suiteVersion} Key Additions

Upstream ${suiteVersion} (${releaseHeading?.[1] ?? releasedOn}): ${releaseSummary ?? 'see CHANGELOG.md'}.

This port tracks that release in full. For what *this port* changed on top of it,
see [PORTING-NOTES.md](../PORTING-NOTES.md); for upstream's own release history,
see [CHANGELOG.md](../CHANGELOG.md).

The routing-core block below is reproduced **byte-identically** from
[\`${CANONICAL}\`](../${CANONICAL}) by \`build/generate-repo-docs.mjs\`. Do not
edit it here: edit the canonical file and re-run the generator.

${block}
`,
);

// --- 2. agents/ mirrors -----------------------------------------------------
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
    report(mirror, existed);
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  console.log(`${existed ? 'update' : 'create'} ${mirror}  <- ${source}`);
}

if (CHECK) {
  console.log(
    `\ngenerate-repo-docs.mjs --check — ${drift} file(s) drifted; ` +
      `${MIRRORS.length + 1} generated file(s) checked`,
  );
  process.exitCode = drift === 0 ? 0 : 1;
} else {
  console.log('\ngenerate-repo-docs.mjs — repo-level pinned files regenerated');
}
