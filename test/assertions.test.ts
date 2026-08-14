import { describe, expect, it } from 'vitest';

import { evaluateAssertion, evaluateAssertions } from '../src/assertions.js';

describe('assertions', () => {
  it('checks contains without case sensitivity by default', () => {
    expect(evaluateAssertion({ type: 'contains', value: 'orbit' }, 'Project ORBIT').passed).toBe(
      true,
    );
    expect(
      evaluateAssertion({ type: 'contains', value: 'missing' }, 'Project ORBIT'),
    ).toMatchObject({
      passed: false,
      message: 'expected response to contain "missing"',
    });
  });

  it('checks contains with case sensitivity', () => {
    expect(
      evaluateAssertion({ type: 'contains', value: 'orbit', caseSensitive: true }, 'ORBIT').passed,
    ).toBe(false);
  });

  it('checks excluded text', () => {
    expect(evaluateAssertion({ type: 'notContains', value: 'NOVA' }, 'ORBIT').passed).toBe(true);
    expect(evaluateAssertion({ type: 'notContains', value: 'NOVA' }, 'Use NOVA').passed).toBe(
      false,
    );
  });

  it('checks trimmed equality', () => {
    expect(evaluateAssertion({ type: 'equals', value: 'ORBIT' }, ' ORBIT\n').passed).toBe(true);
    expect(
      evaluateAssertion({ type: 'equals', value: 'ORBIT', caseSensitive: true }, 'orbit').passed,
    ).toBe(false);
  });

  it('checks regular expressions and evaluates a group', () => {
    expect(
      evaluateAssertion({ type: 'matches', pattern: '^orb', flags: 'i' }, 'ORBIT').passed,
    ).toBe(true);
    expect(
      evaluateAssertions(
        [
          { type: 'contains', value: 'ORBIT' },
          { type: 'notContains', value: 'NOVA' },
        ],
        'ORBIT',
      ).every((result) => result.passed),
    ).toBe(true);
  });
});
