#!/usr/bin/env node
/**
 * verify-user-skills.mjs — check that a `~/.dsh/skills` install is DISCOVERABLE.
 *
 * `install-user-skills.mjs` proves every reference resolves; this proves the other
 * half: that @deepseek-ai/dsh-skill-filesystem will actually see the skills. It
 * reimplements that provider's discovery contract (one level deep, two forms) and
 * its frontmatter requirements, then reports what it will publish and what it will
 * skip with a warning.
 *
 * Discovery contract, quoted from the provider's README:
 *   "A skill is either a directory bundle `<name>/SKILL.md` or a flat file
 *    `<name>.md` at the top level of a scanned root; nested `**\/SKILL.md` files
 *    are deliberately not discovered. ... `name` must be kebab-case, `description`
 *    is required."
 *
 * Usage:
 *   node build/verify-user-skills.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const ROOT = join(HOME, 'skills');
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The five bundles and the 39 wrappers this port installs. */
const EXPECTED_SKILLS = ['deep-research', 'academic-paper', 'academic-paper-reviewer', 'academic-pipeline', 'sr-screener'];
const EXPECTED_COMMANDS = readdirSync(new URL('../commands', import.meta.url))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3))
  .sort();

/** Frontmatter subset the provider's parser needs: name + description. */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  let inMetadata = false;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) continue; // nested metadata block
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (key === 'metadata') {
      inMetadata = true;
      continue;
    }
    inMetadata = false;
    if (fields[key] !== undefined) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

if (!existsSync(ROOT)) {
  console.error(`verify-user-skills.mjs — no user skills root at ${ROOT}`);
  process.exit(1);
}

const skills = [];
const commands = [];
const skipped = [];

for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  const full = join(ROOT, entry.name);
  if (entry.isDirectory()) {
    const file = join(full, 'SKILL.md');
    if (!existsSync(file)) {
      skipped.push(`${entry.name}/`);
      continue;
    }
    const fm = frontmatter(readFileSync(file, 'utf8'));
    if (!fm || !NAME_RE.test(fm.name ?? '') || !fm.description) {
      skipped.push(`${entry.name}/SKILL.md (frontmatter)`);
      continue;
    }
    skills.push({ name: fm.name, file, scoped: fm.name !== entry.name });
  } else if (entry.name.endsWith('.md')) {
    const fm = frontmatter(readFileSync(full, 'utf8'));
    if (!fm || !NAME_RE.test(fm.name ?? '') || !fm.description) {
      skipped.push(`${entry.name} (no usable frontmatter)`);
      continue;
    }
    commands.push({ name: fm.name, file: full, scoped: fm.name !== entry.name.slice(0, -3) });
  } else if (statSync(full).isFile()) {
    skipped.push(`${entry.name} (not .md)`);
  }
}

console.log(`verify-user-skills.mjs — root: ${ROOT}`);
console.log(`  directory bundles published : ${skills.length}`);
console.log(`  flat files published        : ${commands.length}`);

const missingSkills = EXPECTED_SKILLS.filter((s) => !skills.some((x) => x.name === s));
const missingCommands = EXPECTED_COMMANDS.filter((c) => !commands.some((x) => x.name === c));

if (missingSkills.length) console.log(`  MISSING skill(s)   : ${missingSkills.join(', ')}`);
if (missingCommands.length) console.log(`  MISSING command(s) : ${missingCommands.join(', ')}`);
const mismatched = [...skills, ...commands].filter((x) => x.scoped);
for (const m of mismatched) console.log(`  note: ${m.name} — its frontmatter name differs from the file/dir name`);

console.log(`\nskipped (the provider warns and continues for each):`);
for (const s of skipped) console.log(`  ${s}`);

const ok = missingSkills.length === 0 && missingCommands.length === 0;
console.log(
  ok
    ? `\nOK — ${skills.length} skill(s) and ${commands.length} command(s) are discoverable. ` +
        `The ${skipped.length} skipped entries are resource trees and prose, not skills.`
    : '\nFAILED — the install is not fully discoverable.',
);
process.exitCode = ok ? 0 : 1;
