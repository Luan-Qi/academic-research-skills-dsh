#!/usr/bin/env node
/**
 * refresh-content-locks.mjs — refresh upstream's whole-file sha256 content locks.
 *
 * `scripts/check_pipeline_boundary_semantics.py` pins all five #528 pipeline
 * surfaces by whole-file sha256, and upstream's own comment states the rule:
 * ANY byte change fails the lint until the constant is updated IN THE SAME
 * COMMIT. This port deliberately rewrote a handful of sentences in those
 * surfaces (host adaptation), so the pinned hashes must be refreshed for the
 * lock to keep doing its job — guarding against *further* unintended drift —
 * instead of sitting permanently red.
 *
 * Rewriting the pins is a deliberate maintenance act: it asserts that every byte
 * difference is intended. This script prints a per-file summary of which of the
 * five surfaces currently differ from their pin, so the change is reviewable
 * before the pin moves.
 *
 * Usage:
 *   node build/refresh-content-locks.mjs           # report only
 *   node build/refresh-content-locks.mjs --write   # update the pins in place
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRITE = process.argv.includes('--write');
const LINT = join(ROOT, 'scripts', 'check_pipeline_boundary_semantics.py');

const source = readFileSync(LINT, 'utf8');
const blockMatch = /CONTENT_LOCKS = \{([\s\S]*?)\n\}/.exec(source);
if (!blockMatch) {
  console.error('CONTENT_LOCKS block not found — upstream layout changed; update this script');
  process.exit(1);
}

/** Parse `"path": "hash",` rows out of the pinned block, preserving order. */
const pins = [...blockMatch[1].matchAll(/"([^"]+)"\s*:\s*"([0-9a-f]{64})"/g)].map((m) => ({
  path: m[1],
  pinned: m[2],
}));

if (pins.length === 0) {
  console.error('no hash rows parsed from CONTENT_LOCKS');
  process.exit(1);
}

const sha256 = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');

let changed = 0;
let nextBlock = blockMatch[1];

for (const pin of pins) {
  const actual = sha256(pin.path);
  const same = actual === pin.pinned;
  if (!same) changed += 1;
  console.log(`${same ? 'pinned ' : 'DRIFTED'}  ${pin.path}`);
  console.log(`    pinned: ${pin.pinned}`);
  if (!same) console.log(`    actual: ${actual}`);
  if (!same) nextBlock = nextBlock.replace(pin.pinned, actual);
}

if (changed === 0) {
  console.log(`\nrefresh-content-locks.mjs — all ${pins.length} locks match; nothing to do.`);
  process.exit(0);
}

console.log(`\nrefresh-content-locks.mjs — ${changed}/${pins.length} lock(s) drifted from the pins.`);
if (!WRITE) {
  console.log('Re-run with --write to move the pins (only for a reviewed, intended byte change).');
  process.exit(0);
}

writeFileSync(LINT, source.replace(blockMatch[1], nextBlock), 'utf8');
console.log(`Updated CONTENT_LOCKS in scripts/check_pipeline_boundary_semantics.py (${changed} pin(s)).`);
console.log('Verify with: py -3 scripts/check_pipeline_boundary_semantics.py');
