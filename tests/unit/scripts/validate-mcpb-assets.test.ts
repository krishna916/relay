import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { validateMcpbAssets } from '../../../scripts/validate-mcpb-assets.js';

const roots: string[] = [];
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'relay-mcpb-assets-'));
  roots.push(root);
  for (const file of [
    'package.json',
    'integrations/claude-desktop/manifest.json',
    'integrations/claude-desktop/package.json',
    'integrations/claude-desktop/pnpm-lock.yaml',
    'integrations/claude-desktop/.mcpbignore',
    'integrations/claude-desktop/NOTICE.md',
    'integrations/claude-desktop/README.md',
  ]) {
    const source = join(process.cwd(), file);
    const target = join(root, file);
    cpSync(source, target, { recursive: true });
  }
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
it('accepts reviewed MCPB source assets', () =>
  expect(() => validateMcpbAssets({ rootDir: fixture() })).not.toThrow());
it('rejects a non-Linux manifest', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'integrations/claude-desktop/manifest.json'),
    JSON.stringify({
      manifest_version: '0.3',
      name: 'relay',
      version: '0.1.0',
      compatibility: { platforms: ['win32'], runtimes: { node: '>=24 <25' } },
      server: {
        entry_point: 'server/main.js',
        mcp_config: { command: 'node', args: ['${__dirname}/server/main.js'] },
      },
    }),
  );
  expect(() => validateMcpbAssets({ rootDir: root })).toThrow(/platforms/);
});
