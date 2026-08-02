export type MutableIntegrationClient = 'codex' | 'claude-code';
export type IntegrationClient = MutableIntegrationClient | 'generic-mcp';

export type IntegrationStatus = 'enabled' | 'disabled';

export interface RelayOwnershipFile {
  readonly schemaVersion: 1;
  readonly integrations: readonly RelayIntegrationOwnership[];
}

export interface RelayIntegrationOwnership {
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly command: 'relay';
  readonly args: readonly ['mcp'];
  readonly status: IntegrationStatus;
  readonly applicationVersion: string;
  readonly lastSuccessfulSetupAt: string;
  readonly lastBackupPath?: string;
}

export type IntegrationOperation = 'created' | 'updated' | 'unchanged' | 'disabled' | 'removed';

export interface IntegrationChangePlan {
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly operation: IntegrationOperation;
  readonly changed: boolean;
  readonly beforeFingerprint: string;
  readonly nextContent: string;
  readonly snippet: string;
}

export interface IntegrationChangeResult {
  readonly client: MutableIntegrationClient;
  readonly configPath: string;
  readonly entryId: 'relay';
  readonly operation: IntegrationOperation;
  readonly changed: boolean;
  readonly backupPath?: string;
}
