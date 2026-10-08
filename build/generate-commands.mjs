#!/usr/bin/env node
/**
 * generate-commands.mjs — build the /ars-* user-invocable command set.
 *
 * DSH has no slash-command argument substitution and no plugin-root variable, so
 * an upstream Claude Code command file cannot be used as-is. This generator is
 * the single source of truth for the command layer:
 *
 *   - the 16 upstream command names are PRESERVED (so upstream docs and habit keep
 *     working) and their upstream mode instructions are carried over, cleaned of
 *     `${CLAUDE_PLUGIN_ROOT}` / `$ARGUMENTS` / `python3`;
 *   - the 20 remaining modes on the MODE_REGISTRY table get a NEW wrapper, so all
 *     35 modes are reachable by name instead of only 16.
 *
 * Wrappers are written FLAT (`commands/<name>.md`), exactly like upstream's own
 * `commands/` directory, because upstream Markdown refers to them by that path
 * (e.g. `commands/ars-abstract.md`).
 *
 * Usage:
 *   node build/generate-commands.mjs [--check]
 *     --check  verify the committed wrappers match the generator, write nothing
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'commands');
const SRC_DIR = join(ROOT, 'commands-src');
const CHECK = process.argv.includes('--check');

const SKILL_SECTION = {
  'deep-research': 'deep-research',
  'academic-paper': 'academic-paper',
  'academic-paper-reviewer': 'academic-paper-reviewer',
  'academic-pipeline': 'academic-pipeline',
  'sr-screener': 'sr-screener',
};

/**
 * The command manifest — exported so `build/validate-skills.mjs` can check that
 * every MODE_REGISTRY mode is reachable by name. `from` names an upstream wrapper
 * whose body is reused; entries without it are new wrappers for modes upstream
 * never exposed.
 */
