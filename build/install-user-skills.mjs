#!/usr/bin/env node
/**
 * install-user-skills.mjs — materialize this package as NORMAL USER SKILLS under
 * `~/.dsh/skills/` (the DSH `user-dsh` skill root, rank 400), instead of serving
 * them from a plugin provider (rank 600 — so a user-skills copy wins any clash).
 *
 * WHY A TRANSFORM IS NEEDED. DSH's filesystem provider derives a skill's resource
 * anchor from the LAYOUT (verified in @deepseek-ai/dsh-skill-filesystem):
 *
 *   directory bundle  <root>/<name>/SKILL.md  -> resourceBase = <root>/<name>
 *   flat file         <root>/<name>.md        -> resourceBase = <root>
 *
 * and @deepseek-ai/dsh-skill then tells the model to "resolve relative paths
 * mentioned by this skill against the base directory". Upstream ARS uses TWO
 * anchors: bare `references/x.md` relative to the skill's own directory, and
 * `shared/…`, `scripts/…`, `docs/…`, `<other-skill>/agents/x.md`, `MODE_REGISTRY.md`
 * relative to the repository root. Dropping the bundles into `<root>/<name>/`
 * therefore mis-resolves the second family — the same class of breakage that left
 * 211 dangling references in an earlier port. So this installer:
 *
 *   1. copies the five skill bundles and the resource trees they reference into
 *      the user skills root;
 *   2. rewrites ONLY the references that resolve at the root and NOT in the
 *      skill's own directory, prefixing them with `../` — decided per reference by
 *      asking the filesystem, not by a naming rule;
 *   3. writes the 39 `/ars-*` wrappers as FLAT files at the root, whose anchor is
 *      the root itself, so their `MODE_REGISTRY.md` / `<skill>/SKILL.md`
 *      references need no rewrite at all;
 *   4. re-scans the result and FAILS if any reference is still unresolved.
 *
 * The copy is a REAL copy, not symlinks or junctions: a link would make the anchor
 * ambiguous (the provider may canonicalize a linked skill path, after which `../`
 * would point somewhere else entirely).
 *
 * It is idempotent and surgical. A manifest records exactly which paths this
 * installer owns, so a re-run removes files it installed earlier and no longer
 * wants — and never touches anything else in the root (e.g. your own skills).
 *
 * Usage:
 *   node build/install-user-skills.mjs            # install / update (idempotent)
 *   node build/install-user-skills.mjs --dry-run  # report scope, write nothing
 *   node build/install-user-skills.mjs --verify   # audit an existing install
 *   node build/install-user-skills.mjs --slim     # omit provenance-only trees
 *   node build/install-user-skills.mjs --uninstall
 */
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync,
} from 'node:fs';
import { join, dirname, relative, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('..', import.meta.url));
const DRY = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');
const SLIM = process.argv.includes('--slim');
const UNINSTALL = process.argv.includes('--uninstall');

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const TARGET = join(HOME, 'skills');
const MANIFEST = join(TARGET, '.ars-user-skills.json');
const GENERATOR = 'academic-research-skills-dsh';

const SKILL_DIRS = ['deep-research', 'academic-paper', 'academic-paper-reviewer', 'academic-pipeline', 'sr-screener'];
/** Root-level trees the skill bodies reference, copied alongside the bundles. */
const RESOURCE_DIRS = ['shared', 'scripts', 'docs', 'evals', 'examples', 'audits'];
/** Trees that carry provenance only; omitted by `--slim`. */
const PROVENANCE_DIRS = new Set(['docs', 'examples', 'audits', 'evals']);
/** Root-level files the bodies, or the licence, require. */
const ROOT_FILES = ['MODE_REGISTRY.md', 'CHANGELOG.md', 'POSITIONING.md', 'LICENSE', 'NOTICE.md', 'CITATION.cff'];

