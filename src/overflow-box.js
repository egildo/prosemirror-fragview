/**
 * `OverflowBox`, the basic fragmentainer: a box of fixed width and height that reports the browser's own overflow, greedy at line granularity.
 *
 * @remarks
 * `fill` renders a trial slice from `from`, lays it out, and reads the first line whose box passes the content foot: the text nodes are walked in document order and their `Range` rects read, and the cut is the first character of the first line below the foot. Its position is `to`, and the box renders again from `from` to `to`, so it shows, and maps, only what it holds. A box of height `Infinity` never cuts: `to` is always null, and nothing is measured.
 *
 * The trial is bounded. It renders `from` plus a span of positions (twice the box's last span, 2 048 on a first fill) and doubles the span until the trial runs to the end of the document or holds at least two more lines past the line of the cut. The second line is the margin: a trial that ends inside a word can let that word fit on the line before, so the line of the cut and the one before it are final only when the trial's end lies two lines further on. A refill therefore costs two renders, one of about two boxes' worth and one of the box itself, whatever the length of the document. Phase 1 rendered the whole rest of the document on every fill.
 *
 * The forced first line: a box shorter than its first line still takes that line, so `to` is strictly greater than `from` and the chain advances. A line is a candidate for the cut only when it starts below the bottom of the first line's first box.
 *
 * The shown end: a cut at the start of a textblock (the first line of a paragraph) would render the ancestors opened at the cut as empty elements at the box's foot, so the box shows up to `openedAt(doc, to)`, the position before the outermost node that opens at the cut, and its `pointAt` answers that end for the positions between it and the cut.
 *
 * An inline replaced element (an image) counts as a line of its own height; a block with no text and no image cannot be cut before. The content element is a block formatting context (`display: flow-root`), so a first child's top margin stays inside the box the foot is measured from.
 *
 * @packageDocumentation
 */

import { openedAt, pointAt, posAt } from './slice-renderer.js';

/** @import { Node as PMNode } from 'prosemirror-model' */
/** @import { FillResult, RenderedSlice, SliceRenderer } from './fragmentainer.js' */

/** The span of positions a first fill renders past `from` when measuring. */
const FIRST_SPAN = 2048;

export class OverflowBox {
  /**
   * @param {object} [options]
   * @param {number | string} [options.width] The box's width, as a CSS length or in pixels; the place's width when omitted.
   * @param {number} [options.height] The height of the box's content in pixels; `Infinity`, the default, never cuts.
   * @param {string} [options.className] A class for the box's element, for the author's styles.
   */
  constructor({ width, height = Infinity, className } = {}) {
    this.height = height;
    /** @type {HTMLElement} */
    this.dom = document.createElement('div');
    this.dom.className = 'fragview-box' + (className ? ' ' + className : '');
    if (width != null) this.dom.style.width = typeof width === 'number' ? width + 'px' : width;
    if (height !== Infinity) Object.assign(this.dom.style, { height: height + 'px', overflow: 'clip' });
    /** The element the slice is rendered into; its height is the content's own, which is what the observer watches. */
    this.content = this.dom.appendChild(document.createElement('div'));
    this.content.style.display = 'flow-root';
    /** @type {EventTarget} */
    this.moved = new EventTarget();
    /** @type {RenderedSlice | null} */
    this.rendered = null;
    /** The position the box's content stops at, as the last fill answered it. @type {number | null} */
    this.to = null;
    /** The positions the last cut fill held, the seed of the next trial's span. */
    this.span = 0;
    this.filledHeight = 0;
    // An infinite box never cuts, so a height change cannot move its `to`; only a finite box listens. The event leaves the observer's callback for the next frame: a listener that refills inside the callback changes the sizes being observed, and the browser reports a ResizeObserver loop.
    this.observer = height === Infinity ? null : new ResizeObserver(([entry]) => {
      if (this.rendered && entry.contentRect.height !== this.filledHeight) requestAnimationFrame(() => { if (this.rendered) this.moved.dispatchEvent(new Event('moved')); });
    });
  }

  /**
   * Render the slice of `doc` from `from` and answer where the box ends.
   * @param {PMNode} doc
   * @param {number} from
   * @param {SliceRenderer} render
   * @returns {Promise<FillResult>}
   */
  async fill(doc, from, render) {
    this.to = null;
    if (this.height === Infinity) {
      this.show(render(doc, from, null));
      return { to: null };
    }
    const size = doc.content.size;
    let span = this.span ? this.span * 2 : FIRST_SPAN;
    let cut;
    for (;;) {
      const end = from + span >= size ? null : from + span;
      this.show(render(doc, from, end));
      cut = this.cut();
      if (end == null || (cut && this.content.getBoundingClientRect().bottom >= cut.bottom + 2 * cut.height)) break;
      span *= 2;
    }
    const to = cut ? cut.pos : null;
    if (to != null) {
      this.span = to - from;
      this.show(render(doc, from, openedAt(doc, to)));
    }
    this.to = to;
    this.filledHeight = this.content.getBoundingClientRect().height;
    this.observer?.observe(this.content);
    return { to };
  }

  /** @param {RenderedSlice} rendered */
  show(rendered) {
    this.rendered = rendered;
    this.content.replaceChildren(rendered.fragment);
  }

  /**
   * The first line whose box passes the content foot, the first line excepted: its first position, its bottom and its height; null when every line fits.
   * @returns {{ pos: number, bottom: number, height: number } | null}
   */
  cut() {
    const foot = this.content.getBoundingClientRect().top + this.height;
    const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const range = document.createRange();
    /** The bottom of the first line's first box: a line is a candidate only when it starts at or below it. @type {number | null} */
    let first = null;
    const passes = (/** @type {DOMRect} */ r) => {
      if (first == null) first = r.bottom;
      return r.bottom > foot && r.top >= first - 1;
    };
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 1) {
        if (node.nodeName !== 'IMG') continue;
        const rect = /** @type {Element} */ (node).getBoundingClientRect();
        if (!passes(rect)) continue;
        const parent = /** @type {globalThis.Node} */ (node.parentNode);
        const pos = this.posAt(parent, Array.prototype.indexOf.call(parent.childNodes, node));
        return pos == null ? null : { pos, bottom: rect.bottom, height: rect.height };
      }
      const text = /** @type {Text} */ (node);
      range.selectNodeContents(text);
      if (![...range.getClientRects()].some(passes)) continue;
      // The first character whose line passes: lines run down the text node in order, so a binary search holds.
      let lo = 0, hi = text.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        range.setStart(text, mid); range.setEnd(text, mid + 1);
        const rect = range.getClientRects()[0];
        if (rect && passes(rect)) hi = mid; else lo = mid + 1;
      }
      range.setStart(text, lo); range.setEnd(text, lo + 1);
      const rect = range.getBoundingClientRect();
      const pos = this.posAt(text, lo);
      return pos == null ? null : { pos, bottom: rect.bottom, height: rect.height };
    }
    return null;
  }

  /** @param {number} pos */
  pointAt(pos) {
    if (!this.rendered) return null;
    if (this.to != null && pos > this.rendered.to && pos <= this.to) pos = this.rendered.to;
    return pointAt(this.content, this.rendered.positions, pos);
  }

  /**
   * @param {globalThis.Node} node
   * @param {number} offset
   */
  posAt(node, offset) {
    if (!this.rendered || !this.content.contains(node)) return null;
    return posAt(this.content, this.rendered.positions, node, offset);
  }

  release() {
    this.observer?.disconnect();
    this.rendered = null;
  }
}
