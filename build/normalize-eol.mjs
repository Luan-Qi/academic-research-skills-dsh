#!/usr/bin/env node
/**
 * normalize-eol.mjs — keep the tree on upstream's canonical line endings (LF).
 *
 * WHY THIS EXISTS. Upstream's git index stores every text file as LF. On a
 * Windows checkout with `core.autocrlf=true` — this machine's setting — git
 * rewrites the working tree to CRLF, and this port originally inherited that.
 * Two things then break, neither of them loudly:
 *
 *   1. `scripts/check_tools_allowlist.py` reads a line WITHOUT universal-newline
 *      translation precisely so that a CRLF file fires the lint (its own comment:
 *      "a bare `\r`/CRLF file therefore still fires the ..."). Upstream's CI runs
 *      on Linux, so upstream never sees this; a Windows port does.
 *   2. The whole-file sha256 content locks in
 *      `scripts/check_pipeline_boundary_semantics.py` pin CRLF hashes, so they
 *      would go red the moment the tree is re-checked-out or committed with
 *      `core.autocrlf=false` — a fix that silently un-fixes itself.
 *
 * Converging on LF makes the locks stable and the lints meaningful, and matches
 * the bytes upstream actually ships. `.gitattributes` pins the policy so a future
 * clone cannot silently reintroduce CRLF.
 *
 * Binary files are detected by a NUL byte and skipped.
 *
 * Usage:
 *   node build/normalize-eol.mjs           # report only (exit 1 if CRLF found)
 *   node build/normalize-eol.mjs --write    # convert CRLF -> LF in place
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRITE = process.argv.includes('--write');

/** Never descended into: build output and VCS metadata. */
const SKIP_DIRS = new Set(['.git', 'node_modules']);
/** Extensions that are always binary. */
const SKIP_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.gz',
  '.ttf', '.otf', '.ttc', '.woff', '.woff2', '.exe', '.dll', '.so', '.dylib', '.db', '.pyc', '.sqlite']);

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

const files = walk(ROOT);
const crlfFiles = [];
const binarySkipped = [];
let converted = 0;

for (const file of files) {
  const buf = readFileSync(file);
  if (buf.includes(0)) {
    binarySkipped.push(relative(ROOT, file).replace(/\\/g, '/'));
    continue;
  }
  if (!buf.includes(13)) continue; // no CR byte at all: already LF (or has none)
  const text = buf.toString('utf8');
  // Only a CR immediately before LF is a line ending; a lone CR is left alone.
  const lf = text.replace(/\r\n/g, '\n');
  if (lf === text) continue;
  crlfFiles.push(relative(ROOT, file).replace(/\\/g, '/'));
  if (WRITE) {
    writeFileSync(file, lf, 'utf8');
    converted += 1;
  }
}

console.log(`normalize-eol.mjs — scanned ${files.length} text candidates`);
if (binarySkipped.length) console.log(`  skipped ${binarySkipped.length} binary file(s) (NUL byte)`);
console.log(`  ${WRITE ? 'converted' : 'found'}: ${WRITE ? converted : crlfFiles.length} file(s) with CRLF`);

if (crlfFiles.length) {
  const show = crlfFiles.slice(0, 10);
  for (const f of show) console.log(`    ${f}`);
  if (crlfFiles.length > show.length) console.log(`    ... and ${crlfFiles.length - show.length} more`);
}

if (crlfFiles.length && !WRITE) {
  console.log('\nRe-run with --write to converge on LF (upstream canonical).');
  process.exitCode = 1;
}
