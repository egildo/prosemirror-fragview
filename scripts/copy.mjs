// usage: node scripts/copy.mjs [--headed] [--boxes] — what Copy and Cut write to the clipboard, on both sides of the harness. Each act selects the same range on the EditorView (left) and the FragmentedView (right), sends each root a `copy` event carrying a DataTransfer, and compares what they wrote: the HTML (with its `data-pm-slice`, the slice's open depths and context, which `prosemirror-view`'s clipboard writes so that another ProseMirror editor fits the slice back where it came from) and the plain text. The acts: inside one paragraph; across two paragraphs (the slice opens in both); from a nested list item to the paragraph after the list (a context of three levels, which `prosemirror-view` writes into `data-pm-slice` and takes off the markup); across a cut of the chain (with --boxes); with the props `transformCopied`, `clipboardSerializer` and `clipboardTextSerializer` set on both; and a Cut, whose document must come out equal. Exits 1 when an act differs.
import { open } from './browser.mjs';

const boxes = process.argv.includes('--boxes');
const session = await open(boxes ? 'harness/?boxes=320x480' : 'harness/', { headless: !process.argv.includes('--headed') });
const { page } = session;
await page.waitForFunction(() => window.harness && document.getElementById('toolbar').textContent.includes('equal'), null, { timeout: 60000 });
const settled = () => page.waitForFunction(() => window.harness.right.filling.size === 0 && window.harness.chain().every((e) => !e.dirty && e.built), null, { timeout: 30000 });
await settled();

/** Select [a, b] on a side and send it `type` ('copy' or 'cut'); what it wrote. */
const clip = (side, a, b, type = 'copy') => page.evaluate(([side, a, b, type]) => {
  window.harness.select(side, a, b);
  const data = new DataTransfer();
  const event = new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true });
  window.harness.view(side).dom.dispatchEvent(event);
  return { html: data.getData('text/html'), text: data.getData('text/plain'), prevented: event.defaultPrevented, doc: JSON.stringify(window.harness.view(side).state.doc.toJSON()) };
}, [side, a, b, type]);
const find = (text, occurrence = 0) => page.evaluate(([t, o]) => window.harness.find(t, o), [text, occurrence]);
const props = (on) => page.evaluate((on) => {
  const base = window.harness.right.state.schema.cached.domSerializer;
  const marked = new base.constructor({ ...base.nodes, paragraph: () => ['p', { class: 'copied' }, 0] }, base.marks);
  const p = on ? { transformCopied: (slice) => slice, clipboardSerializer: marked, clipboardTextSerializer: (slice) => `T${slice.size}` } : { transformCopied: undefined, clipboardSerializer: undefined, clipboardTextSerializer: undefined };
  for (const v of [window.harness.left, window.harness.right]) v.setProps(p);
}, on);

const rows = [];
let failed = false;
async function act(name, a, b, { type = 'copy', withProps = false } = {}) {
  await page.evaluate(() => window.harness.reset());
  await settled();
  if (withProps) await props(true);
  const [from, to] = [await a(), await b()];
  const left = await clip('left', from, to, type), right = await clip('right', from, to, type);
  if (withProps) await props(false);
  const slice = /data-pm-slice="([^"]*)"/.exec(right.html)?.[1] ?? 'none';
  const ok = left.html === right.html && left.text === right.text && left.prevented === right.prevented && (type === 'copy' || left.doc === right.doc);
  if (!ok) failed = true;
  rows.push([name, `${from} → ${to}`, ok ? 'yes' : '**no**', `data-pm-slice ${slice}`, ok ? '' : `left ${JSON.stringify(left.html).slice(0, 160)} / right ${JSON.stringify(right.html).slice(0, 160)}; text ${JSON.stringify(left.text).slice(0, 40)} / ${JSON.stringify(right.text).slice(0, 40)}`]);
}

await act('inside one paragraph', () => find('answer is a'), () => find('answer is a').then((p) => p + 6));
await act('across two paragraphs', () => find('without effort'), () => find('keeps the document'));
await act('from a nested list item to the paragraph after the list', () => find('Its numbering'), () => find('The default fragmentainer'));
await act('inside a nested list item', () => find('A fragment holds'), () => find('A fragment holds').then((p) => p + 9));
if (boxes) await act('across a cut of the chain', () => page.evaluate(() => window.harness.chain()[0].to - 12), () => page.evaluate(() => window.harness.chain()[0].to + 12));
await act('across two paragraphs, with transformCopied, clipboardSerializer and clipboardTextSerializer', () => find('without effort'), () => find('keeps the document'), { withProps: true });
await act('Cut across two paragraphs', () => find('without effort'), () => find('keeps the document'), { type: 'cut' });

console.log('| Act | Range | Clipboard equal to EditorView\'s | Written | Notes |\n| :-- | :-- | :-- | :-- | :-- |');
for (const r of rows) console.log(`| ${r.join(' | ').replace(/\n/g, ' ')} |`);
const bad = rows.filter((r) => r[2] !== 'yes').length;
console.log(`\n${rows.length - bad} of ${rows.length} acts as expected${bad ? `, ${bad} FAILED` : ''}${boxes ? ' (under boxes)' : ''}.`);
await session.close();
process.exit(failed ? 1 : 0);
