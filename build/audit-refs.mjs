#!/usr/bin/env node
/**
 * audit-refs.mjs — dangling cross-reference audit for the DSH port.
 *
 * The upstream suite is a web of relative paths: a SKILL.md points at
 * `shared/handoff_schemas.md`, an agent points at `references/x.md`, a command
 * points at `docs/design/....md`. A port that copies only the skill folders
 * leaves hundreds of these pointing at nothing, and because the model follows
 * them at runtime, a dangling reference is a silent capability loss. The first
 * build of this port had 118 of them.
 *
 * Resolution order for every path-like token (first hit wins):
 *   1. plugin root                 — upstream's own convention (`<skill>/agents/x.md`)
 *   2. the owning skill directory  — skill-relative (`references/x.md`)
 *   3. the referring file's dir     — sibling-relative
 *   4. shared/contracts/            — contract shorthand (`reviewer/full.json`)
 *   5. examples/                    — template shorthand
 *
 * Anything left is reported in two buckets: `expected absent` (run-local artifact
 * paths, shell-variable prefixes, upstream-only CI paths — all enumerated with a
 * reason in EXPECTED) and `UNRESOLVED` (a real port defect). Exit code is 1 only
 * for the second bucket, so this script can gate a release.
 *
 * Usage:
 *   node build/audit-refs.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DEFAULT = fileURLToPath(new URL('..', import.meta.url));
const AS_JSON = process.argv.includes('--json');

// Options let the same yardstick measure another checkout (e.g. an earlier port).
const rootArg = /^--root=(.+)$/.exec(process.argv.find((a) => a.startsWith('--root=')) ?? '');
const ROOT = rootArg ? rootArg[1] : ROOT_DEFAULT;
/** `root`  — skill dirs at the package root, mirroring upstream (this port).
 *  `nested` — skill dirs under `skills/<name>/` (the earlier port's layout). */
const NESTED = (process.argv.find((a) => a.startsWith('--layout=')) ?? '') === '--layout=nested';

/** Markdown the model reads at runtime. `docs/` is deliberately excluded: it is
 * frozen upstream provenance, and its own internal links are upstream's concern. */
const SKILL_NAMES = [
  'deep-research',
  'academic-paper',
  'academic-paper-reviewer',
  'academic-pipeline',
  'sr-screener',
];
const SCAN_DIRS = NESTED
  ? [...SKILL_NAMES.map((s) => join('skills', s)), 'shared']
  : [...SKILL_NAMES, 'shared'];
const SCAN_ROOT_FILES = ['MODE_REGISTRY.md'];
const EXTS = new Set(['.md']);

/** A path-like token: at least one `/` and a known file extension. */
const PATH_RE = /(?<![\w./-])((?:[\w.@-]+\/)+[\w.@-]+\.(?:md|json|py|sh|mjs|js|ya?ml|tex|toml|cff|csv|ris|nbib|txt))/g;

/** Tokens that look like paths but are not files in this repo. */
const IGNORE_PREFIXES = ['http', 'www', 'github.com', 'doi.org', 'arxiv.org', 'zenodo.org'];

/**
 * Paths that legitimately do not exist here. Every entry carries the reason, so
 * a future reader can tell "checked and fine" from "not checked".
 */
