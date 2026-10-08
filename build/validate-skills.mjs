#!/usr/bin/env node
/**
 * validate-skills.mjs — structural validation of the DSH port.
 *
 * Four checks, all deterministic and host-free:
 *
 *   1. REGISTRATION — loads `lib/startup.js` against a mock `ctx.skills` and
 *      asserts what a real DSH host would receive: 5 model-invocable skills,
 *      one user-invocable-only registration per command, correct invocation
 *      policies, an existing `resourceBase` directory per skill, and a
 *      non-empty body for every registration. This is the closest thing to an
 *      end-to-end test that does not require installing the plugin.
 *   2. FRONTMATTER — every registered name matches its file/directory name and
 *      satisfies the kebab-case grammar the registry enforces.
 *   3. HYGIENE — no Claude-Code-only token survives in a body the model reads
 *      (`${CLAUDE_PLUGIN_ROOT}`, `$ARGUMENTS`, `python3`, a `.claude/` path, a
 *      capitalised Claude tool name).
 *   4. MODE COVERAGE — every mode on the `MODE_REGISTRY.md` tables is reachable
 *      through at least one `/ars-*` command, and every manifest entry names a
 *      mode that actually exists in the registry.
 *
 * Usage:
 *   node build/validate-skills.mjs
 * Exit code is 1 when any check fails.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from './generate-commands.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL_NAMES = ['deep-research', 'academic-paper', 'academic-paper-reviewer', 'academic-pipeline', 'sr-screener'];
/** Wait long enough for the provider's 150 ms watcher debounce to fire. */
const WATCH_SETTLE_MS = 500;

const failures = [];
const notes = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

// --- 1 + 2: registration through the real provider module -------------------
const { default: apply } = await import(new URL('../lib/startup.js', import.meta.url).href);

const controller = new AbortController();
let provider = null;
let invalidations = 0;
const mockCtx = {
  skills: {
    // The registry's provider seam: `registerProvider(create)` hands the
    // provider a lifecycle control and keeps the returned provider.
    registerProvider(create) {
      provider = create({
        signal: controller.signal,
        invalidate: () => {
          invalidations += 1;
        },
      });
      return () => controller.abort();
    },
  },
};

apply(mockCtx);

if (!provider) {
  fail('registration', 'apply() never called ctx.skills.registerProvider');
}

const observation = provider ? await provider.list({}) : { candidates: [] };
const candidates = Array.isArray(observation) ? observation : (observation.candidates ?? []);
if (!Array.isArray(observation) && observation.complete !== true) {
  fail('registration', 'list() must report a complete observation');
}

const skillCandidates = candidates.filter((c) => c.invocation?.modelInvocable === true);
const commandCandidates = candidates.filter((c) => c.invocation?.modelInvocable === false);

if (skillCandidates.length !== SKILL_NAMES.length) {
  fail('registration', `expected ${SKILL_NAMES.length} model-invocable skills, got ${skillCandidates.length}`);
}
if (commandCandidates.length !== COMMANDS.length) {
  fail('registration', `expected ${COMMANDS.length} user-invocable commands, got ${commandCandidates.length}`);
}

// The published skill names must be exactly the five bundles.
const publishedSkills = new Set(skillCandidates.map((c) => c.name));
for (const name of SKILL_NAMES) {
  if (!publishedSkills.has(name)) fail('registration', `skill "${name}" was not published`);
}

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const rootPosix = ROOT.replace(/\\/g, '/');

/** The provider must load each body from disk on every call. */
const loaded = new Map();
for (const candidate of candidates) {
  if (!NAME_RE.test(candidate.name)) fail('frontmatter', `invalid kebab-case name: "${candidate.name}"`);
  if (typeof candidate.description !== 'string' || !candidate.description.length) {
    fail('frontmatter', `${candidate.name}: empty description`);
  }
  if (candidate.provider !== 'academic-research-skills-dsh') {
    fail('registration', `${candidate.name}: unexpected provider "${candidate.provider}"`);
  }
  if (typeof candidate.rank !== 'number') fail('registration', `${candidate.name}: no rank`);
  if (!candidate.locator) fail('registration', `${candidate.name}: no locator`);

  const def = await provider.get(candidate, {});
  if (!def) {
    fail('load', `${candidate.name}: get() returned nothing for an existing file`);
    continue;
  }
  loaded.set(candidate.name, def);

  if (typeof def.content !== 'string' || def.content.trim().length < 40) {
    fail('load', `${candidate.name}: body is empty or implausibly short`);
  }
  if (def.content.startsWith('---')) {
    fail('load', `${candidate.name}: body still contains the frontmatter block`);
  }
  if (def.content.includes('disable-model-invocation')) {
    fail('load', `${candidate.name}: frontmatter leaked into the body`);
  }
  // Proof that the body comes from disk rather than from a captured copy.
  const onDisk = existsSync(def.path) ? readFileSync(def.path, 'utf8') : '';
  const expectedBody = onDisk.slice(onDisk.indexOf('---', 3) + 3).replace(/^\r?\n/, '');
  if (def.content !== expectedBody) {
    fail('load', `${candidate.name}: body is not the current file content (stale cache?)`);
  }
}

