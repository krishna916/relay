export const REQUIRED_MIGRATION_PATHS: readonly string[] = [
  'package/assets/migrations/0001_scaffold.sql',
  'package/assets/migrations/0002_tasks.sql',
  'package/assets/migrations/0003_task_session_id.sql',
  'package/assets/migrations/0004_task_normalized_title.sql',
  'package/assets/compatibility.json',
];

export const REQUIRED_PACKAGE_PATHS: readonly string[] = [
  'package/package.json',
  'package/dist/cli/main.js',
  'package/dist/mcp/main.js',
  'package/dist/http/main.js',
  'package/dist/web/index.html',
  ...REQUIRED_MIGRATION_PATHS,
  'package/skills/relay-capture/SKILL.md',
  'package/skills/relay-session-review/SKILL.md',
  'package/skills/fixtures/capture-negative.md',
  'package/skills/fixtures/capture-positive.md',
  'package/skills/fixtures/session-review-negative.md',
  'package/skills/fixtures/session-review-positive.md',
  'package/integrations/codex/config.toml.example',
  'package/integrations/codex/README.md',
  'package/integrations/claude-code/.mcp.json.example',
  'package/integrations/claude-code/README.md',
  'package/integrations/claude-desktop/.mcpbignore',
  'package/integrations/claude-desktop/NOTICE.md',
  'package/integrations/claude-desktop/README.md',
  'package/integrations/claude-desktop/manifest.json',
  'package/integrations/claude-desktop/package.json',
  'package/integrations/claude-desktop/pnpm-lock.yaml',
  'package/integrations/generic-mcp/server-config.json.example',
  'package/integrations/generic-mcp/README.md',
  'package/integrations/generic-cli/README.md',
  'package/LICENSE',
  'package/README.md',
  'package/THIRD_PARTY_NOTICES.md',
];

export const APPROVED_GENERATED_PACKAGE_PATTERNS: readonly RegExp[] = [
  /^package\/dist\/web\/assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/,
];

const approvedExactPackagePaths = new Set(REQUIRED_PACKAGE_PATHS);

export function isApprovedPackagePath(path: string): boolean {
  return (
    approvedExactPackagePaths.has(path) ||
    APPROVED_GENERATED_PACKAGE_PATTERNS.some((pattern) => pattern.test(path))
  );
}
