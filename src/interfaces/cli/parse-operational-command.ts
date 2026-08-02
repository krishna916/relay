import { isAbsolute } from 'node:path';
import type {
  IntegrationClient,
  MutableIntegrationClient,
} from '../../distribution/setup/setup-types.js';
import { CliUsageError } from './output/cli-errors.js';

export type OperationalCommand =
  | {
      readonly kind: 'setup';
      readonly client?: IntegrationClient;
      readonly configFile?: string;
      readonly apply: boolean;
    }
  | { readonly kind: 'config-paths' }
  | { readonly kind: 'config-integrations' }
  | { readonly kind: 'config-snippet'; readonly client: IntegrationClient }
  | {
      readonly kind: 'config-disable' | 'config-remove';
      readonly client: MutableIntegrationClient;
      readonly configFile: string;
      readonly apply: true;
    };

export function parseOperationalCommand(argv: readonly string[]): OperationalCommand {
  const [group, ...rest] = argv;
  if (group === 'setup') return parseSetup(rest);
  const [action, ...tokens] = rest;
  if (group !== 'config') throw new CliUsageError('Unknown or missing command.');
  if (action === 'paths') return exact('config paths', tokens, { kind: 'config-paths' });
  if (action === 'integrations')
    return exact('config integrations', tokens, { kind: 'config-integrations' });
  if (action === 'snippet') {
    const options = parseOptions(tokens, { client: true, output: true });
    const client = clientValue(options.client);
    if (client === undefined) throw new CliUsageError('Missing required option --client.');
    return { kind: 'config-snippet', client };
  }
  if (action === 'disable' || action === 'remove') {
    const options = parseOptions(tokens, {
      client: true,
      'config-file': true,
      apply: false,
      output: true,
    });
    const client = mutableClient(options.client);
    const configFile = absoluteConfigFile(options['config-file']);
    if (!options.apply) throw new CliUsageError(`${action} requires --apply.`);
    return {
      kind: action === 'disable' ? 'config-disable' : 'config-remove',
      client,
      configFile,
      apply: true,
    };
  }
  throw new CliUsageError(`Unknown command: config ${action ?? ''}`.trim());
}

function parseSetup(tokens: readonly string[]): OperationalCommand {
  const options = parseOptions(tokens, {
    client: true,
    'config-file': true,
    apply: false,
    output: true,
  });
  const client = clientValue(options.client);
  const configFile = options['config-file'];
  if (client === undefined) {
    if (configFile !== undefined || options.apply)
      throw new CliUsageError('--client is required for client setup.');
    return { kind: 'setup', apply: false };
  }
  if (client === 'generic-mcp') {
    if (configFile !== undefined || options.apply)
      throw new CliUsageError('generic-mcp setup is snippet-only.');
    return { kind: 'setup', client, apply: false };
  }
  return {
    kind: 'setup',
    client,
    configFile: absoluteConfigFile(configFile),
    apply: Boolean(options.apply),
  };
}

function parseOptions(
  tokens: readonly string[],
  specs: Readonly<Record<string, boolean>>,
): Record<string, string | true | undefined> {
  const result: Record<string, string | true | undefined> = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !token.startsWith('--'))
      throw new CliUsageError(`Unexpected argument: ${token ?? ''}`.trim());
    const key = token.slice(2);
    if (!(key in specs)) throw new CliUsageError(`Unknown option --${key}.`);
    if (result[key] !== undefined)
      throw new CliUsageError(`Option --${key} may be supplied only once.`);
    if (!specs[key]) {
      result[key] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new CliUsageError(`Missing value for --${key}.`);
    result[key] = value;
    if (key === 'output' && value !== 'json')
      throw new CliUsageError('Operational commands support only --output json.');
    index += 1;
  }
  return result;
}

function clientValue(value: string | true | undefined): IntegrationClient | undefined {
  if (value === undefined) return undefined;
  if (value === 'codex' || value === 'claude-code' || value === 'generic-mcp') return value;
  throw new CliUsageError('Unsupported integration client.');
}

function mutableClient(value: string | true | undefined): MutableIntegrationClient {
  const client = clientValue(value);
  if (client !== 'codex' && client !== 'claude-code')
    throw new CliUsageError('This operation supports only Codex or Claude Code.');
  return client;
}

function absoluteConfigFile(value: string | true | undefined): string {
  if (typeof value !== 'string' || value.trim() === '' || !isAbsolute(value))
    throw new CliUsageError('--config-file must be an absolute path.');
  return value;
}

function exact<T extends OperationalCommand>(
  name: string,
  tokens: readonly string[],
  command: T,
): T {
  if (
    tokens.length > 0 &&
    !(tokens.length === 2 && tokens[0] === '--output' && tokens[1] === 'json')
  )
    throw new CliUsageError(`${name} does not accept options.`);
  return command;
}