// The resource base must name BOTH anchors upstream ARS uses, because a single
// `directory` base mis-resolves either `references/...` or `shared/...`.
for (const [name, def] of loaded) {
  const base = def.resourceBase;
  if (base?.kind !== 'opaque') {
    fail('resourceBase', `${name}: expected an opaque base, got "${base?.kind}"`);
    continue;
  }
  if (!base.description.includes(rootPosix)) {
    fail('resourceBase', `${name}: base does not name the plugin root`);
  }
  const namesOwnDir = base.description.includes('/<this-skill>') || base.description.includes('/commands');
  if (!namesOwnDir) fail('resourceBase', `${name}: base names no skill/command directory`);
  if (!/shared\//.test(base.description)) {
    fail('resourceBase', `${name}: base does not name the shared/ anchor`);
  }
  if (base.description.includes('<this-skill>') && def.invocation.modelInvocable === false) {
    fail('resourceBase', `${name}: a command wrapper must not use the <this-skill> placeholder`);
  }
}

for (const [name, def] of loaded) {
  if (def.invocation.modelInvocable === false && def.invocation.userInvocable !== true) {
    fail('registration', `${name}: a command wrapper must stay user-invocable`);
  }
}

// Every command's named skill must be one of the five bundles.
const declaredSkills = new Set(COMMANDS.map((c) => c.skill).filter(Boolean));
for (const s of declaredSkills) {
  if (!SKILL_NAMES.includes(s)) fail('frontmatter', `command manifest names an unknown skill "${s}"`);
}

