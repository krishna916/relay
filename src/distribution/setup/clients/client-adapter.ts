import type { MutableIntegrationClient } from '../setup-types.js';

export type { MutableIntegrationClient } from '../setup-types.js';

export interface ClientEntryState {
  readonly kind: 'absent' | 'matching' | 'conflicting';
  readonly command?: string;
  readonly args?: readonly string[];
}

export interface ClientConfigAdapter {
  readonly client: MutableIntegrationClient;
  parse(content: string): void;
  inspect(content: string): ClientEntryState;
  upsertRelayEntry(content: string): string;
  removeRelayEntry(content: string): string;
  renderSnippet(): string;
}
