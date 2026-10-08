// academic-research-skills-dsh — DSH skill provider plugin.
//
// Contributes the ported Academic Research Skills (ARS, upstream v3.23.0) suite
// to the DSH skill registry:
//
//   - 5 model-invocable skills : deep-research, academic-paper,
//                                academic-paper-reviewer, academic-pipeline,
//                                sr-screener
//   - 39 user-invocable commands: every /ars-* wrapper (all 35 MODE_REGISTRY
//                                modes, plus the three CLI commands)
//
// WHY A PROVIDER AND NOT `ctx.skills.register()`
//
// `register()` is the registry's EMBEDDED path: it takes the skill body as a
// string, so the body is captured once at boot and editing the file on disk has
// no effect until the host restarts, and a removed skill stays in the catalog.
// A provider is the registry's SOURCE path: `list()` publishes frontmatter
// summaries, `get()` reads the body from disk on every load, and
// `control.invalidate()` re-publishes the catalog when the files change. This
// plugin therefore behaves like a disk-backed skill source:
//
//   * edit a SKILL.md while the session is running -> the next load sees it;
//   * add or delete a command/skill file -> the catalog follows, no restart;
//   * nothing is cached in memory beyond frontmatter summaries.
//
// It is also the ONLY viable route in a `web` profile: `@deepseek-ai/dsh-web-app`
// ships `skill-filesystem` as `disabled: true`, so there is no scanned skill root
// to drop folders into. `@deepseek-ai/dsh-skill-filesystem` documents itself as
// "one implementation" of a provider, and `registerProvider` is the public seam,
// so this is the supported extension rather than a workaround.
//
// RESOURCE ANCHORS. `@deepseek-ai/dsh-skill` renders
// "Resolve relative paths mentioned by this skill against the base directory"
// for a `directory` resource base. Upstream ARS uses TWO anchors — bare
// `references/x.md` is relative to the skill's own directory, while
// `shared/x.md`, `scripts/x.py`, `docs/…` and `<other-skill>/agents/x.md` are
// relative to the repository root. A single `directory` base would therefore
// mis-resolve roughly a quarter of the suite's 1,693 path references, so this
// provider publishes an `opaque` base that names BOTH anchors explicitly.
//
// Dependency-free by design (node:fs / node:path only), so the package installs
// offline and the loader has nothing extra to resolve.
import { readFileSync, readdirSync, existsSync, statSync, watch } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS_DIR = join(PACKAGE_ROOT, 'commands');

/** Model-invocable skill bundles, in the order `list()` publishes them. */
const SKILL_DIRS = [
  'deep-research',
  'academic-paper',
  'academic-paper-reviewer',
  'academic-pipeline',
  'sr-screener',
];

/** Registry provider name (the `runtime` provider name is reserved). */
const PROVIDER_NAME = 'academic-research-skills-dsh';
/** `BUNDLED_SKILL_RANK` from @deepseek-ai/dsh-skill: packaged skills rank here. */
const RANK = 600;
/** Kebab-case skill-name grammar (matches the registry's own check). */
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Filesystem-event coalescing window, so one save publishes one catalog. */
const WATCH_DEBOUNCE_MS = 150;

