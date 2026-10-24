/**
 * `OverflowBox`, the basic fragmentainer: a box of fixed width and height that reports the browser's own overflow, greedy at line granularity.
 *
 * @remarks
 * `fill` renders the slice from `from` to the end, lays it out, and reads the first line whose box passes the content foot: the text nodes are walked in document order and their `Range` rects read, and the cut is the first character of the first line below the foot. Its position is `to`, and the box renders again from `from` to `to`, so it shows, and maps, only what it holds. A box of height `Infinity` never cuts: `to` is always null, and nothing is measured.
 *
 * Measuring renders the rest of the document once per fill, which is quadratic over a long chain of boxes. ponytail: whole-tail render per measure; render a page's worth past the foot when the chain grows long (phase 2).
 *
 * An inline replaced element (an image) counts as a line of its own height; a block with no text and no image cannot be cut before.
 *
 * @packageDocumentation
 */

import { pointAt, posAt } from './slice-renderer.js';

/** @import { Node as PMNode } from 'prosemirror-model' */
/** @import { FillResult, RenderedSlice, SliceRenderer } from './fragmentainer.js' */

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
    /** @type {EventTarget} */
    this.moved = new EventTarget();
    /** @type {RenderedSlice | null} */
    this.rendered = null;
    this.filledHeight = 0;
    // An infinite box never cuts, so a height change cannot move its `to`; only a finite box listens.
    this.observer = height === Infinity ? null : new ResizeObserver(([entry]) => {
      if (this.rendered && entry.contentRect.height !== this.filledHeight) this.moved.dispatchEvent(new Event('moved'));
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
    this.show(render(doc, from, null));
    let to = null;
    if (this.height !== Infinity) {
      // ponytail: a cut at the box's own `from` (a first line taller than the box) is answered as is; the chain must force one line in (phase 2).
      to = this.cut();
      if (to != null) this.show(render(doc, from, to));
      this.filledHeight = this.content.getBoundingClientRect().height;
      this.observer?.observe(this.content);
    }
    return { to };
  }

  /** @param {RenderedSlice} rendered */
  show(rendered) {
    this.rendered = rendered;
    this.content.replaceChildren(rendered.fragment);
  }

  /**
   * The position of the first line whose box passes the content foot, or null when every line fits.
   * @returns {number | null}
   */
  cut() {
    const foot = this.content.getBoundingClientRect().top + this.height;
    const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 1) {
        if (node.nodeName !== 'IMG') continue;
        if (/** @type {Element} */ (node).getBoundingClientRect().bottom > foot) return this.posAt(node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node));
        continue;
      }
      const text = /** @type {Text} */ (node);
      range.selectNodeContents(text);
      if (![...range.getClientRects()].some((r) => r.bottom > foot)) continue;
      // The first character whose line passes the foot: lines run down the text node in order, so a binary search holds.
      let lo = 0, hi = text.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        range.setStart(text, mid); range.setEnd(text, mid + 1);
        const rect = range.getClientRects()[0];
        if (rect && rect.bottom > foot) hi = mid; else lo = mid + 1;
      }
      return this.posAt(text, lo);
    }
    return null;
  }

  /** @param {number} pos */
  pointAt(pos) {
    return this.rendered && pointAt(this.content, this.rendered.positions, pos);
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
