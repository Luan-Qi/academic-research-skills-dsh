#!/usr/bin/env node
/**
 * normalize-host.mjs — ARS (Claude Code) → DSH host adaptation layer.
 *
 * The upstream methodology layer is already almost host-neutral: it contains no
 * `${CLAUDE_PLUGIN_ROOT}` and no `$ARGUMENTS` in skills/ or shared/. What remains
 * is a small, enumerable set of host mechanics that are simply WRONG on DSH:
 * tool names, a slash-command template variable, the Claude Code skill root, and
 * a handful of prose sentences that assert Claude-specific runtime behaviour.
 *
 * This script applies an explicit rule table. It is:
 *   - idempotent  (running it twice changes nothing)
 *   - reportable  (every rule prints its hit count and each changed file)
 *   - narrow      (only skills/** and shared/**; docs/ and CHANGELOG.md are left
 *                  byte-identical as upstream provenance, and scripts/ .py files
 *                  are handled by their own interpreter convention)
 *
 * Usage:
 *   node build/normalize-host.mjs            # apply
 *   node build/normalize-host.mjs --dry-run  # report only
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DRY = process.argv.includes('--dry-run');

/** Skill bundles sit at the package root (mirroring upstream), so scan those
 * names plus `shared/`. */
const SKILL_NAMES = [
  'deep-research',
  'academic-paper',
  'academic-paper-reviewer',
  'academic-pipeline',
  'sr-screener',
];
/** Roots whose Markdown is normalized (upstream provenance stays untouched). */
const ROOTS = [...SKILL_NAMES, 'shared'];
/** File extensions touched. `.py` is included only for the interpreter docstring rule. */
const EXTS = new Set(['.md']);
/** Files exempted from a specific rule, with the reason. */
const EXEMPT = {
  'shared/cross_model_verification.md': 'contains OpenAI/Anthropic API payloads where `web_search` is a provider tool name, not a host tool',
};

/**
 * Rule table. `id` is what the report prints; `find` is a regex; `replace` a string
 * or function. Rules are applied in order, once per file.
 */
