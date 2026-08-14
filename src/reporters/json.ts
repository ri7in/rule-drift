import type { ReportOptions, RunReport } from '../types.js';

export function formatJson(report: RunReport, options: ReportOptions = {}): string {
  return JSON.stringify(
    report,
    (key, value: unknown) =>
      key === 'response' && options.includeResponses !== true ? undefined : value,
    2,
  );
}
