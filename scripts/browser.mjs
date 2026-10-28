/**
 * A vite server on an ephemeral port and a headless Chromium page on it, for the suites and scripts that need a real layout.
 *
 * @remarks
 * `FRAGVIEW_VITE_CACHE` names vite's `cacheDir` when a checkout must not share another's `node_modules/.vite` (a worktree whose `node_modules` is a link). The port is the operating system's free one, read before vite starts and passed with `strictPort`, so the server never lands on a port another project holds. The server runs in this process and closes with it.
 *
 * @packageDocumentation
 */

import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address());
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Serve the package root and open `path` in a fresh Chromium page.
 * @param {string} path The page's path under the package root, as `harness/`.
 * @param {object} [options]
 * @param {boolean} [options.headless] Headless unless false.
 * @returns {Promise<{ page: import('playwright').Page, context: import('playwright').BrowserContext, url: string, close: () => Promise<void> }>}
 */
export async function open(path, { headless = true } = {}) {
  const port = await freePort();
  const server = await createServer({ root, logLevel: 'error', cacheDir: process.env.FRAGVIEW_VITE_CACHE, server: { port, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  const url = `http://127.0.0.1:${port}/${path}`;
  await page.goto(url);
  return {
    page, context, url,
    async close() {
      await browser.close();
      await server.close();
      if (errors.length) throw errors[0];
    },
  };
}
