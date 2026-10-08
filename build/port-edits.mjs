#!/usr/bin/env node
/**
 * port-edits.mjs — the second half of the DSH host adaptation.
 *
 * `normalize-host.mjs` handles token-level, generalizable rewrites. This script
 * handles the handful of prose BLOCKS that assert a Claude Code runtime mechanic
 * this port does not have and that therefore need a rewritten paragraph, not a
 * token swap. Each edit is a literal block replacement keyed by file, and every
 * anchor must appear EXACTLY ONCE or the script fails loudly — so a future
 * upstream re-sync that moves the text is caught instead of silently skipped.
 *
 * ONE-SHOT BY DESIGN. The anchors are consumed by the first successful run, so a
 * second run reports every anchor as missing. That is the intended signal: this
 * script belongs immediately after a fresh upstream copy, in the order
 *
 *   copy upstream -> normalize-host.mjs -> port-edits.mjs -> generate-commands.mjs
 *
 * Run it against an already-edited tree only after restoring the affected files.
 *
 * Usage:
 *   node build/port-edits.mjs            # apply
 *   node build/port-edits.mjs --dry-run  # report only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DRY = process.argv.includes('--dry-run');

const EDITS = [
  {
    id: 'sr-screener/reviewer-install',
    file: 'sr-screener/references/orchestration.md',
    why: 'Claude Code plugin/skills-copy install paths and `.claude/agents/` do not exist on DSH; DSH dispatches a role by passing the agent file as the `subagent` prompt.',
    find: `- **Plugin install** (skill + subagent): \`/plugin marketplace add Imbad0202/academic-research-skills\`,
  then \`/plugin install academic-research-skills\`. The reviewer subagent ships in the plugin's
  \`agents/\` folder and is listed with the plugin prefix:
  \`academic-research-skills:screening_reviewer_agent\`.
- **Skills-copy install** (the \`sr-screener\` folder symlinked or copied into \`~/.dsh/skills/\`):
  also copy \`sr-screener/agents/screening_reviewer_agent.md\` into \`.claude/agents/\` (this
  project) or \`~/.claude/agents/\` (all projects); it is then listed as \`screening_reviewer_agent\`.
- Put the exact agent name shown in the session's agent list into \`agent_type\` in
  \`screening_config.json\`. A wrong name makes every call fail at once, which the pilot shows
  immediately. An empty \`agent_type\` uses the default workflow subagent: it works, but it
  carries more tools and more overhead per call.`,
    replace: `- **Installed with this plugin.** \`sr-screener\` is registered by this package's
  \`lib/startup.js\`, and the reviewer role ships at
  \`sr-screener/agents/screening_reviewer_agent.md\`.
- **How the reviewer role is dispatched.** DSH has no filesystem agent root and no
  \`plugin:agent\` names. Pass the *contents* of
  \`sr-screener/agents/screening_reviewer_agent.md\`, plus one batch prompt from
  \`templates/prompts.md\`, as the \`subagent\` tool's prompt. Set \`agent_type\` in
  \`screening_config.json\` to \`subagent\` (or leave it empty; both dispatch the same tool).
- **Independence is prompt-level here.** DSH's \`subagent\` tool offers one tool set for every
  call, so the upstream tool allowlist is not a runtime fence on this host. Keep the reviewer
  prompt's own restriction ("read and search only; do not browse, do not write files, do not
  look at another reviewer's output") and treat the two-reviewer independence claim as a
  prompt-level instruction, exactly as upstream documents for channels without per-agent
  allowlists.`,
  },
  {
    id: 'sr-screener/workflow-journal-path',
    file: 'sr-screener/references/orchestration.md',
    why: 'The workflow journal path was a Claude Code internal location.',
    find: `4. When it finishes, merge: the journal sits at
   \`~/.claude/projects/<project>/<session>/subagents/workflows/<runId>/journal.jsonl\`. Pass that
   folder, or the whole \`workflows\` folder, to \`merge_decisions.py --from\`.`,
    replace: `4. When it finishes, merge: pass the run's journal file — DSH reports the location of a
   workflow run's journal together with the run — or the whole workflow output folder to
   \`merge_decisions.py --from\`.`,
  },
  {
    id: 'sr-screener/workflow-invocation',
    file: 'sr-screener/references/orchestration.md',
    why: "DSH's workflow tool takes the script BODY plus a meta block as arguments; it does not accept a `scriptPath`.",
    find: `3. \`Workflow({scriptPath: "<path>"})\`. Each batch runs Reviewer A and Reviewer B in parallel,`,
    replace: `3. Read the generated script and pass its body as the \`workflow\` tool's \`script\` argument
   (DSH takes the script body inline, not a path), with a matching \`meta\` block naming the run.
   Each batch runs Reviewer A and Reviewer B in parallel,`,
  },
  {
    id: 'sr-screener/workflow-invocation-skill',
    file: 'sr-screener/SKILL.md',
    why: 'Same `scriptPath` mismatch as above.',
    find: `#   -> Workflow({scriptPath: "<printed path>"}) after the user approves the cost`,
    replace: `#   -> pass that script's body to the \`workflow\` tool after the user approves the cost`,
  },
  {
    id: 'sr-screener/lean-agent-claim',
    file: 'sr-screener/SKILL.md',
    why: 'The per-agent tools allowlist is a Claude Code plugin mechanism; on DSH the same guarantee is prompt-level.',
    find: `Roles 3-5 and the QC rechecks run as the lean \`screening_reviewer_agent\` subagent (Read and Grep
only, no memory of other reviewers). Plugin installs ship it in the plugin's \`agents/\` folder as
\`academic-research-skills:screening_reviewer_agent\`; for a skills-copy install, copy
\`agents/screening_reviewer_agent.md\` into \`.claude/agents/\`. A lean agent keeps hundreds of calls
cheap, and the missing tools keep reviewers independent: they cannot browse, write files or see
each other's work.`,
    replace: `Roles 3-5 and the QC rechecks run as the lean \`screening_reviewer_agent\` role (read and search
only, no memory of other reviewers). The role ships at
\`sr-screener/agents/screening_reviewer_agent.md\`; dispatch it by passing that file's contents as
the \`subagent\` tool's prompt. DSH's \`subagent\` tool carries one tool set for every call, so
"lean and independent" is enforced by the reviewer prompt rather than by a runtime allowlist: the
prompt tells the reviewer it may read and search but must not browse, write files, or see another
reviewer's work. Keeping the prompt lean still keeps hundreds of calls cheap.`,
  },
  {
    id: 'sr-screener/reviewer-install-note',
    file: 'sr-screener/agents/screening_reviewer_agent.md',
    why: 'Agent install note referenced Claude Code agent roots.',
    find: `## Install note

Plugin installs list this agent as \`academic-research-skills:screening_reviewer_agent\`. For a
skills-copy install, copy this file into \`.claude/agents/\` (one project) or \`~/.claude/agents/\`
(all projects) and use \`screening_reviewer_agent\`. Put the name the session lists into
\`agent_type\` in \`screening_config.json\`.`,
    replace: `## Install note

This role ships inside the \`sr-screener\` skill bundle at
\`sr-screener/agents/screening_reviewer_agent.md\`. DSH has no filesystem agent root and no
\`plugin:agent\` names, so dispatch it by passing this file's contents as the \`subagent\` tool's
prompt (plus one batch prompt from \`templates/prompts.md\`). Set \`agent_type\` in
\`screening_config.json\` to \`subagent\`, or leave it empty.`,
  },
  {
    id: 'routing-core-carriers',
    file: 'shared/references/routing_core.md',
    why: 'The carrier list named the SessionStart hook, which this port deliberately does not implement (DSH has no hook system), and over-counted the carriers.',
    find: `A DSH session receives instructions from the skills it loads and from the workspace it runs in. This plugin registers its skills directly into the catalog, so no repo-level \`CLAUDE.md\` is loaded. The block between the markers below therefore reaches a session through three carriers:

- this plugin's \`lib/startup.js\` registration, whose skill bodies each inline the core;
- \`scripts/announce-ars-loaded.sh\`, which reads the block from this file at every SessionStart (startup, clear, resume, compaction, fork), so plugin installs have it before any skill loads; after compaction, resume, or a fork its lead-in limits the block to a new request;
- the \`SKILL.md\` of every skill (five today), so every install path has it once a skill loads.

\`scripts/check_routing_core_sync.py\` fails CI when a copy differs from this block by a single byte or a skill's \`SKILL.md\` lacks it.`,
    replace: `A DSH session receives instructions from the skills it loads. This plugin registers its skills directly into the skill catalog, so no repo-level \`CLAUDE.md\` is loaded. The block between the markers below therefore reaches a session through two carriers:

- the \`SKILL.md\` of every skill (five today), so every entry path has it once a skill loads;
- the \`/ars-*\` command wrappers, each of which names the skill to load before executing a mode.

There is deliberately **no** pre-load carrier: upstream used a \`SessionStart\` hook for that, and this port does not implement hooks (DSH has no hook system). A request that no skill picks up therefore gets no routing guard, and a clarifying question can only come after a skill call — the same degraded state upstream documents for its hook-less install channels.

Upstream CI (\`scripts/check_routing_core_sync.py\`, bundled here) fails when a copy differs from this block by a single byte or a skill's \`SKILL.md\` lacks it.`,
  },
];

let failed = 0;
let applied = 0;
let already = 0;

for (const edit of EDITS) {
  const file = join(ROOT, edit.file);
  const before = readFileSync(file, 'utf8');
  // Upstream Markdown is CRLF on a Windows checkout. The anchors below are
  // written with LF, so fold the anchor to the file's own newline convention
  // before matching: this keeps every non-matched byte untouched.
  const crlf = before.includes('\r\n');
  const toEol = (s) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'));
  const find = toEol(edit.find);
  const replace = toEol(edit.replace);
  const occurrences = before.split(find).length - 1;

  if (occurrences === 0 && before.includes(replace)) {
    // The anchors are one-shot: a re-run over an already-ported tree finds the
    // replacement in place. That is a healthy state, not a failure.
    already += 1;
    console.log(`done  ${edit.id}  (already applied)`);
    continue;
  }
  if (occurrences !== 1) {
    failed += 1;
    console.error(`FAIL  ${edit.id}: anchor found ${occurrences} times in ${edit.file} (expected 1)`);
    continue;
  }
  const after = before.replace(find, replace);
  if (!DRY) writeFileSync(file, after, 'utf8');
  applied += 1;
  console.log(`ok    ${edit.id}  (${edit.file})`);
}

console.log(
  `\nport-edits.mjs — ${DRY ? 'DRY RUN' : 'applied'} ${applied} edit(s); ` +
    `${already} already applied; ${failed} failed; ${EDITS.length} declared`,
);
if (failed) {
  console.error(`${failed} edit(s) could not be anchored — upstream text may have moved. Resolve by hand.`);
  process.exitCode = 1;
}