export const COMMANDS = [
  // ---- preserved upstream commands (16) --------------------------------------
  // `/ars-full` is the FULL PIPELINE upstream, not academic-paper's `full` mode:
  // its body reads "Trigger the `academic-pipeline` orchestrator ... executes the
  // complete academic research workflow (10-stage orchestration)". Mapping it to
  // academic-paper would silently hand a user who asked for the whole pipeline
  // only the writing stage, so this target is load-bearing.
  { name: 'ars-full', skill: 'academic-pipeline', mode: '(pipeline)', from: 'ars-full', desc: 'ARS full pipeline — research → write → integrity → review → revise → finalize (10 stages)' },
  // academic-paper's own `full` mode still needs an explicit entry point (upstream
  // reaches it only through trigger words), so this port adds one.
  { name: 'ars-paper-full', skill: 'academic-paper', mode: 'full', desc: 'ARS academic-paper `full` mode — write a complete paper draft', needs: 'the paper topic or your research materials' },
  { name: 'ars-plan', skill: 'academic-paper', mode: 'plan', from: 'ars-plan', desc: 'ARS academic-paper `plan` mode — Socratic chapter-by-chapter planning' },
  { name: 'ars-outline', skill: 'academic-paper', mode: 'outline-only', from: 'ars-outline', desc: 'ARS academic-paper `outline-only` mode — detailed outline + evidence map' },
  { name: 'ars-abstract', skill: 'academic-paper', mode: 'abstract-only', from: 'ars-abstract', desc: 'ARS academic-paper `abstract-only` mode — bilingual abstract + keywords' },
  { name: 'ars-revision', skill: 'academic-paper', mode: 'revision', from: 'ars-revision', desc: 'ARS academic-paper `revision` mode — revised draft + point-by-point responses' },
  { name: 'ars-revision-coach', skill: 'academic-paper', mode: 'revision-coach', from: 'ars-revision-coach', desc: 'ARS academic-paper `revision-coach` mode — parse reviews into a revision roadmap' },
  { name: 'ars-lit-review', skill: 'academic-paper', mode: 'lit-review', from: 'ars-lit-review', desc: 'ARS academic-paper `lit-review` mode — annotated bibliography as a paper' },
  { name: 'ars-format-convert', skill: 'academic-paper', mode: 'format-convert', from: 'ars-format-convert', desc: 'ARS academic-paper `format-convert` mode — LaTeX / DOCX / PDF / MD output' },
  { name: 'ars-citation-check', skill: 'academic-paper', mode: 'citation-check', from: 'ars-citation-check', desc: 'ARS academic-paper `citation-check` mode — citation error report' },
  { name: 'ars-disclosure', skill: 'academic-paper', mode: 'disclosure', from: 'ars-disclosure', desc: 'ARS academic-paper `disclosure` mode — venue-specific AI usage statement' },
  { name: 'ars-rebuttal-audit', skill: 'academic-paper', mode: 'rebuttal-audit', from: 'ars-rebuttal-audit', desc: 'ARS academic-paper `rebuttal-audit` mode — advisory QA of a rebuttal draft' },
  { name: 'ars-reviewer', skill: 'academic-paper-reviewer', mode: 'full', from: 'ars-reviewer', desc: 'ARS academic-paper-reviewer `full` mode — 5-seat peer review panel + editorial decision' },
  { name: 'ars-3w', skill: 'deep-research', mode: 'three-way-scan', from: 'ars-3w', desc: 'ARS deep-research `three-way-scan` mode — WHY/HOW/WHAT paper shortlist' },
  { name: 'ars-cache-invalidate', skill: null, mode: null, from: 'ars-cache-invalidate', desc: 'ARS /ars-cache-invalidate — drop cached citation-verification entries for one key', script: true },
  { name: 'ars-mark-read', skill: null, mode: null, from: 'ars-mark-read', desc: 'ARS /ars-mark-read — record a user-attested reading signal for citation keys', script: true },
  { name: 'ars-unmark-read', skill: null, mode: null, from: 'ars-unmark-read', desc: 'ARS /ars-unmark-read — withdraw a recorded reading signal', script: true },

  // ---- deep-research modes upstream never exposed (7) -----------------------
  { name: 'ars-dr-full', skill: 'deep-research', mode: 'full', desc: 'ARS deep-research `full` mode — complete APA 7.0 research report (3,000–8,000 words)', needs: 'the research topic or question' },
  { name: 'ars-dr-quick', skill: 'deep-research', mode: 'quick', desc: 'ARS deep-research `quick` mode — a fast research brief (500–1,500 words)', needs: 'the topic or question to brief' },
  { name: 'ars-dr-review', skill: 'deep-research', mode: 'review', desc: 'ARS deep-research `review` mode — reviewer report on a supplied text or source', needs: 'the text, paper, or source to review' },
  { name: 'ars-dr-lit-review', skill: 'deep-research', mode: 'lit-review', desc: 'ARS deep-research `lit-review` mode — annotated bibliography + synthesis (research side, not a lit-review paper)', needs: 'the topic and, ideally, the scope boundaries' },
  { name: 'ars-dr-fact-check', skill: 'deep-research', mode: 'fact-check', desc: 'ARS deep-research `fact-check` mode — claim-by-claim verification report', needs: 'the claims to verify' },
  { name: 'ars-dr-systematic-review', skill: 'deep-research', mode: 'systematic-review', desc: 'ARS deep-research `systematic-review` mode — PRISMA 2020 report (5,000–15,000 words)', needs: 'the review question and, ideally, the inclusion/exclusion criteria' },
  { name: 'ars-dr-socratic', skill: 'deep-research', mode: 'socratic', desc: 'ARS deep-research `socratic` mode — guided dialogue to a Research Plan Summary (very high oversight)' },

  // ---- reviewer modes upstream never exposed (5) ---------------------------
  { name: 'ars-reviewer-re-review', skill: 'academic-paper-reviewer', mode: 're-review', desc: 'ARS reviewer `re-review` mode — verify revisions, residual issues, R&R traceability', needs: 'the revised draft, the original draft, and the round-1 review' },
  { name: 'ars-reviewer-quick', skill: 'academic-paper-reviewer', mode: 'quick', desc: 'ARS reviewer `quick` mode — journal-fit quick assessment + key issues', needs: 'the manuscript' },
  { name: 'ars-reviewer-methodology', skill: 'academic-paper-reviewer', mode: 'methodology-focus', desc: 'ARS reviewer `methodology-focus` mode — in-depth methodology review', needs: 'the manuscript' },
  { name: 'ars-reviewer-guided', skill: 'academic-paper-reviewer', mode: 'guided', desc: 'ARS reviewer `guided` mode — Socratic issue-by-issue improvement dialogue', needs: 'the manuscript' },
  { name: 'ars-reviewer-calibration', skill: 'academic-paper-reviewer', mode: 'calibration', desc: 'ARS reviewer `calibration` mode — measure this reviewer against your gold set', needs: 'your gold set (papers with known review outcomes)' },

  // ---- pipeline (2) --------------------------------------------------------
  // Explicit alias of `/ars-full`, which upstream already targets at the
  // orchestrator; both names reach the same mode.
  { name: 'ars-pipeline', skill: 'academic-pipeline', mode: '(pipeline)', desc: 'ARS academic-pipeline — the 10-stage orchestrator (alias of /ars-full)' },
  { name: 'ars-resume', skill: 'academic-pipeline', mode: 'resume_from_passport=<hash>', desc: 'ARS academic-pipeline `resume_from_passport` mode — resume a run from a Material Passport boundary', needs: 'the boundary hash, printed by a run started with ARS_PASSPORT_RESET=1' },

  // ---- sr-screener modes (8) ----------------------------------------------
  { name: 'ars-sr-protocol', skill: 'sr-screener', mode: 'protocol', desc: 'ARS sr-screener `protocol` mode — turn a review proposal into confirmed eligibility rules', needs: 'the review proposal or protocol draft' },
  { name: 'ars-sr-quick', skill: 'sr-screener', mode: 'quick', desc: 'ARS sr-screener `quick` mode — single-reviewer eligibility triage (disclosed as such)', needs: 'the abstract(s) to triage' },
  { name: 'ars-sr-pilot', skill: 'sr-screener', mode: 'pilot', desc: 'ARS sr-screener `pilot` mode — calibrate the screening on seed studies', needs: 'seed studies with known decisions' },
  { name: 'ars-sr-ta-screen', skill: 'sr-screener', mode: 'ta-screen', desc: 'ARS sr-screener `ta-screen` mode — dual-review title/abstract screening', needs: 'the database exports (RIS / nbib / WoS / CSV)' },
  { name: 'ars-sr-ft-screen', skill: 'sr-screener', mode: 'ft-screen', desc: 'ARS sr-screener `ft-screen` mode — full-text screening with one reason per exclusion', needs: 'the full texts of records that advanced' },
  { name: 'ars-sr-adjudicate', skill: 'sr-screener', mode: 'adjudicate', desc: 'ARS sr-screener `adjudicate` mode — third-reviewer suggestions for screening conflicts', needs: 'the conflicting decisions (e.g. a Rayyan export)' },
  { name: 'ars-sr-audit', skill: 'sr-screener', mode: 'audit', desc: 'ARS sr-screener `audit` mode — advisory check of exclusions a senior reviewer would advance', needs: 'the excluded records' },
  { name: 'ars-sr-report', skill: 'sr-screener', mode: 'report', desc: 'ARS sr-screener `report` mode — PRISMA 2020 counts, methods draft, RIS exports, corpus handoff', needs: 'the completed screening' },
];

