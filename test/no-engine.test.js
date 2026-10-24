/**
 * The package knows no engine (*the engine knows no view*, BelType's decision record of 2026-10-24). Two sweeps over `src/`: no import reaches an engine, which holds; and no file names one, which does not hold yet and is marked so, because the renderer's attribute and words (`data-beltype`, `split`, `start`, `end`, `fragment`, `away`, `adjoin`) are still spelled as Cicero spells them. The second sweep passes when the words registry becomes a parameter of the renderer with a neutral default and the BelType package passes the engine's. Written as a test because a claim in a README is not one.
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

test('no file under src/ names an engine', { todo: 'the words registry is still spelled as Cicero spells it; it becomes a parameter with a neutral default' }, () => {
  for (const [file, text] of files) for (const word of ['beltype', 'cicero']) assert.ok(!text.toLowerCase().includes(word), `${file} names ${word}`);
});
