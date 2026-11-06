/**
 * Vite's configuration for the harness and the suites: the studio's generic schema is read from its checkout when one is on disk (`BELTYPE_STUDIO`), for the harness's `schema=generic` mode.
 *
 * @remarks
 * The studio is private and no dependency: a clone without it installs and tests, and only that mode needs it. Its folder is outside this root, so the server is allowed to read it. Its bare imports would otherwise resolve against the studio's `node_modules`, a second copy of `prosemirror-model`, whose nodes the state and the view here would not recognize: the three pure libraries are deduplicated to this package's copies.
 *
 * @packageDocumentation
 */

import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const studio = process.env.BELTYPE_STUDIO ?? '/Users/egildo/Privata/dev/beltype-studio-experiment';
const found = existsSync(studio);

export default {
  resolve: {
    dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform'],
    alias: found ? { 'beltype-studio-experiment': realpathSync(studio) } : {},
  },
  server: { fs: { allow: found ? [root, realpathSync(studio)] : [root] } },
};