/** Normalize an upstream command body into a DSH body. */
function cleanUpstreamBody(raw, name) {
  let body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();

  // The upstream bodies open with a Claude-Code-shaped load instruction naming the
  // plugin-namespaced skill. This generator's own lead-in already loads the skill
  // by its DSH name, so the sentence is redundant AND wrong (no `plugin:skill`
  // namespace exists on DSH) — drop it rather than leave a contradiction in place.
  body = body.replace(
    /^First invoke the Skill tool with `skill: "[^"]+"`\. Pass the mode and the user's request described below as its arguments\. Use the loaded skill and its supporting files before producing the result\.\r?\n\r?\n?/m,
    '',
  );
  // Belt and braces: any surviving plugin-namespaced skill name becomes the plain one.
  body = body.replace(/\bacademic-research-skills:/g, '');

  // `MODE_REGISTRY.md` and `<skill>/SKILL.md` are plugin-root-relative here, so the
  // Claude Code plugin-root variable must go rather than be replaced. Handle both
  // forms: used as a path prefix, and named bare in prose.
  body = body.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\//g, '');
  body = body.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, 'the plugin root');
  body = body.replace(
    /Resolve plugin resources from `the plugin root`, not from/g,
    "Resolve plugin resources (references/, agents/, templates/, scripts/, shared/) from this plugin's root directory, not from",
  );

  // DSH has no slash-command argument substitution.
  body = body.replace(/\$ARGUMENTS/g, '<args from the user\'s message>');

  // Keep the interpreter convention consistent with the rest of the port.
  body = body.replace(/\bpython3\b/g, 'python');

  // Drop upstream's own footer lines; this generator emits one uniform footer.
  body = body
    .split(/\r?\n/)
    .filter((line) => !/^Mode reference: /.test(line) && !/^Skill entry: /.test(line))
    .join('\n')
    .trim();

  // Collapse the blank-line run left behind by the paragraph removal above.
  body = body.replace(/\n{3,}/g, '\n\n');

  return body;
}

