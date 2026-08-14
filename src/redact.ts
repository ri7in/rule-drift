const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, 'gu');
const TOKEN_PATTERN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu;
const ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*([^\s,;]+)/giu;
const URL_CREDENTIAL_PATTERN = /(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/giu;

export function redactSensitive(value: string): string {
  return value
    .replace(ANSI_PATTERN, '')
    .replace(TOKEN_PATTERN, '$1[REDACTED]')
    .replace(ASSIGNMENT_PATTERN, '$1=[REDACTED]')
    .replace(URL_CREDENTIAL_PATTERN, '$1[REDACTED]@');
}

export function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) {
    return value;
  }
  return `${value.slice(0, maximumLength)}…`;
}
