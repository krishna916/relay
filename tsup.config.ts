import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/main': 'src/interfaces/cli/main.ts',
    'mcp/main': 'src/interfaces/mcp/main.ts',
    'http/main': 'src/interfaces/http/main.ts',
  },
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  clean: false,
  sourcemap: false,
  bundle: true,
  shims: true,
});
