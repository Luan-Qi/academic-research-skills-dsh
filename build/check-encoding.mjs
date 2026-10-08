#!/usr/bin/env node
/**
 * check-encoding.mjs — fail on text files that are not valid, lossless UTF-8.
 *
 * WHY THIS EXISTS. Twice during this port's construction, a text file was
 * rewritten through PowerShell's `Get-Content -Raw` + `Set-Content`, which
 * decoded the file in the console's legacy codepage and re-encoded it. The
 * result is a file that is no longer valid UTF-8: English survives untouched,
 * and every CJK character becomes U+FFFD. The damage is silent — the tool that
 * reads it just refuses, and by then the original characters are gone (the
 * transformation is lossy, so it cannot be reversed).
 *
 * Two defences, and this is the second one:
 *   1. Every text rewrite in `build/*.mjs` uses Node's utf8 read/write, never a
 *      shell redirect or `Set-Content`.
 *   2. This gate, wired into `npm run check`, so an accidental shell rewrite is
 *      caught by the next check run instead of by a reader.
 *
 * Two independent signals are tested:
 *   - strict UTF-8 decode failure (Node's `TextDecoder('utf-8', {fatal: true})`)
 *   - a U+FFFD replacement character ANYWHERE in the decoded text
 *
 * The second signal is why allowlisting exists: upstream ships one file that
 * legitimately contains a replacement character, byte-identical to upstream's
 * own copy. That file is named below with the reason, so a new occurrence is
 * never silently absorbed.
 *
 * Usage:
 *   node build/check-encoding.mjs [--quiet]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const QUIET = process.argv.includes('--quiet');

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SKIP_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.gz',
  '.ttf', '.otf', '.ttc', '.woff', '.woff2', '.exe', '.dll', '.so', '.dylib', '.db', '.pyc', '.sqlite']);

/**
 * Files permitted to contain a U+FFFD, each with the reason. Keep this list
 * short and justified: an entry here means "checked, and upstream is the same".
 */
const ALLOWED_REPLACEMENT_CHARS = {
  'scripts/_calibration_pdf_text.py':
    'byte-identical to upstream, which also carries exactly one U+FFFD; not touched by this port so the upstream artefact stays visible',
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (!SKIP_EXT.has(extname(entry).toLowerCase())) out.push(full);
  }
  return out;
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const files = walk(ROOT);
const invalid = [];
const replacement = [];
let checked = 0;

for (const file of files) {
  const buf = readFileSync(file);
  if (buf.includes(0)) continue; // binary
  checked += 1;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  let text;
  try {
    text = decoder.decode(buf);
  } catch {
    invalid.push(rel);
    continue;
  }
  const count = (text.match(/\uFFFD/g) ?? []).length;
  if (count > 0) replacement.push([rel, count]);
}

console.log(`check-encoding.mjs — checked ${checked} text file(s)`);
for (const [rel, count] of replacement) {
  const reason = ALLOWED_REPLACEMENT_CHARS[rel];
  if (reason) {
    if (!QUIET) console.log(`  allowed  ${rel} (${count} U+FFFD) — ${reason}`);
  } else {
    console.log(`  DAMAGED  ${rel} — ${count} replacement character(s), not in the allowlist`);
  }
}

const unexplained = replacement.filter(([rel]) => !ALLOWED_REPLACEMENT_CHARS[rel]);

if (invalid.length) {
  console.log('\nNOT VALID UTF-8:');
  for (const rel of invalid) console.log(`  ${rel}`);
}
if (unexplained.length) {
  console.log('\nUnexplained U+FFFD (characters were lost when the file was written):');
  for (const [rel] of unexplained) console.log(`  ${rel}`);
}

if (invalid.length || unexplained.length) {
  console.log(
    '\nRecovery: the transformation is lossy, so restore the file from a clean source\n' +
      '(upstream copy, or a re-run of the build scripts) and rewrite it with Node, not a shell.',
  );
  process.exitCode = 1;
} else {
  console.log('\nOK — every text file is valid UTF-8 with no unexplained character loss.');
}