const EXPECTED = [
  {
    re: /^(S|GUARD)\//,
    reason: 'shell-variable prefix ($S / $GUARD) in a command snippet, not a repo path',
  },
  {
    re: /^(phase0|phase1|phase2|phase2_investigation|phase4_composition|phase6|phase6_revision|audit_artifacts|artifacts|batches|chapter_4|results)\//,
    reason: 'run-local artifact path the agents create at runtime',
  },
  { re: /^\.github\//, reason: 'upstream CI workflow, deliberately not bundled' },
  { re: /\.\.\./, reason: 'ellipsis placeholder inside an illustrative path' },
  {
    re: /^references\/invariants\.md$/,
    reason: "names a file of a third-party project (sci-ssci-polishing), not this repo",
  },
  { re: /^scripts\/plot_fig3\.py$/, reason: 'illustrative example script path in a worked example' },
];
const classifyExpected = (token) => EXPECTED.find((e) => e.re.test(token));

function collect(dir, out = []) {
  if (!existsSync(dir)) return out; // a checkout may legitimately lack a skill
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (EXTS.has(full.slice(full.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

const missingScanDirs = SCAN_DIRS.filter((d) => !existsSync(join(ROOT, d)));
const files = [
  ...SCAN_DIRS.flatMap((d) => collect(join(ROOT, d))),
  ...SCAN_ROOT_FILES.filter((f) => existsSync(join(ROOT, f))).map((f) => join(ROOT, f)),
];

const unresolved = new Map(); // token -> Set("file:line")
const expected = new Map(); // token -> { reason, where:Set }
const resolvedCount = { pluginRoot: 0, skillDir: 0, sibling: 0, contracts: 0, examples: 0 };
let total = 0;

for (const file of files) {
  const relFile = relative(ROOT, file).replace(/\\/g, '/');
  // Owning skill dir for skill-relative references: at the package root in this
  // port (`<skill>`), or `skills/<skill>` in the earlier nested layout.
  const parts = relFile.split('/');
  const ownerName = NESTED && parts[0] === 'skills' ? parts[1] : parts[0];
  const skillDir = SKILL_NAMES.includes(ownerName)
    ? join(ROOT, ...(NESTED ? ['skills', ownerName] : [ownerName]))
    : null;

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const match of line.matchAll(PATH_RE)) {
      const token = match[1];
      if (IGNORE_PREFIXES.some((p) => token.toLowerCase().startsWith(p))) continue;
      total += 1;
      const where = `${relFile}:${i + 1}`;

      if (existsSync(join(ROOT, token))) {
        resolvedCount.pluginRoot += 1;
        continue;
      }
      if (skillDir && existsSync(join(skillDir, token))) {
        resolvedCount.skillDir += 1;
        continue;
      }
      if (existsSync(join(dirname(file), token))) {
        resolvedCount.sibling += 1;
        continue;
      }
      if (existsSync(join(ROOT, 'shared', 'contracts', token))) {
        resolvedCount.contracts += 1;
        continue;
      }
      if (existsSync(join(ROOT, 'examples', token))) {
        resolvedCount.examples += 1;
        continue;
      }

      const exp = classifyExpected(token);
      if (exp) {
        if (!expected.has(token)) expected.set(token, { reason: exp.reason, where: new Set() });
        expected.get(token).where.add(where);
        continue;
      }
      if (!unresolved.has(token)) unresolved.set(token, new Set());
      unresolved.get(token).add(where);
    }
  });
}

/** Group a token map by first path segment. */
function groupByPrefix(map) {
  const out = new Map();
  for (const [token, info] of map) {
    const prefix = token.split('/')[0];
    if (!out.has(prefix)) out.set(prefix, []);
    out.get(prefix).push({ token, ...(info instanceof Set ? { where: [...info] } : info) });
  }
  return [...out.entries()].sort((a, b) => b[1].length - a[1].length);
}

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        scannedFiles: files.length,
        referencesFound: total,
        resolved: resolvedCount,
        expectedAbsentCount: expected.size,
        unresolvedCount: unresolved.size,
        unresolved: [...unresolved.keys()].sort(),
      },
      null,
      2,
    ),
  );
} else {
  console.log(`audit-refs.mjs — root: ${ROOT}`);
  console.log(`  scanned ${files.length} files, found ${total} path references`);
  if (missingScanDirs.length) console.log(`  missing scan dir(s): ${missingScanDirs.join(', ')}`);
  console.log(`  plugin root   : ${resolvedCount.pluginRoot}`);
  console.log(`  skill dir     : ${resolvedCount.skillDir}`);
  console.log(`  sibling file  : ${resolvedCount.sibling}`);
  console.log(`  shared/contracts: ${resolvedCount.contracts}`);
  console.log(`  examples/     : ${resolvedCount.examples}`);
  console.log(`  expected absent: ${expected.size} distinct path(s)`);
  console.log(`  UNRESOLVED     : ${unresolved.size} distinct path(s)`);
  console.log('');

  if (expected.size) {
    console.log('--- expected absent (classified, not a defect) ---');
    for (const [prefix, entries] of groupByPrefix(expected)) {
      for (const { token, reason, where } of entries) {
        console.log(`  ${token}`);
        console.log(`      reason: ${reason}`);
        console.log(`      seen in: ${[...where].slice(0, 2).join(', ')}`);
      }
    }
    console.log('');
  }

  if (unresolved.size) {
    console.log('--- UNRESOLVED (real dangling references) ---');
    for (const [prefix, entries] of groupByPrefix(unresolved)) {
      console.log(`[${prefix}/]  ${entries.length} distinct path(s)`);
      for (const { token, where } of entries) {
        console.log(`    ${token}`);
        console.log(`        ${where.slice(0, 3).join(', ')}${where.length > 3 ? ` (+${where.length - 3} more)` : ''}`);
      }
    }
  } else {
    console.log('OK — every path reference the model can follow resolves.');
  }
}

process.exitCode = unresolved.size === 0 ? 0 : 1;
