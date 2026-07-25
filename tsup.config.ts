import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'mcp/main': 'src/interfaces/mcp/main.ts',
    'http/main': 'src/interfaces/http/main.ts',
  },
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  bundle: true,
  shims: true,
});
