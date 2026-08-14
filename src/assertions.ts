import type { AssertionConfig, AssertionResult } from './types.js';

function normalize(value: string, caseSensitive: boolean | undefined): string {
  return caseSensitive === true ? value : value.toLocaleLowerCase('en-US');
}

function describeText(value: string): string {
  return JSON.stringify(value);
}

export function evaluateAssertion(assertion: AssertionConfig, response: string): AssertionResult {
  switch (assertion.type) {
    case 'contains': {
      const passed = normalize(response, assertion.caseSensitive).includes(
        normalize(assertion.value, assertion.caseSensitive),
      );
      return {
        assertion,
        passed,
        message: passed
          ? `contained ${describeText(assertion.value)}`
          : `expected response to contain ${describeText(assertion.value)}`,
      };
    }
    case 'notContains': {
      const passed = !normalize(response, assertion.caseSensitive).includes(
        normalize(assertion.value, assertion.caseSensitive),
      );
      return {
        assertion,
        passed,
        message: passed
          ? `excluded ${describeText(assertion.value)}`
          : `expected response not to contain ${describeText(assertion.value)}`,
      };
    }
    case 'equals': {
      const passed =
        normalize(response.trim(), assertion.caseSensitive) ===
        normalize(assertion.value.trim(), assertion.caseSensitive);
      return {
        assertion,
        passed,
        message: passed
          ? `equalled ${describeText(assertion.value)}`
          : `expected response to equal ${describeText(assertion.value)}`,
      };
    }
    case 'matches': {
      const passed = new RegExp(assertion.pattern, assertion.flags).test(response);
      return {
        assertion,
        passed,
        message: passed
          ? `matched /${assertion.pattern}/${assertion.flags ?? ''}`
          : `expected response to match /${assertion.pattern}/${assertion.flags ?? ''}`,
      };
    }
  }
}

export function evaluateAssertions(
  assertions: AssertionConfig[],
  response: string,
): AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(assertion, response));
}
