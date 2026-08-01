import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stagePackageAssets } from '../../scripts/package/stage-package-assets.js';

describe('packaged immutable assets', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(join(process.cwd(), 'assets', 'migrations'), { recursive: true, force: true });
  });

  it('stages canonical migrations without touching mutable runtime paths', async () => {
    await stagePackageAssets();
    const staged = join(process.cwd(), 'assets', 'migrations', '0001_scaffold.sql');
    expect(existsSync(staged)).toBe(true);
    expect(await readFile(staged, 'utf8')).toBe(
      await readFile(
        join(process.cwd(), 'src', 'database', 'migrations', '0001_scaffold.sql'),
        'utf8',
      ),
    );
    expect(existsSync(join(process.cwd(), 'assets', 'relay.db'))).toBe(false);
  });
});
