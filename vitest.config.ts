import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    fileParallelism: false,
    include: ['tests/**/*.test.ts', 'web/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/application/**/*.ts',
        'src/database/*.ts',
        'src/interfaces/mcp/create-mcp-server.ts',
        'src/interfaces/http/create-http-server.ts',
        'web/src/api/**/*.ts',
        'web/src/App.tsx',
      ],
      exclude: ['src/application/health/health.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