/**
 * Parse a skill file's YAML frontmatter with the subset ARS needs.
 *
 * Handles top-level `key: value` scalars, quoted values, comments, and the
 * nested `metadata:` block (indented scalars plus `- item` sequence entries).
 * Duplicate top-level keys resolve first-wins, so a nested key can never shadow
 * a real field.
 *
 * @param {string} text - full file text.
 * @returns {{fields: Record<string, string>, metadata?: Record<string, unknown>} | null}
 *   parsed frontmatter, or null when the file has no `---` block.
 */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;

  const fields = {};
  const metadata = {};
  let inMetadata = false;
  let metadataListKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Nested metadata block: indented lines belong to `metadata:`.
    if (/^\s/.test(line)) {
      if (!inMetadata) continue;
      const listItem = /^\s+-\s+(.*)$/.exec(line);
      if (listItem && metadataListKey) {
        const arr = Array.isArray(metadata[metadataListKey]) ? metadata[metadataListKey] : [];
        arr.push(unquote(listItem[1].trim()));
        metadata[metadataListKey] = arr;
        continue;
      }
      const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line);
      if (nested) {
        metadataListKey = nested[1];
        metadata[nested[1]] = nested[2] === '' ? [] : unquote(nested[2].trim());
      }
      continue;
    }

    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    if (key === 'metadata') {
      inMetadata = true;
      continue;
    }
    inMetadata = false;
    metadataListKey = null;
    if (fields[key] === undefined) fields[key] = unquote(raw);
  }

  return { fields, metadata: Object.keys(metadata).length ? metadata : undefined };
}

