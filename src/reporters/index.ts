import { formatJson } from './json.js';
import { formatJunit } from './junit.js';
import { formatPretty } from './pretty.js';
import type { ReportOptions, RunReport } from '../types.js';

export type Reporter = 'json' | 'junit' | 'pretty';

export function formatReport(
  report: RunReport,
  reporter: Reporter,
  options: ReportOptions = {},
): string {
  switch (reporter) {
    case 'json':
      return `${formatJson(report, options)}\n`;
    case 'junit':
      return formatJunit(report, options);
    case 'pretty':
      return formatPretty(report, options);
  }
}

export { formatJson } from './json.js';
export { formatJunit } from './junit.js';
export { formatPretty } from './pretty.js';
