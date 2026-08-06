import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const REQUIRED_ONLY_BUILT_DEPENDENCIES = ['better-sqlite3', 'esbuild'] as const;
export const REQUIRED_PNPM_OVERRIDES = {
  tmp: '0.2.7',
  'brace-expansion@>=4.0.0 <5.0.9': '5.0.9',
} as const;

interface PackageJson {
  readonly name?: string;
  readonly private?: boolean;
  readonly version?: string;
  readonly engines?: { readonly node?: string };
  readonly bin?: Record<string, string>;
  readonly pnpm?: {
    readonly overrides?: Record<string, string>;
    readonly onlyBuiltDependencies?: readonly string[];
  };
  readonly files?: readonly string[];
  readonly license?: string;
}

export function countTopLevelKey(source: string, key: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let count = 0;
  const quotedKey = JSON.stringify(key);
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      if (depth === 1 && source.slice(index, index + quotedKey.length) === quotedKey) {
        const rest = source.slice(index + quotedKey.length).match(/^\s*:/);
        if (rest) count += 1;
      }
      inString = true;
    } else if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
  }
  return count;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function verifyPackageMetadata(rootDir: string): void {
  const resolvedRoot = resolve(rootDir);
  const packagePath = join(resolvedRoot, 'package.json');
  const packageText = readFileSync(packagePath, 'utf8');
  assert(
    countTopLevelKey(packageText, 'pnpm') === 1,
    'package.json must contain one top-level pnpm object.',
  );
  const pkg = JSON.parse(packageText) as PackageJson;
  assert(pkg.name === '@krishna916/relay', 'package.json name must be @krishna916/relay.');
  assert(pkg.private !== true, 'Publishable Relay package must not be private.');
  assert(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(pkg.version ?? ''),
    'package.json version must be SemVer.',
  );
  assert(pkg.engines?.node === '>=24 <25', 'package.json engines.node must be >=24 <25.');
  assert(
    JSON.stringify(pkg.bin) === JSON.stringify({ relay: './dist/cli/main.js' }),
    'package.json bin must expose only relay.',
  );
  assert(
    JSON.stringify(pkg.pnpm?.overrides) === JSON.stringify(REQUIRED_PNPM_OVERRIDES),
    'package.json must preserve the required pnpm overrides.',
  );
  assert(
    JSON.stringify(pkg.pnpm?.onlyBuiltDependencies) ===
      JSON.stringify(REQUIRED_ONLY_BUILT_DEPENDENCIES),
    'package.json must approve better-sqlite3 and esbuild builds.',
  );
  assert(
    typeof pkg.license === 'string' && pkg.license.length > 0,
    'package.json must declare a license.',
  );
  assert(
    Array.isArray(pkg.files) && pkg.files.includes('dist/'),
    'package.json must declare a positive dist/ files allowlist.',
  );

  const lockfile = readFileSync(join(resolvedRoot, 'pnpm-lock.yaml'), 'utf8');
  assert(
    !/tmp@0\.0\.33|\btmp:\s*0\.0\.33\b/.test(lockfile),
    'pnpm-lock.yaml must not regress to tmp@0.0.33.',
  );
  assert(/tmp@0\.2\.7|\btmp:\s*0\.2\.7\b/.test(lockfile), 'pnpm-lock.yaml must resolve tmp@0.2.7.');
}

if (import.meta.url === new URL(`file://${process.argv[1] ?? ''}`).href) {
  try {
    verifyPackageMetadata(process.cwd());
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
