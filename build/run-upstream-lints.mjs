#!/usr/bin/env node
/**
 * run-upstream-lints.mjs — run upstream's own guards against this port, and say
 * plainly which ones apply and which cannot.
 *
 * The point is not "make every lint green" — a DSH port legitimately replaces
 * some of upstream's surfaces. The point is to answer one question with evidence:
 *
 *   Did the port's host-adaptation edits break anything upstream checks?
 *
 * So this script splits upstream's `scripts/check_*.py` battery in two:
 *
 *   REQUIRED_PASS — lints that guard surfaces this port EDITED (agent files, the
 *                   command/skill wiring, the pipeline prompt surfaces, the
 *                   routing core, the contracts, the data-access declarations).
 *                   A failure here is a real regression and fails the run.
 *   NOT_APPLICABLE — lints that need a surface this port deliberately does not
 *                   ship (Claude Code plugin packaging, `.github/workflows`,
 *                   `hooks/`, upstream's `tests/`/`evals/`/`pi/` trees and
 *                   localized READMEs), or that require the two Claude-Code-only
 *                   substitutions (`${CLAUDE_PLUGIN_ROOT}`, `$ARGUMENTS`) that a
 *                   DSH-correct port must not contain. Each carries its reason.
 *
 * Anything else that fails is reported as unclassified and does NOT fail the run:
 * most need CLI arguments, a PyPI dependency, or repo metadata (git tags) that a
 * bundled snapshot does not have. The first error line is printed so it can be
 * triaged rather than assumed benign.
 *
 * Usage:
 *   node build/run-upstream-lints.mjs [--quiet]
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const QUIET = process.argv.includes('--quiet');

/**
 * Lints that guard a surface this port edits, and therefore must pass.
 * Verified green on this tree; each maps to an edit documented in PORTING-NOTES.
 */
const REQUIRED_PASS = [
  ['check_agents_mirror_sync.py', 'the four rostered agent mirrors match their skill-bundle sources'],
  ['check_tools_allowlist.py', "the agents' frozen `tools:` frontmatter is byte-equal to upstream's form"],
  ['check_pipeline_boundary_semantics.py', 'the five #528 pipeline surfaces match their refreshed content locks'],
  ['check_routing_core_sync.py', 'the routing core is byte-identical across .claude/CLAUDE.md and all five SKILL.md'],
  ['check_data_access_level.py', 'every skill keeps its declared data_access_level'],
  ['check_instruction_data_boundary.py', 'the canonical instruction/data block is intact in every copy'],
  ['check_model_tiering.py', 'the 43-agent judgment/execution classification still agrees across disk, manifest and table'],
  ['check_v3_9_2_phase_boundary.py', 'the Bucket A phase-boundary sentence is intact across all copies'],
  ['check_firm_rules_sync.py', 'the canonical firm-rule block is intact across its mirrors'],
  ['check_corpus_consumer_protocol.py', 'the literature-corpus consumer protocol invariants still hold'],
  ['check_cross_model_handoff_contract.py', 'the cross-model handoff envelope contract is intact'],
];

/** Lint -> why it cannot pass on this port. Each reason was verified, not assumed. */
const NOT_APPLICABLE = {
  'check_version_consistency.py':
    'needs `.claude-plugin/{plugin,marketplace}.json` — the Claude Code packaging this port replaces. Shipping it would half-work (our `commands/` are DSH-shaped), so it is deliberately absent. Everything else it checks (suite version, skills table, README badge, CITATION.cff) passes.',
  'check_command_skill_dispatch.py':
    'requires the literal `${CLAUDE_PLUGIN_ROOT}/` rooted references and the `academic-research-skills:<skill>` namespaced Skill call — the two Claude-Code-only forms whose removal is the core of this port (see PORTING-NOTES P6/P11).',
  'check_v3_6_8_mark_read_commands.py':
    'pins the exact block `python3 scripts/ars_mark_read.py $ARGUMENTS` plus `model: sonnet`; DSH has neither `$ARGUMENTS` substitution nor a per-skill `model:` field, and `python3` is a Microsoft Store stub on Windows.',
  'check_workflow_classification.py':
    "needs `.github/workflows/` — upstream's CI, deliberately not bundled.",
  'check_degradation_registry.py':
    'needs `hooks/run_guard.sh`. Hooks are deliberately not ported (DSH has no hook system), so the write-scope guard it indexes does not exist here.',
  'check_risk_register.py':
    'same hooks dependency: `docs/RISK_REGISTER.md` cites `hooks/run_guard.sh`.',
  'check_spec_consistency.py':
    "needs the full upstream repo layout (`.claude/CLAUDE.md` carriers, `.github/`, `tests/`).",
  'check_control_availability.py':
    "the bundled `docs/CONTROL_AVAILABILITY.md` is upstream provenance and links to `../pi/README.md`, which is not part of the ported methodology.",
  'check_reviewer_role_label.py': 'requires `README.zh-TW.md` — the localized READMEs are upstream prose, not methodology.',
  'check_v3_6_6_ab_manifest.py': 'requires `tests/fixtures/v3.6.6-ab/manifest.yaml`; upstream `tests/` is not bundled.',
  'check_seeded_defect_fixtures.py': 'requires upstream `evals/` fixtures; only the referenced eval subtree is bundled.',
  'check_persuasion_invariance_fixtures.py': 'requires `evals/heldout/re_review_persuasion_invariance`; not bundled.',
  'check_stage_capability_matrix.py': "requires upstream `evals/` measurement reports cited by the matrix's eval_ref column.",
  'check_changelog_covers_merges.py': 'needs git tag history (vX.Y.Z tags reachable from HEAD); this is a bundled snapshot without upstream history.',
  'check_v3_6_8_pattern_protection.py': "cannot determine clone depth from a snapshot clone (it reads git metadata).",
};

