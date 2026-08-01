export const REQUIRED_MIGRATION_PATHS: readonly string[] = [
  'package/assets/migrations/0001_scaffold.sql',
  'package/assets/migrations/0002_tasks.sql',
  'package/assets/migrations/0003_task_session_id.sql',
  'package/assets/migrations/0004_task_normalized_title.sql',
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
  'package/integrations/codex/config.toml.example',
  'package/integrations/claude-code/README.md',
  'package/integrations/generic-mcp/server-config.json.example',
  'package/integrations/generic-cli/README.md',
  'package/LICENSE',
  'package/README.md',
  'package/THIRD_PARTY_NOTICES.md',
];

export const FORBIDDEN_PACKAGE_PATTERNS: readonly RegExp[] = [
  /^package\/(?:src|web\/src|tests|coverage|\.git|\.github|\.mcpb)(?:\/|$)/,
  /^package\/.*\.(?:db|db-wal|db-shm|log|map|tgz)$/i,
  /^package\/\.env(?:\.|$)/,
  /^package\/(?:\.artifacts|node_modules\/.*\.pnpm)(?:\/|$)/,
];
