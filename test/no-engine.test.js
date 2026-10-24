/**
 * The package knows no engine (*the engine knows no view*, BelType's decision record of 2026-10-24). Two sweeps over `src/`: no import reaches an engine, and no file names one, comments included. The renderer's attribute and words are a registry passed to it, with this package's own as the default, so a paginator's spellings live in the package that implements its fragmentainer. Written as a test because a claim in a README is not one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const files = readdirSync(src).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(src + f, 'utf8')]);

test('no import under src/ reaches an engine', () => {
  for (const [file, text] of files) for (const m of text.matchAll(/^import .* from '([^']+)'/gm)) assert.ok(!/beltype|cicero/i.test(m[1]), `${file} imports ${m[1]}`);
});

test('no file under src/ names an engine', () => {
  for (const [file, text] of files) for (const word of ['beltype', 'cicero']) assert.ok(!text.toLowerCase().includes(word), `${file} names ${word}`);
});
