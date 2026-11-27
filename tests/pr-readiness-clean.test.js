#!/usr/bin/env node
// Regression test for the `clean` jq filter in scripts/pr-readiness.sh.
//
// The readiness output prints text that PR authors and commenters control (branch
// names, check-run names, review excerpts). `clean` must replace every control,
// format, line-separator and paragraph-separator character so none of that text can
// redraw the verdict, reorder a line (bidi) or hide content (zero-width / tag chars).
//
// Instead of trusting the hand-written ranges, this test enumerates every code point
// that Node's own Unicode tables classify as Cc/Cf/Zl/Zp and requires that all of them
// come out as "?". It also checks that ordinary text, including non-ASCII, is kept.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'pr-readiness.sh'), 'utf8');
const match = script.match(/^JQ_CLEAN='([\s\S]*?)'$/m);
assert.ok(match, 'could not find JQ_CLEAN in scripts/pr-readiness.sh');
const JQ_CLEAN = match[1];

function runClean(codepoints) {
  const program = `${JQ_CLEAN} map([.] | implode | clean | explode[0])`;
  const out = execFileSync('jq', ['-c', program], { input: JSON.stringify(codepoints) });
  return JSON.parse(out.toString());
}

// Every Cc/Cf/Zl/Zp code point (surrogates excluded: they are not valid scalar values).
const unsafe = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;
const mustStrip = [];
for (let cp = 0; cp <= 0x10ffff; cp++) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  if (unsafe.test(String.fromCodePoint(cp))) mustStrip.push(cp);
}
assert.ok(mustStrip.includes(0x061c), 'sanity: U+061C must be in the Cf set');
assert.ok(mustStrip.length > 200, `sanity: expected >200 unsafe code points, got ${mustStrip.length}`);

const stripped = runClean(mustStrip);
const survivors = mustStrip.filter((cp, i) => stripped[i] !== 63);
assert.deepStrictEqual(
  survivors.map((cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')),
  [],
  'control/format characters survived clean'
);

// Ordinary text must pass through unchanged, including non-ASCII and NBSP.
const keep = [...'fix/feature-1 ünïcode ✓ 日本 é 中 ‰   مرحبا שלום 😀'].map((c) => c.codePointAt(0));
assert.deepStrictEqual(runClean(keep), keep, 'ordinary text was altered by clean');

// The reported case from the #162 review: a head ref carrying U+061C.
const ref = runClean([...'fix/؜evil'].map((c) => c.codePointAt(0)));
assert.strictEqual(String.fromCodePoint(...ref), 'fix/?evil');

console.log(`pr-readiness clean: ${mustStrip.length} control/format code points stripped, ordinary text kept`);