const RULES = [
  {
    id: 'python-interpreter',
    why: '`python3` is a 0-byte Microsoft Store stub on Windows; `python`/`py -3` are the real interpreters there.',
    find: /\bpython3\b/g,
    replace: 'python',
  },
  {
    id: 'ask-tool-name',
    why: 'The DSH question tool is `ask_user_question`. The rule itself is negative (do NOT use it; options go in the markdown body) and is preserved.',
    find: /AskUserQuestion/g,
    replace: 'ask_user_question',
  },
  {
    id: 'skill-root',
    why: 'DSH discovers user skills under `~/.dsh/skills/`, not `~/.claude/skills/`.',
    find: /~\/\.claude\/skills\//g,
    replace: '~/.dsh/skills/',
  },
  {
    id: 'web-tool-names',
    why: 'DSH tool names are `web_search` / `web_fetch` (not Claude Code `WebSearch` / `WebFetch`).',
    exempt: 'shared/cross_model_verification.md',
    find: /\bWebSearch\b/g,
    replace: 'web_search',
  },
  {
    id: 'web-tool-names',
    exempt: 'shared/cross_model_verification.md',
    find: /\bWebFetch\b/g,
    replace: 'web_fetch',
  },
  {
    id: 'fs-tool-names',
    why: 'DSH filesystem/search tools are lowercase: `read`, `grep`, `glob`.',
    find: /\bRead tool\b/g,
    replace: 'read tool',
  },
  {
    id: 'fs-tool-names',
    find: /\bGrep tool\b/g,
    replace: 'grep tool',
  },
  {
    id: 'fs-tool-names',
    find: /\bthe Read and Grep tools\b/g,
    replace: 'the read and grep tools',
  },
  // ---------------------------------------------------------------------------
  // DISABLED BY DESIGN: the agents' frozen `tools:` frontmatter forms and the
  // prose that quotes them (`(`Read, Write, Edit, Grep, Glob` — no shell)`).
  //
  // An earlier revision of this port lowercased them to match DSH's tool names.
  // That was reverted: the field is INERT on DSH (no agent registry, no
  // per-agent allowlist here), so the change bought no behaviour while breaking
  // upstream's frozen-form lint `scripts/check_tools_allowlist.py` (which pins
  // those lines byte-for-byte) and needlessly diverging the bundled agent files
  // from upstream's `agents/` mirrors.
  //
  // The rule is kept here, disabled, so the next person to re-sync upstream can
  // see the decision instead of rediscovering it. Operational tool references
  // the model must actually act on — e.g. "Use only the Read tool" in an
  // sr-screener batch prompt — ARE still normalized by the rules above.
  // ---------------------------------------------------------------------------
  {
    id: 'agent-frontmatter-tools',
    find: /^tools: Read, Write, Edit, Grep, Glob$/gm,
    replace: 'tools: read, write, edit, grep, glob',
    disabled: true,
  },
  {
    id: 'agent-frontmatter-tools',
    find: /^tools: Read, Grep$/gm,
    replace: 'tools: read, grep',
    disabled: true,
  },
  {
    id: 'agent-frontmatter-tools',
    find: /\(`Read, Write, Edit, Grep, Glob` — no shell\)/g,
    replace: '(`read, write, edit, grep, glob` — no shell)',
    disabled: true,
  },
  {
    id: 'agent-dispatch-name',
    why: 'DSH dispatches a separate agent through the `subagent` tool.',
    find: /\bAgent tool\b/g,
    replace: 'subagent tool',
  },
  {
    id: 'session-ref',
    why: 'A fresh session is a DSH session here.',
    find: /\bfresh Claude Code session\b/g,
    replace: 'fresh DSH session',
  },
  {
    id: 'routing-carrier',
    why: 'The routing-discipline preamble described how Claude Code loads (or fails to load) `.claude/CLAUDE.md`. This plugin registers its skills directly into the DSH catalog, so the routing core arrives with the skill body.',
    find: /> \*\*Routing discipline \(v3\.9\.2\):\*\* plugin and skills-copy installs do not load this repository's `\.claude\/CLAUDE\.md`, so its routing core is repeated below, identical to `shared\/references\/routing_core\.md` \(#892\)\. If routing has not settled when this skill loads, apply the core before dispatching any agent\./g,
    replace:
      "> **Routing discipline (v3.9.2):** this plugin registers its skills directly into the DeepSeek Harness skill catalog, so no repo-level `CLAUDE.md` is loaded; the routing core is therefore repeated below, identical to `shared/references/routing_core.md` (#892). If routing has not settled when this skill loads, apply the core before dispatching any agent.",
  },
  {
    id: 'compliance-tier-wording',
    why: 'The model gate named an Anthropic alias and a user CLAUDE.md preference; keep the intent (no small/fast tier for compliance judgment), drop the host-specific wording.',
    find: /with `model: sonnet` or higher \(per user CLAUDE\.md: never haiku\)/g,
    replace: 'with a mid-tier-or-better session model (never a small/fast tier)',
  },
  {
    id: 'observer-scope',
    find: /as a post-hoc observer signal for Claude Code agents/g,
    replace: 'as a post-hoc observer signal for agentic research assistants',
  },
  {
    id: 'repro-model-id',
    find: /e\.g\. the inherited Claude Code session model \(not weight hash\)/g,
    replace: 'e.g. the inherited session model (not weight hash)',
  },
  {
    id: 'team-session',
    find: /Claude Code runs as a single-user session/g,
    replace: 'DSH runs as a single-user session',
  },
  {
    id: 'screener-fallback',
    find: /or run the pipeline in Claude Code/g,
    replace: 'or run the two-reviewer stage manually',
  },
  {
    id: 'process-summary-format',
    find: /Format follows the Claude Code CLI `\/insight` feature\./g,
    replace: 'Format is specified in `references/process_summary_protocol.md`.',
  },
  {
    id: 'cross-model-host',
    find: /You need API keys from at least one additional provider\. ARS itself runs inside Claude Code, so Claude is always available as the primary model\./g,
    replace:
      'You need API keys from at least one additional provider. The primary model is the DSH session model, which is always available.',
  },
  {
    id: 'cross-model-host',
    find: /In Claude Code, you can test by asking:/g,
    replace: 'To test the transport, ask:',
  },
  {
    id: 'cross-model-host',
    find: /`_\(inherited Claude Code session model\)_`/g,
    replace: '`_(inherited DSH session model)_`',
  },
  {
    id: 'cross-model-host',
    find: /_\(inherited Claude Code session model\)_/g,
    replace: '_(inherited DSH session model)_',
  },
  {
    id: 'tiering-alias',
    find: /This is not Claude Code's "model family alias" \(`opus`, `sonnet`, `fable`, each called a family there\): read that way, an Opus-class session would be the frontier of its own "family" and `quality-boost` would silently do nothing\./g,
    replace:
      'This is not a host "model family alias": read that way, a top-tier session would be the frontier of its own "family" and `quality-boost` would silently do nothing.',
  },
  {
    id: 'tiering-fallback-notice',
    find: /Claude Code shows the user a notice in the transcript and keeps the session on the fallback model until the user runs `\/model`/g,
    replace: 'the host may note the substitution in the transcript and keep the session on the fallback model until the user switches back',
  },
  {
    id: 'routing-core-carriers',
    find: /A Claude Code session loads the repository's `\.claude\/CLAUDE\.md` only when its working directory is inside the ARS checkout, and Claude Code does not load a plugin's `CLAUDE\.md` as project context\. So the block between the markers below reaches a session through three carriers:/g,
    replace:
      'A DSH session receives instructions from the skills it loads and from the workspace it runs in. This plugin registers its skills directly into the catalog, so no repo-level `CLAUDE.md` is loaded. The block between the markers below therefore reaches a session through three carriers:',
  },
  {
    id: 'routing-core-carriers',
    find: /^- `\.claude\/CLAUDE\.md` § Routing Discipline \(v3\.9\.2\), for sessions started inside a clone of this repository;$/gm,
    replace: '- this plugin\'s `lib/startup.js` registration, whose skill bodies each inline the core;',
  },
];

/** Collect Markdown files under the normalized roots. */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (EXTS.has(full.slice(full.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => collect(join(ROOT, r)));
const stats = new Map();
const changedFiles = new Set();

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const before = readFileSync(file, 'utf8');
  let text = before;

  for (const rule of RULES) {
    if (rule.disabled) continue;
    const hits = text.match(rule.find);
    if (!hits) continue;
    if (rule.exempt && rule.exempt === rel) {
      bump(stats, `${rule.id} [exempt-skipped]`, hits.length);
      continue;
    }
    bump(stats, rule.id, hits.length);
    text = text.replace(rule.find, rule.replace);
  }

  if (text !== before) {
    changedFiles.add(rel);
    if (!DRY) writeFileSync(file, text, 'utf8');
  }
}

function bump(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

console.log(`normalize-host.mjs — ${DRY ? 'DRY RUN' : 'applied'} over ${files.length} files`);
console.log('rule hit counts:');
for (const [id, n] of [...stats.entries()].sort()) console.log(`  ${String(n).padStart(4)}  ${id}`);
console.log(`files ${DRY ? 'that would change' : 'changed'}: ${changedFiles.size}`);
for (const f of [...changedFiles].sort()) console.log(`  ${f}`);
