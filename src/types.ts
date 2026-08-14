export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Severity = 'critical' | 'warning' | 'info';

export interface RuleConfig {
  id: string;
  instruction: string;
  severity?: Severity;
}

export interface ConversationTurnConfig {
  prompt: string;
}

interface TextAssertionBase {
  caseSensitive?: boolean;
  value: string;
}

export interface ContainsAssertionConfig extends TextAssertionBase {
  type: 'contains';
}

export interface NotContainsAssertionConfig extends TextAssertionBase {
  type: 'notContains';
}

export interface EqualsAssertionConfig extends TextAssertionBase {
  type: 'equals';
}

export interface MatchesAssertionConfig {
  type: 'matches';
  pattern: string;
  flags?: string;
}

export type AssertionConfig =
  | ContainsAssertionConfig
  | EqualsAssertionConfig
  | MatchesAssertionConfig
  | NotContainsAssertionConfig;

export interface ProbeConfig {
  id: string;
  ruleId: string;
  afterTurn: number;
  prompt: string;
  assertions: AssertionConfig[];
}

export interface ScenarioConfig {
  id: string;
  description?: string;
  turns: ConversationTurnConfig[];
  probes: ProbeConfig[];
}

interface AdapterConfigBase {
  timeoutMs?: number;
}

export interface OllamaAdapterConfig extends AdapterConfigBase {
  type: 'ollama';
  model: string;
  baseUrl?: string;
  think?: boolean;
  options?: Record<string, JsonValue>;
}

export interface CommandAdapterConfig extends AdapterConfigBase {
  type: 'command';
  command: string;
  args?: string[];
  cwd?: string;
}

export type AdapterConfig = CommandAdapterConfig | OllamaAdapterConfig;

export interface RuleDriftConfig {
  version: 1;
  name: string;
  systemPrompt?: string;
  adapter: AdapterConfig;
  rules: RuleConfig[];
  scenarios: ScenarioConfig[];
}

export type ChatRole = 'assistant' | 'system' | 'user';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AdapterRequest {
  protocolVersion: 1;
  messages: ChatMessage[];
  context: {
    scenarioId: string;
    kind: 'probe' | 'turn';
    itemId: string;
    afterTurn: number;
  };
}

export interface AdapterResponse {
  content: string;
}

export interface AdapterDescriptor {
  type: AdapterConfig['type'];
  model?: string;
}

export interface Adapter {
  readonly descriptor: AdapterDescriptor;
  complete(request: AdapterRequest): Promise<AdapterResponse>;
}

export interface AssertionResult {
  assertion: AssertionConfig;
  passed: boolean;
  message: string;
}

export interface ProbeResult {
  id: string;
  ruleId: string;
  afterTurn: number;
  prompt: string;
  response: string;
  responseLength: number;
  responseSha256: string;
  durationMs: number;
  passed: boolean;
  assertions: AssertionResult[];
}

export interface ScenarioError {
  afterTurn: number;
  itemId: string;
  kind: 'probe' | 'turn';
  message: string;
}

export interface ScenarioResult {
  id: string;
  description?: string;
  status: 'passed' | 'failed' | 'error';
  durationMs: number;
  probes: ProbeResult[];
  error?: ScenarioError;
}

export interface RuleSummary {
  id: string;
  severity: Severity;
  status: 'passed' | 'failed' | 'not-run';
  total: number;
  passed: number;
  passRate: number | null;
  firstFailure?: {
    scenarioId: string;
    probeId: string;
    afterTurn: number;
  };
}

export interface RunSummary {
  status: 'passed' | 'failed' | 'error';
  scenarios: number;
  scenariosPassed: number;
  scenariosFailed: number;
  scenariosErrored: number;
  probes: number;
  probesPassed: number;
  probesFailed: number;
  passRate: number | null;
}

export interface RunReport {
  schemaVersion: 1;
  suite: string;
  adapter: AdapterDescriptor;
  startedAt: string;
  durationMs: number;
  summary: RunSummary;
  rules: RuleSummary[];
  scenarios: ScenarioResult[];
}

export interface ReportOptions {
  includeResponses?: boolean;
  color?: boolean;
}