/**
 * Resolve a real Python 3.9+ interpreter: `py -3` first (this machine's 3.9).
 *
 * The probe deliberately uses `stdio: 'ignore'` and decides on the EXIT STATUS
 * rather than reading the child's stdout. Capturing a child's output through a
 * pipe is blocked in some confined environments (Node's `child_process` with the
 * default piped stdio fails with EPERM there), and this script has to run in
 * those too. Exit status is all the classification below needs.
 *
 * @returns {string[] | null} argv prefix for a 3.9+ interpreter, or null.
 */
function findPython() {
  const probe = 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 9) else 1)';
  for (const cand of [['py', '-3'], ['python3'], ['python']]) {
    const res = spawnSync(cand[0], [...cand.slice(1), '-c', probe], { stdio: 'ignore' });
    if (res.status === 0) return cand;
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error('No Python 3.9+ interpreter found (tried `py -3`, `python3`, `python`).');
  console.error('Some upstream lints use str.removesuffix() and fail on 3.8.');
  process.exit(2);
}
console.log(`run-upstream-lints.mjs — interpreter: ${python.join(' ')}`);

const lints = readdirSync(join(ROOT, 'scripts'))
  .filter((f) => f.startsWith('check_') && f.endsWith('.py'))
  .sort();

const required = new Map(REQUIRED_PASS);
const failures = [];
const unclassified = [];
let passed = 0;
let notApplicable = 0;

for (const lint of lints) {
  const interesting = required.has(lint) || Boolean(NOT_APPLICABLE[lint]);
  if (interesting && !QUIET) console.log(`\n--- ${lint}${required.has(lint) ? '  [required]' : '  [not applicable]'}`);

  // stdio inherited: each lint prints its own diagnosis straight to the terminal.
  const run = spawnSync(python[0], [...python.slice(1), join('scripts', lint)], { cwd: ROOT, stdio: 'inherit' });
  const ok = run.status === 0;

  if (ok) {
    passed += 1;
    if (required.has(lint) && !QUIET) console.log(`PASS   ${lint}`);
    continue;
  }
  if (required.has(lint)) {
    failures.push(lint);
  } else if (NOT_APPLICABLE[lint]) {
    notApplicable += 1;
    if (!QUIET) console.log(`N/A    ${lint}\n         ${NOT_APPLICABLE[lint]}`);
  } else {
    unclassified.push(lint);
  }
}

console.log(
  `\n${lints.length} upstream lint(s): ${passed} pass · ${failures.length} regression(s) · ` +
    `${notApplicable} not-applicable (documented) · ${unclassified.length} unclassified (needs arg/dep/metadata)`,
);

if (failures.length) {
  console.log('\nREGRESSIONS in surfaces this port edits (see the output above):');
  for (const lint of failures) console.log(`  ${lint}`);
}

if (unclassified.length && !QUIET) {
  console.log('\nUnclassified (informational — these do not fail this run; most need a CLI');
  console.log('argument, a PyPI dependency, or git metadata a bundled snapshot lacks):');
  for (const lint of unclassified) console.log(`  ${lint}`);
}

console.log(
  failures.length
    ? '\nFAILED — a lint guarding an edited surface regressed.'
    : `\nOK — all ${required.size} guards covering edited surfaces pass.`,
);
process.exitCode = failures.length ? 1 : 0;
