import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backupAndAtomicWrite,
  restoreOriginalFile,
} from '../../../../src/distribution/setup/backup-and-atomic-write.js';
import { fingerprint } from '../../../../src/distribution/setup/plan-integration-change.js';

describe('backupAndAtomicWrite', () => {
  it('backs up exact bytes and replaces the file with a validated result', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-write-'));
    const path = join(root, 'config.json');
    const original = '{\n  "other": true\n}\n';
    writeFileSync(path, original);
    const result = await backupAndAtomicWrite({
      targetPath: path,
      expectedFingerprint: fingerprint(original),
      nextContent: '{\n  "relay": true\n}\n',
      validate: (content) => JSON.parse(content) as unknown,
      now: new Date('2026-08-02T01:02:03.004Z'),
    });
    expect(result.backupPath).toBeDefined();
    expect(readFileSync(result.backupPath!, 'utf8')).toBe(original);
    expect(readFileSync(path, 'utf8')).toContain('relay');
    expect(result.backupPath).toContain('.relay-backup-20260802T010203.004Z');
  });

  it('rejects a pre-replacement race without changing the target', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-write-'));
    const path = join(root, 'config.json');
    writeFileSync(path, 'before');
    await expect(
      backupAndAtomicWrite({
        targetPath: path,
        expectedFingerprint: fingerprint('different'),
        nextContent: 'after',
        validate: () => undefined,
        now: new Date('2026-08-02T01:02:03.004Z'),
      }),
    ).rejects.toThrow(/changed/i);
    expect(readFileSync(path, 'utf8')).toBe('before');
  });

  it('uses a collision-safe suffix when the timestamped backup already exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-write-'));
    const path = join(root, 'config.json');
    const original = 'before';
    writeFileSync(path, original);
    writeFileSync(`${path}.relay-backup-20260802T010203.004Z`, 'previous');
    const result = await backupAndAtomicWrite({
      targetPath: path,
      expectedFingerprint: fingerprint(original),
      nextContent: 'after',
      validate: () => undefined,
      now: new Date('2026-08-02T01:02:03.004Z'),
    });
    expect(result.backupPath).toContain('.relay-backup-20260802T010203.004Z-1');
    expect(readFileSync(result.backupPath!, 'utf8')).toBe(original);
  });

  it('restores a missing original file to absence without creating a backup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-write-'));
    const path = join(root, 'new-config.toml');
    const result = await backupAndAtomicWrite({
      targetPath: path,
      expectedFingerprint: fingerprint(''),
      nextContent: 'created',
      validate: () => undefined,
      now: new Date('2026-08-02T01:02:03.004Z'),
    });

    expect(result.originalExisted).toBe(false);
    expect(result.backupPath).toBeUndefined();
    expect(existsSync(path)).toBe(true);
    await restoreOriginalFile({ ...result, targetPath: path });
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(root).some((name) => name.includes('.relay-backup-'))).toBe(false);
  });

  it('restores an existing target with exact bytes and mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-write-'));
    const path = join(root, 'existing-config.toml');
    const original = '[profile]\nname = "existing"\n';
    writeFileSync(path, original);
    chmodSync(path, 0o640);
    const originalMode = statSync(path).mode & 0o777;
    const result = await backupAndAtomicWrite({
      targetPath: path,
      expectedFingerprint: fingerprint(original),
      nextContent: '[mcp_servers.relay]\ncommand = "relay"\nargs = ["mcp"]\n',
      validate: () => undefined,
      now: new Date('2026-08-02T01:02:03.004Z'),
    });

    await restoreOriginalFile({ ...result, targetPath: path });

    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(statSync(path).mode & 0o777).toBe(originalMode);
  });
});
