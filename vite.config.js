/**
 * Vite's configuration for the harness and the suites: the studio's generic schema is imported from the linked dev dependency `beltype-studio-experiment` (phase 3).
 *
 * @remarks
 * The link resolves to the studio's own folder, outside this root, so the server is allowed to read it. Its bare imports would otherwise resolve against the studio's `node_modules`, a second copy of `prosemirror-model`, whose nodes the state and the view here would not recognize: the three pure libraries are deduplicated to this package's copies.
 *
 * @packageDocumentation
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default {
  resolve: { dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform'] },
  server: { fs: { allow: [root, realpathSync(new URL('node_modules/beltype-studio-experiment', import.meta.url))] } },
};