// --- 3: hygiene scan over everything the model can load --------------------
const HYGIENE = [
  { re: /\$\{CLAUDE_PLUGIN_ROOT\}/, what: '${CLAUDE_PLUGIN_ROOT}' },
  { re: /\$ARGUMENTS/, what: '$ARGUMENTS' },
  // Only a real invocation counts: `python3 scripts/x.py`. The port's own
  // interpreter-guidance note names the alias in backticks, which must not fire.
  { re: /(?:^|[\s`$|;(])python3\s/, what: 'python3 invocation' },
  { re: /\.claude\//, what: '.claude/ path' },
  // A plugin-namespaced skill name (`plugin:skill`) resolves on neither `/name`
  // nor the `skill` tool: DSH skill names are bare and kebab-case.
  { re: /academic-research-skills:/, what: 'plugin-namespaced skill name' },
  { re: /\bSkill tool\b|\bRead tool\b|\bGrep tool\b|\bAgent tool\b/, what: 'Claude Code tool name' },
  { re: /\bWebSearch\b|\bWebFetch\b/, what: 'Claude Code web tool name' },
  { re: /\bAskUserQuestion\b/, what: 'Claude Code question tool name' },
];

for (const [name, def] of loaded) {
  for (const h of HYGIENE) {
    if (h.re.test(def.content)) fail('hygiene', `${name}: body still contains ${h.what}`);
  }
}

// --- 3b: routing-core cross-copy sync -------------------------------------
// This is the invariant upstream's `scripts/check_routing_core_sync.py` checks.
// That lint also requires a `.claude/CLAUDE.md` carrier, which this port
// deliberately does not ship, so the check lives here instead: the routing core
// is load-bearing (it decides whether a request routes straight to a skill or
// the user is first asked which workflow they want — the failure #133 it
// prevents), so the five SKILL.md copies must stay byte-identical to the
// canonical block.
const ROUTING_CORE = 'shared/references/routing_core.md';
const RC_BEGIN = '<!-- routing-core:begin -->';
const RC_END = '<!-- routing-core:end -->';

/** The marker block of a file, or null when the marker pair is missing. */
function routingCoreBlock(text) {
  const begin = text.indexOf(RC_BEGIN);
  const end = text.indexOf(RC_END);
  if (begin === -1 || end === -1 || end < begin) return null;
  const endLine = text.indexOf('\n', end);
  return text.slice(begin, endLine === -1 ? undefined : endLine);
}

const canonicalBlock = routingCoreBlock(readFileSync(join(ROOT, ROUTING_CORE), 'utf8'));
if (canonicalBlock === null) {
  fail('routing-core', `${ROUTING_CORE} is missing the ${RC_BEGIN} / ${RC_END} marker pair`);
} else {
  let copies = 0;
  for (const skill of SKILL_NAMES) {
    const file = join(ROOT, skill, 'SKILL.md');
    const block = existsSync(file) ? routingCoreBlock(readFileSync(file, 'utf8')) : null;
    if (block === null) {
      fail('routing-core', `${skill}/SKILL.md has no routing-core marker pair`);
      continue;
    }
    if (block !== canonicalBlock) {
      fail('routing-core', `${skill}/SKILL.md routing-core block differs from ${ROUTING_CORE}`);
      continue;
    }
    copies += 1;
  }
  notes.push(`routing-core: ${copies}/${SKILL_NAMES.length} SKILL.md copies byte-identical to ${ROUTING_CORE}`);
}

// --- 3c: package-manifest completeness ------------------------------------
// A git-hosted install (`dsh plugin add github:owner/repo`) is PACKED before it
// is installed, so `package.json.files` decides what a user actually receives —
// and a path that gets packed OUT fails at BOOT, not at install time. That is
// not hypothetical: `cordis.patch.yml` was once missing from `files`, so the
// installed package still declared `dsh.bundle.patch: ./cordis.patch.yml` while
// the file was absent, and `dsh web` died with
//   "failed to read overlay ... cordis.patch.yml: ENOENT"
// The list below is every path the plugin needs to boot and resolve its
// references; the bundle patch is checked separately because the manifest points
// at it by name.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const listed = new Set(pkg.files ?? []);
const REQUIRED_IN_FILES = [
  'lib', // the provider entry point
  'commands', // the /ars-* wrappers
  ...SKILL_NAMES, // the five skill bundles
  'shared',
  'scripts',
  'docs',
  'evals',
  'examples',
  'audits', // trees the skill bodies reference
  'MODE_REGISTRY.md',
];
for (const entry of REQUIRED_IN_FILES) {
  if (!listed.has(entry)) {
    fail('packaging', `package.json "files" omits "${entry}" — a git/npm install would not receive it`);
  }
}
const bundlePatch = (pkg.dsh?.bundle?.patch ?? '').replace(/^\.\//, '');
if (bundlePatch === '') {
  fail('packaging', 'package.json declares no dsh.bundle.patch — dsh would never mount the plugin');
} else {
  if (!listed.has(bundlePatch)) {
    fail('packaging', `dsh.bundle.patch points at "${bundlePatch}", which is not listed in "files"`);
  }
  if (!existsSync(join(ROOT, bundlePatch))) {
    fail('packaging', `dsh.bundle.patch points at "${bundlePatch}", which does not exist`);
  }
}
notes.push(`packaging: "files" covers ${REQUIRED_IN_FILES.length} runtime paths + the bundle patch`);

// --- 4: MODE_REGISTRY coverage --------------------------------------------
const registry = readFileSync(join(ROOT, 'MODE_REGISTRY.md'), 'utf8');
const registryModes = new Map(); // skill -> Set(mode)
let current = null;
for (const line of registry.split(/\r?\n/)) {
  if (line.startsWith('## ')) {
    // Any H2 resets the section, so the trailing `## Summary` tables cannot be
    // attributed to the last skill section.
    const heading = /^## ([a-z-]+) \(/.exec(line);
    current = heading ? heading[1] : null;
    if (current && !registryModes.has(current)) registryModes.set(current, new Set());
    continue;
  }
  if (!current) continue;
  const row = /^\|\s*(.+?)\s*\|/.exec(line);
  if (!row) continue;
  const token = row[1].trim().replace(/^`|`$/g, '').trim();
  // Skip the header row and the `|---|---|` separator.
  if (!token || token === 'Mode' || /^-+$/.test(token)) continue;
  registryModes.get(current).add(token);
}

const covered = new Map(); // skill -> Set(mode)
for (const cmd of COMMANDS) {
  if (!cmd.skill || !cmd.mode) continue;
  if (!covered.has(cmd.skill)) covered.set(cmd.skill, new Set());
  covered.get(cmd.skill).add(cmd.mode);
}

let totalModes = 0;
for (const [skill, modes] of registryModes) {
  for (const mode of modes) {
    totalModes += 1;
    if (!covered.get(skill)?.has(mode)) {
      fail('coverage', `MODE_REGISTRY mode "${skill} / ${mode}" has no /ars-* command`);
    }
  }
}
for (const [skill, modes] of covered) {
  for (const mode of modes) {
    if (!registryModes.get(skill)?.has(mode)) {
      fail('coverage', `command manifest declares "${skill} / ${mode}", which MODE_REGISTRY does not list`);
    }
  }
}

// Three commands drive CLIs rather than a mode, so they are expected outside the tables.
const cliCommands = COMMANDS.filter((c) => !c.skill);
notes.push(`${cliCommands.length} command(s) drive a CLI instead of a mode: ${cliCommands.map((c) => c.name).join(', ')}`);

// --- 5: optional live-reload proof -----------------------------------------
// The provider re-publishes the catalog when files change. Proving that means
// writing a file into `commands/`, which a LIVE host would briefly see as a
// phantom command — so this test is opt-in rather than part of the default run.
if (process.env.ARS_DSH_LIVE_RELOAD_TEST === '1') {
  const probe = join(ROOT, 'commands', 'zz-live-reload-probe.md');
  try {
    writeFileSync(
      probe,
      '---\nname: zz-live-reload-probe\ndescription: "temporary provider live-reload probe"\n' +
        'disable-model-invocation: true\nuser-invocable: true\n---\n\nbody long enough to pass the plausibility check in the validator.\n',
      'utf8',
    );
    const after = await provider.list({});
    const names = (Array.isArray(after) ? after : after.candidates).map((c) => c.name);
    if (!names.includes('zz-live-reload-probe')) {
      fail('live-reload', 'a newly written command file did not appear in a fresh list()');
    } else {
      notes.push('live-reload probe: a new command file appeared without re-registering the provider');
    }
    const probeCandidate = (Array.isArray(after) ? after : after.candidates).find(
      (c) => c.name === 'zz-live-reload-probe',
    );
    const probeDef = probeCandidate ? await provider.get(probeCandidate, {}) : undefined;
    if (!probeDef?.content.includes('plausibility check')) {
      fail('live-reload', 'the probe body was not read back from disk');
    }
    // Give the watcher's debounce a chance to fire, so the fs.watch -> invalidate
    // wiring is observed rather than assumed.
    await new Promise((resolve) => setTimeout(resolve, WATCH_SETTLE_MS));
    if (invalidations === 0) {
      notes.push('live-reload probe: fs.watch reported nothing (platform-dependent; list() still re-reads)');
    } else {
      notes.push(`live-reload probe: watcher invalidated the catalog ${invalidations}× without a restart`);
    }
  } finally {
    rmSync(probe, { force: true });
    const after = await provider.list({});
    const names = (Array.isArray(after) ? after : after.candidates).map((c) => c.name);
    if (names.includes('zz-live-reload-probe')) {
      fail('live-reload', 'the removed probe file is still published');
    }
  }
}

// Release the provider and its file watchers so the process can exit.
controller.abort();

// --- report ---------------------------------------------------------------
console.log('validate-skills.mjs');
console.log(`  skills published       : ${skillCandidates.length} (${[...publishedSkills].sort().join(', ')})`);
console.log(`  commands published     : ${commandCandidates.length}`);
console.log(`  bodies loaded from disk: ${loaded.size}`);
console.log(`  provider               : ${provider?.name ?? '(none)'} · rank ${candidates[0]?.rank ?? '?'}`);
console.log(`  MODE_REGISTRY modes     : ${totalModes} across ${registryModes.size} skills`);
console.log(`  modes covered by command: ${[...covered.values()].reduce((n, s) => n + s.size, 0)}`);
for (const n of notes) console.log(`  note: ${n}`);

if (failures.length) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nOK — provider, frontmatter, resource anchors, hygiene, and mode coverage all pass.');
}