/** Strip one layer of matching quotes. */
function unquote(value) {
  if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

/** Resolve a `disable-model-invocation` / `user-invocable` value; absence allows. */
function triBool(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Read one skill file's summary (frontmatter only — no body).
 *
 * @param {string} file - absolute path to a `SKILL.md` or flat `<name>.md`.
 * @param {boolean} isCommand - whether the file is a `/ars-*` wrapper.
 * @returns {object | null} a candidate summary, or null when unusable.
 */
function readSummary(file, isCommand) {
  if (!existsSync(file)) return null;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseFrontmatter(text);
  if (!parsed) return null;
  const { fields, metadata } = parsed;
  const name = fields.name;
  const description = fields.description;
  if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
  if (typeof description !== 'string' || description.length === 0) return null;

  // Upstream's wrapper frontmatter says `disable-model-invocation: true` +
  // `user-invocable: true`; the skill bundles declare neither, which means
  // "allowed on both surfaces".
  const modelFlag = triBool(fields['disable-model-invocation']);
  const userFlag = triBool(fields['user-invocable']);
  const invocation = isCommand
    ? { modelInvocable: modelFlag === true ? false : true, userInvocable: userFlag === false ? false : true }
    : { modelInvocable: modelFlag === true ? false : true, userInvocable: userFlag === false ? false : true };

  return {
    name,
    description,
    ...(fields.whenToUse ? { whenToUse: fields.whenToUse } : {}),
    invocation,
    source: 'bundled',
    provider: PROVIDER_NAME,
    rank: RANK,
    locator: file,
    path: file,
    resourceBase: resourceHint(isCommand),
    ...(metadata ? { metadata } : {}),
  };
}

/**
 * Build the resource-anchor hint for a skill or command file.
 *
 * @param {boolean} isCommand - true for a flat `/ars-*` wrapper in `commands/`.
 * @returns {{kind: 'opaque', description: string}} the published resource base.
 */
function resourceHint(isCommand) {
  const root = PACKAGE_ROOT.replace(/\\/g, '/');
  const own = isCommand ? `${root}/commands` : `${root}/<this-skill>`;
  const ownPaths = isCommand ? 'the other `ars-*.md` wrappers' : 'its own `references/`, `agents/`, `templates/`, `examples/`';
  return {
    kind: 'opaque',
    description:
      `Plugin root: ${root} — resolve \`shared/\`, \`scripts/\`, \`docs/\`, \`evals/\`, \`examples/\`, ` +
      `\`audits/\`, \`MODE_REGISTRY.md\`, \`commands/\` and any \`<skill-name>/\` path against it. ` +
      `This file's own directory is ${own}, which holds ${ownPaths}.`,
  };
}

/** The body of a skill file: everything after the frontmatter block. */
function readBody(file) {
  const text = readFileSync(file, 'utf8');
  const end = text.indexOf('---', 3);
  if (end === -1) return text;
  return text.slice(end + 3).replace(/^\r?\n/, '');
}

/** Build the ordered skill-file list: five bundles first, then the flat wrappers. */
function enumerateFiles() {
  const out = [];
  for (const dir of SKILL_DIRS) {
    const file = join(PACKAGE_ROOT, dir, 'SKILL.md');
    if (existsSync(file)) out.push({ file, isCommand: false });
  }
  if (existsSync(COMMANDS_DIR)) {
    for (const entry of readdirSync(COMMANDS_DIR).sort()) {
      if (!entry.endsWith('.md')) continue;
      out.push({ file: join(COMMANDS_DIR, entry), isCommand: true });
    }
  }
  return out;
}

/**
 * Cordis plugin body. `ctx.skills` is injected by the bundle patch row
 * (`inject: [skills]`); the guard keeps the module safe if mounted without it.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context carrying `skills`.
 */
export default function apply(ctx) {
  if (!ctx?.skills?.registerProvider) {
    console.warn('[academic-research-skills-dsh] ctx.skills.registerProvider unavailable — nothing registered');
    return;
  }

  ctx.skills.registerProvider((control) => {
    /** Live FSWatchers keyed by watched directory, closed on disposal. */
    const watchers = new Map();
    let debounce = null;

    const invalidate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        control.invalidate();
      }, WATCH_DEBOUNCE_MS);
      if (typeof debounce.unref === 'function') debounce.unref();
    };

    /**
     * Watch a directory for the events that change the CATALOG — file add,
     * remove, and (for a `SKILL.md`) frontmatter edits. Body edits need no
     * invalidation because `get()` re-reads the file. Failures degrade to "no
     * live catalog refresh"; body edits still work.
     */
    const watchDir = (dir) => {
      if (watchers.has(dir) || !existsSync(dir)) return;
      try {
        const watcher = watch(dir, { persistent: false }, (_event, filename) => {
          if (filename === null || filename === undefined) return invalidate();
          const name = String(filename);
          if (name.endsWith('.md') || !name.includes('.')) invalidate();
        });
        if (typeof watcher.unref === 'function') watcher.unref();
        watchers.set(dir, watcher);
      } catch {
        // Watching is an optimization; the provider still serves from disk.
      }
    };

    const closeAll = () => {
      if (debounce) clearTimeout(debounce);
      for (const watcher of watchers.values()) {
        try {
          watcher.close();
        } catch {
          /* already gone */
        }
      }
      watchers.clear();
    };
    control.signal.addEventListener('abort', closeAll, { once: true });

    /** Publish frontmatter summaries and (re)attach watchers. */
    const list = async () => {
      watchDir(PACKAGE_ROOT);
      watchDir(COMMANDS_DIR);
      for (const dir of SKILL_DIRS) watchDir(join(PACKAGE_ROOT, dir));

      const candidates = [];
      const unreadable = [];
      for (const { file, isCommand } of enumerateFiles()) {
        const summary = readSummary(file, isCommand);
        if (summary) candidates.push(summary);
        else unreadable.push(file.slice(PACKAGE_ROOT.length + 1).replace(/\\/g, '/'));
      }
      if (unreadable.length) {
        console.warn(
          `[academic-research-skills-dsh] skipped ${unreadable.length} file(s) with missing/invalid frontmatter: ` +
            unreadable.join(', '),
        );
      }
      return { candidates, complete: true };
    };

    /** Load one body from disk. A file that vanished or lost its frontmatter
     *  returns undefined, which is the documented "no longer loadable" answer. */
    const get = async (candidate) => {
      const summary = readSummary(candidate.locator, candidate.invocation?.modelInvocable === false);
      if (!summary) return undefined;
      let content;
      try {
        content = readBody(candidate.locator);
      } catch {
        return undefined;
      }
      if (content.trim().length === 0) return undefined;
      // Keep the candidate's name: the registry matched on it, and `list()` is
      // re-published whenever frontmatter changes.
      return { ...summary, name: candidate.name, content };
    };

    return { name: PROVIDER_NAME, list, get };
  });

  console.log(`[academic-research-skills-dsh] skill provider registered from ${PACKAGE_ROOT}`);
}
