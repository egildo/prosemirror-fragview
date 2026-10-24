/**
 * The overflow box in a real layout: the page side of `overflow-box.test.js`.
 *
 * @packageDocumentation
 */

import { doc, p, ul, li, img } from 'prosemirror-test-builder';
import { OverflowBox } from '../src/overflow-box.js';
import { renderSlice, AWAY_SHEET, CONTINUATION_SHEET } from '../src/slice-renderer.js';

const words = 'The browser fills and the engine reads the overflow of one long column of text '.repeat(6).trim();
const d = doc(p(words), ul(li(p(words)), li(p(words))), p(img({ src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/%3E' })));

export async function run() {
  document.body.style.font = '16px/20px serif';
  // The host's half of the renderer's words: the shallow siblings take no box, a divided box gives up its edges at the cut.
  document.adoptedStyleSheets = [AWAY_SHEET, CONTINUATION_SHEET].map((text) => { const sheet = new CSSStyleSheet(); sheet.replaceSync(text); return sheet; });
  const results = {};

  const infinite = new OverflowBox({ width: 300 });
  document.body.appendChild(infinite.dom);
  results.infinite = (await infinite.fill(d, 0, renderSlice)).to;

  // A box of 130px holds six 20px lines and the top of the seventh.
  const box = new OverflowBox({ width: 300, height: 130 });
  document.body.appendChild(box.dom);
  const { to } = await box.fill(d, 0, renderSlice);
  results.to = to;
  results.shownEnd = box.rendered.to;
  // Lay the whole slice out again in an infinite twin and read the line of `to` and of the character before it.
  const twin = new OverflowBox({ width: 300 });
  document.body.appendChild(twin.dom);
  await twin.fill(d, 0, renderSlice);
  const top = twin.content.getBoundingClientRect().top;
  const lineOf = (pos, side) => {
    const { node, offset } = twin.pointAt(pos);
    const range = document.createRange();
    range.setStart(node, side > 0 ? offset : offset - 1);
    range.setEnd(node, side > 0 ? offset + 1 : offset);
    const rect = range.getClientRects()[0];
    return { top: rect.top - top, bottom: rect.bottom - top };
  };
  results.lineAtCut = lineOf(to, 1);
  results.lineBeforeCut = lineOf(to, -1);

  // The next box continues from the cut, with its open ancestors.
  const next = new OverflowBox({ width: 300, height: 130 });
  document.body.appendChild(next.dom);
  results.next = (await next.fill(d, to, renderSlice)).to;
  results.nextFirstText = next.content.textContent.slice(0, 20);
  results.fullFirstAfterCut = d.textBetween(to, to + 20);

  // The forced first line: a 40px box under 60px lines still takes its first line, and a chain of such boxes reaches the end.
  const tall = new OverflowBox({ width: 300, height: 40 });
  tall.dom.style.font = '48px/60px serif';
  document.body.appendChild(tall.dom);
  const forced = (await tall.fill(d, 0, renderSlice)).to;
  results.forced = { to: forced, shown: tall.content.textContent, firstLine: d.textBetween(1, forced) };
  const chain = [0];
  for (let from = forced; from != null && chain.length < 500; ) {
    chain.push(from);
    from = (await tall.fill(d, from, renderSlice)).to;
  }
  results.chain = chain;

  // Late truth: the image grows after the fill.
  const last = new OverflowBox({ width: 300, height: 400 });
  document.body.appendChild(last.dom);
  await last.fill(d, d.content.size - 4, renderSlice);
  results.moved = await new Promise((resolve) => {
    last.moved.addEventListener('moved', () => resolve(true));
    last.content.querySelector('img').style.height = '80px';
    setTimeout(() => resolve(false), 500);
  });

  return results;
}
