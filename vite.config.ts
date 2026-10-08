import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Version of the data files, from their content. It is added to every data URL
 * (data/dims.json?v=...), so a new build never reads data files cached from an older build.
 */
function dataVersion(): string {
  const dir = join(__dirname, 'public', 'data');
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 12);
}

export default defineConfig({
  // Relative asset paths, so the build works under a GitHub Pages sub-path.
  base: './',
  plugins: [react()],
  define: { __DATA_VERSION__: JSON.stringify(dataVersion()) },
  server: { port: 5173, open: false },
});