/** Build one wrapper file's full text. */
function renderCommand(cmd) {
  const lines = [];
  lines.push('---');
  lines.push(`name: ${cmd.name}`);
  lines.push(`description: ${JSON.stringify(cmd.desc)}`);
  lines.push('disable-model-invocation: true');
  lines.push('user-invocable: true');
  lines.push('---');
  lines.push('');

  if (cmd.skill) {
    lines.push(
      `The user invoked \`/${cmd.name}\`. Call the \`skill\` tool with name \`${cmd.skill}\` to load that skill ` +
        '(skip this step if it is already loaded in this session), then run the mode below. ' +
        'This wrapper is a pointer, not the instructions: the authoritative text for the mode is ' +
        `\`${cmd.skill}/SKILL.md\`.`,
    );
    lines.push('');
    lines.push(`**Mode:** \`${cmd.mode}\` (skill \`${cmd.skill}\`)`);
    lines.push('');
  } else {
    lines.push(
      `The user invoked \`/${cmd.name}\`. This command drives the ported ARS Python CLI directly; ` +
        'it does not load a skill first.',
    );
    lines.push('');
  }

  if (cmd.needs) {
    lines.push(`**Input this mode needs:** ${cmd.needs}. If the user has not supplied it, ask for it in those terms before starting.`);
    lines.push('');
  }

  if (cmd.from) {
    const srcPath = join(SRC_DIR, `${cmd.from}.md`);
    if (!existsSync(srcPath)) {
      throw new Error(`commands-src/${cmd.from}.md is missing — cannot preserve upstream mode instructions`);
    }
    lines.push('---');
    lines.push('');
    lines.push(cleanUpstreamBody(readFileSync(srcPath, 'utf8'), cmd.name));
    lines.push('');
  } else {
    lines.push('---');
    lines.push('');
    lines.push(
      `Read \`${cmd.skill}/SKILL.md\` and follow its instructions for the \`${cmd.mode}\` mode exactly as written, ` +
        'together with any reference files that mode names. Do not improvise a shorter procedure.',
    );
    lines.push('');
  }

  if (cmd.script) {
    lines.push('**Interpreter and arguments (DSH).** This plugin bundles the upstream `scripts/` directory, so the CLI is present at the plugin root.');
    lines.push('Resolve a real interpreter — `py -3` on Windows, otherwise `python`, otherwise `python3`.');
    lines.push('On Windows `python3` is frequently a 0-byte Microsoft Store stub that fails before the script runs, so prefer `py -3`.');
    lines.push("DSH does not substitute slash-command arguments: take the citation key(s) and paths from the user's own message.");
    lines.push('');
  }

  if (cmd.skill) {
    lines.push(`Mode reference: \`MODE_REGISTRY.md\` § ${SKILL_SECTION[cmd.skill]}.`);
    lines.push(`Skill entry: \`${cmd.skill}/SKILL.md\`.`);
  } else {
    lines.push('Mode reference: `MODE_REGISTRY.md`.');
  }
  lines.push('');
  lines.push(
    'Ported from the ARS Claude Code plugin (Imbad0202/academic-research-skills, v3.23.0, CC-BY-NC-4.0). ' +
      'The deterministic tooling these commands call (`scripts/`, `shared/`, `MODE_REGISTRY.md`) is bundled in this plugin.',
  );
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------- run ------
function main() {
  if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });

  const names = new Set();
  let written = 0;
  let mismatched = 0;

  for (const cmd of COMMANDS) {
    if (names.has(cmd.name)) throw new Error(`duplicate command name in manifest: ${cmd.name}`);
    names.add(cmd.name);
    const text = renderCommand(cmd);
    const target = join(OUT_DIR, `${cmd.name}.md`);
    if (CHECK) {
      const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (existing !== text) {
        mismatched += 1;
        console.error(`DRIFT  commands/${cmd.name}.md`);
      }
      continue;
    }
    writeFileSync(target, text, 'utf8');
    written += 1;
  }

  // Report any committed wrapper the manifest no longer declares.
  const orphans = existsSync(OUT_DIR)
    ? readdirSync(OUT_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.slice(0, -3))
        .filter((n) => !names.has(n))
    : [];

  if (CHECK) {
    console.log(`generate-commands.mjs --check — ${COMMANDS.length} commands declared, ${mismatched} drifted`);
    if (orphans.length) console.log(`orphan wrapper(s) not in the manifest: ${orphans.join(', ')}`);
    process.exitCode = mismatched === 0 && orphans.length === 0 ? 0 : 1;
  } else {
    console.log(`generate-commands.mjs — wrote ${written} wrappers into commands/`);
    console.log(`  ${COMMANDS.filter((c) => c.from).length} preserve upstream mode instructions`);
    console.log(`  ${COMMANDS.filter((c) => !c.from).length} are new wrappers for modes upstream never exposed`);
    if (orphans.length) console.log(`  orphan wrapper(s) left in place: ${orphans.join(', ')}`);
  }
}

// Only run when invoked as a script, so validate-skills.mjs can import the manifest.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