/** A path-like token: at least one `/` and a known file extension. */
const PATH_RE = /(?<![\w./-])((?:[\w.@-]+\/)+[\w.@-]+\.(?:md|json|py|sh|mjs|js|ya?ml|tex|toml|cff|csv|ris|nbib|txt))/g;
const IGNORE_PREFIXES = ['http', 'www', 'github.com', 'doi.org', 'arxiv.org', 'zenodo.org'];
const TEXT_EXT = new Set(['.md']);
/** Paths the agents create at RUN time; absent here by design, not dangling. */
const RUNTIME_PATH_RE = /^(phase0|phase1|phase2|phase2_investigation|phase4_composition|phase6|phase6_revision|audit_artifacts|artifacts|batches|chapter_4|results|S|GUARD)\//;

/**
 * Paths that legitimately resolve nowhere in an install, each with its reason.
 * Mirrors `build/audit-refs.mjs`'s classifier so the package-level audit and the
 * install audit agree on what "clean" means; only an UNEXPLAINED miss fails.
 */
const EXPECTED_ABSENT = [
  { re: /(^|[^.\w])\.github\//, reason: 'upstream CI workflow, deliberately not installed' },
  { re: /(^|[^.\w])\.claude-plugin\//, reason: 'Claude Code plugin packaging, deliberately not installed' },
  { re: /(^|[^.\w])\.claude\//, reason: 'Claude-Code-compatible repo doc, plugin-only' },
  { re: /(^|[^.\w])tests\//, reason: "upstream's own test suite, not part of the methodology" },
  { re: /(^|[^.\w])plugin-evals/, reason: 'Claude Code plugin eval suites, not applicable to DSH' },
  { re: /(^|[^.\w])pi\//, reason: 'community Pi-port wrapper, not part of the methodology' },
  { re: /(^|[^.\w])hooks\//, reason: 'DSH has no hook system; hooks are deliberately not ported' },
  { re: /(^|[^.\w])lib\/startup\.js$/, reason: "this plugin's own registrar — not part of a user-skills install" },
  { re: /^references\/invariants\.md$/, reason: 'names a file of a third-party project, not this repo' },
  { re: /^scripts\/plot_fig3\.py$/, reason: 'illustrative example path in a worked example' },
  { re: /^v2\//, reason: 'external MCP-style protocol path, not a repo file' },
  { re: /^evals\//, reason: 'only the referenced eval subtree is bundled' },
  { re: /^audits\//, reason: 'upstream audit reports referenced by CHANGELOG prose' },
  { re: /^docs\/changelog-archive\//, reason: 'historical changelog snapshots' },
];
const expectedReason = (token) => EXPECTED_ABSENT.find((e) => e.re.test(token))?.reason;

const posix = (p) => p.split(sep).join('/');
const say = (msg) => console.log(msg);

say(`${GENERATOR} → user skills`);
say(`  source: ${SOURCE}`);
say(`  target: ${TARGET}${SLIM ? '  (slim)' : ''}${DRY ? '  (dry run)' : ''}${VERIFY ? '  (verify only)' : ''}${UNINSTALL ? '  (uninstall)' : ''}`);

/** Read the ownership manifest written by a previous run. */
function readManifest() {
  if (!existsSync(MANIFEST)) return null;
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    return parsed?.generator === GENERATOR && Array.isArray(parsed.paths) ? parsed : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- uninstall ------
if (UNINSTALL) {
  const manifest = readManifest();
  if (!manifest) {
    say('\nNothing to uninstall: no ownership manifest found.');
    process.exit(0);
  }
  if (!DRY) {
    for (const rel of manifest.paths) rmSync(join(TARGET, rel), { force: true });
    rmSync(MANIFEST, { force: true });
    pruneEmptyDirs();
  }
  say(`\nremoved ${manifest.paths.length} file(s) recorded in the manifest (your own skills were untouched).`);
  process.exit(0);
}

// ---------------------------------------------------------------- plan ------
/** Build the explicit {source, dest} copy list plus the desired path set. */
function buildPlan() {
  const items = [];
  const wanted = new Set();

  const addTree = (rel) => {
    const root = join(SOURCE, rel);
    if (!existsSync(root)) return;
    for (const file of walkFiles(root)) {
      const relInTarget = posix(relative(SOURCE, file));
      items.push({ from: file, to: join(TARGET, relInTarget) });
      wanted.add(relInTarget);
    }
  };

  for (const dir of SKILL_DIRS) addTree(dir);
  for (const dir of RESOURCE_DIRS) {
    if (SLIM && PROVENANCE_DIRS.has(dir)) continue;
    addTree(dir);
  }
  for (const file of ROOT_FILES) {
    if (!existsSync(join(SOURCE, file))) continue;
    items.push({ from: join(SOURCE, file), to: join(TARGET, file) });
    wanted.add(file);
  }
  // Command wrappers become FLAT files at the root: `<root>/ars-x.md`.
  for (const entry of readdirSync(join(SOURCE, 'commands')).sort()) {
    if (!entry.endsWith('.md')) continue;
    items.push({ from: join(SOURCE, 'commands', entry), to: join(TARGET, entry) });
    wanted.add(entry);
  }
  return { items, wanted };
}

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function pruneEmptyDirs() {
  const prune = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        prune(full);
        if (readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true });
      }
    }
  };
  prune(TARGET);
}

const { items, wanted } = buildPlan();
const bytes = items.reduce((sum, item) => sum + statSync(item.from).size, 0);
say(`\nplan: ${items.length} file(s), ${(bytes / 1048576).toFixed(2)} MB`);

// ------------------------------------------------------ stale cleanup -------
const previous = readManifest();
const stale = previous ? previous.paths.filter((p) => !wanted.has(p)) : [];
if (previous) say(`  previous install: ${previous.paths.length} file(s); ${stale.length} now stale`);
if (stale.length && !DRY && !VERIFY) {
  for (const rel of stale) rmSync(join(TARGET, rel), { force: true });
}

// ------------------------------------------------------------- verify -------
/**
 * Resolve every reference the way the model plausibly will, and report only the
 * ones that resolve NOWHERE.
 *
 * Upstream mixes three conventions, sometimes inside one line:
 *   - backticked prose paths are repo-root-relative  -> `shared/x.md`
 *   - Markdown hrefs are relative to the REFERRING file -> ``[`shared/x.md`](../../shared/x.md)``
 *   - bare resource paths are relative to the skill directory -> `references/x.md`
 * A single-anchor audit therefore reports false failures, so each reference is
 * tried against the applicable candidate set:
 *
 *   href        -> referring file's directory
 *   prose path  -> the anchor the model was given, then the referring file's
 *                  directory, then the install root, then `shared/contracts/`
 *
 * SCOPE mirrors the package-level audit (`build/audit-refs.mjs`): the five skill
 * bundles, `shared/`, and the root-level flat files. `docs/`, `evals/`,
 * `examples/` and `audits/` are upstream provenance that the model does not load
 * at run time, and their internal links are upstream's concern — auditing them
 * would drown the real signal. Resource-tree Markdown is read from INSIDE a
 * skill, so it is resolved against a skill anchor (any of them: `../` always
 * lands on the install root).
 *
 * @returns {Map<string, Set<string>>} token -> referring files.
 */
function audit() {
  const problems = new Map();
  const note = (token, file) => {
    if (RUNTIME_PATH_RE.test(token) || token.includes('...')) return;
    if (!problems.has(token)) problems.set(token, new Set());
    problems.get(token).add(posix(relative(TARGET, file)));
  };
  const scanFile = (file, anchor) => {
    const text = readFileSync(file, 'utf8');
    const fileDir = posix(relative(TARGET, dirname(file)));
    for (const match of text.matchAll(PATH_RE)) {
      const token = match[1];
      if (IGNORE_PREFIXES.some((p) => token.toLowerCase().startsWith(p))) continue;
      const isHref = /\]\(\s*$/.test(text.slice(Math.max(0, match.index - 2), match.index));
      const candidates = isHref
        ? [join(TARGET, fileDir, token)]
        : [
            join(TARGET, anchor, token),
            join(TARGET, fileDir, token),
            join(TARGET, token),
            join(TARGET, 'shared', 'contracts', token),
          ];
      if (candidates.some((candidate) => existsSync(candidate))) continue;
      note(token, file);
    }
  };

  for (const skill of SKILL_DIRS) {
    const dir = join(TARGET, skill);
    if (!existsSync(dir)) continue;
    for (const file of walkFiles(dir)) if (TEXT_EXT.has(extname(file))) scanFile(file, skill);
  }
  // `shared/` is read from inside a skill, so its anchor is a skill directory.
  const sharedAnchor = SKILL_DIRS.find((s) => existsSync(join(TARGET, s))) ?? '';
  const sharedRoot = join(TARGET, 'shared');
  if (existsSync(sharedRoot)) {
    for (const file of walkFiles(sharedRoot)) {
      if (TEXT_EXT.has(extname(file))) scanFile(file, sharedAnchor);
    }
  }
  // Root-level SKILL files only: the flat `/ars-*` wrappers carry frontmatter and
  // are anchored at TARGET itself. Root-level PROSE (`CHANGELOG.md`,
  // `MODE_REGISTRY.md`, `POSITIONING.md`) is upstream documentation whose path
  // mentions are written from a skill's perspective and are not run-time
  // instructions — auditing them would only produce noise, exactly as the
  // package-level audit excludes `docs/`.
  for (const entry of existsSync(TARGET) ? readdirSync(TARGET) : []) {
    if (!entry.endsWith('.md')) continue;
    const file = join(TARGET, entry);
    if (!readFileSync(file, 'utf8').startsWith('---')) continue;
    scanFile(file, '');
  }
  return problems;
}

if (VERIFY) {
  const problems = audit();
  const explained = [...problems.entries()].filter(([token]) => expectedReason(token));
  const unexplained = [...problems.entries()].filter(([token]) => !expectedReason(token));
  say(`\nverify — ${problems.size} unresolved token(s): ${explained.length} explained, ${unexplained.length} unexplained`);
  for (const [token, where] of explained.slice(0, 5)) {
    say(`  [expected] ${token} — ${expectedReason(token)}`);
  }
  for (const [token, where] of unexplained.slice(0, 15)) {
    say(`  UNEXPLAINED ${token}\n      ${[...where].slice(0, 3).join(', ')}`);
  }
  say(unexplained.length ? '\nFAILED' : 'OK — every reference either resolves or is an explained absence.');
  process.exitCode = unexplained.length ? 1 : 0;
  process.exit();
}

// ------------------------------------------------------------- install ------
if (!DRY) {
  for (const item of items) {
    mkdirSync(dirname(item.to), { recursive: true });
    copyFileSync(item.from, item.to);
  }
}

// ------------------------------------------- rewrite the root-anchored refs --
/**
 * Prefix `../` on exactly those references that live at the install root but not
 * in the directory DSH gave the model as this skill's anchor.
 *
 * The anchor is `TARGET/<skill>` for a directory bundle, so a root-level target
 * needs one `../`. Resolution is per reference against the filesystem, so an
 * `examples/x.md` that exists in the skill's own directory is left alone while a
 * root-level `examples/x.md` is rewritten. Already-`../` references are untouched:
 * upstream also writes Markdown hrefs relative to the REFERRING file (e.g.
 * ``[`a/b.md`](../../a/b.md)`` from inside `x/agents/`), and those are correct
 * as-is.
 *
 * @param {string} text - file body.
 * @param {string | null} skillDir - anchor directory relative to TARGET, or null
 *   for a file inside a resource tree, where the anchor is whichever skill is
 *   reading it and therefore always resolves `../` to TARGET.
 * @returns {{out: string, changed: number}} rewritten body and change count.
 */
function rewriteReferences(text, skillDir) {
  let changed = 0;
  const out = text.replace(PATH_RE, (token) => {
    if (IGNORE_PREFIXES.some((p) => token.toLowerCase().startsWith(p))) return token;
    if (token.startsWith('../')) return token;
    // The `/ars-*` wrappers are installed FLAT at the root (the only form DSH
    // discovers as a user skill), so a reference to `commands/ars-x.md` from
    // inside a skill points at the flat file.
    if (token.startsWith('commands/')) {
      const flat = token.slice('commands/'.length);
      if (existsSync(join(TARGET, flat))) {
        changed += 1;
        return flat;
      }
    }
    if (skillDir && existsSync(join(TARGET, skillDir, token))) return token;
    if (existsSync(join(TARGET, token))) {
      changed += 1;
      return `../${token}`;
    }
    return token;
  });
  return { out, changed };
}

/** Roots of the resource trees, used to recognise a resource-file reference. */
const RESOURCE_TREE_ROOTS = new Set(RESOURCE_DIRS);

let rewrittenFiles = 0;
let rewrittenRefs = 0;
if (!DRY) {
  /** Rewrite one installed Markdown file; `anchor` is null for resource trees. */
  const rewriteFile = (file, anchor) => {
    const original = readFileSync(file, 'utf8');
    const { out, changed } = rewriteReferences(original, anchor);
    if (!changed) return;
    writeFileSync(file, out, 'utf8');
    rewrittenFiles += 1;
    rewrittenRefs += changed;
  };

  for (const skill of SKILL_DIRS) {
    for (const file of walkFiles(join(TARGET, skill))) {
      if (TEXT_EXT.has(extname(file))) rewriteFile(file, skill);
    }
  }
  // Resource-tree Markdown is read from inside a skill, so its root-anchored
  // references need the same `../` treatment. `.py` is deliberately skipped: its
  // paths are real code, not model-facing prose.
  for (const dir of RESOURCE_DIRS) {
    const root = join(TARGET, dir);
    if (!existsSync(root)) continue;
    for (const file of walkFiles(root)) {
      if (TEXT_EXT.has(extname(file))) rewriteFile(file, null);
    }
  }

  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        generator: GENERATOR,
        upstream: (JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf8')).description.match(/v\d+\.\d+\.\d+/) ?? [])[0],
        note: 'Ownership manifest for build/install-user-skills.mjs. Paths listed here are removed on update/uninstall; nothing else in this directory is touched.',
        paths: [...wanted].sort(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

// ------------------------------------------------------------- report -------
say(
  DRY
    ? '\n(dry run — nothing written)'
    : `\ncopied ${items.length} file(s), rewrote ${rewrittenRefs} reference(s) in ${rewrittenFiles} file(s), wrote the manifest`,
);

if (!DRY) {
  const problems = audit();
  const unexplained = [...problems.entries()].filter(([token]) => !expectedReason(token));
  say(
    `\ninstall audit — ${problems.size} unresolved token(s), of which ${problems.size - unexplained.length} are ` +
      'explained absences (upstream CI / tests / hooks / plugin-only files / illustrative paths)',
  );
  for (const [token, where] of unexplained.slice(0, 12)) {
    say(`  UNEXPLAINED ${token}\n      ${[...where].slice(0, 3).join(', ')}`);
  }
  if (unexplained.length) {
    console.error('\nFAILED — the install leaves references that resolve nowhere; not a usable install.');
    process.exitCode = 1;
  } else {
    say('OK — every reference either resolves under the user-skills anchors or is an explained absence.');
  }
}

say(`
Still to do, because it changes your profile (NOT done here):
  1. Enable the filesystem provider — a web profile ships it \`disabled: true\`
     (patched by @deepseek-ai/dsh-web-app), so nothing under ${TARGET} is scanned
     until you re-enable it in ${join(HOME, 'profiles', 'web', 'cordis.patch.yml')}:
         - id: skill-filesystem
           disabled: false
  2. Drop the plugin, or the same names are published twice and the user-skills
     copy (rank 400) silently shadows the plugin copy (rank 600):
         dsh plugin --profile web remove academic-research-skills-dsh
  3. Restart \`dsh web\`; the skills should then appear under
     "用户技能（~/.dsh/skills）" in the skill explorer.
`);
