import { describe, expect, it } from 'vitest';

import { SalesforceLogScanner } from './index.js';

describe('SalesforceLogScanner', () => {
  it('captures timestamp, event type, details and source line', () => {
    const content = [
      '123|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000000|AccountApi.getAccount()',
      '456|USER_DEBUG|[1]|DEBUG|starting request',
      '789|EXCEPTION_THROWN|[42]|System.NullPointerException: Attempt to de-reference a null object',
      'not-a-log-line'
    ].join('\n');

    const result = new SalesforceLogScanner().scan(content);

    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toEqual({
      id: 'raw-1',
      timestamp: 123,
      eventType: 'CODE_UNIT_STARTED',
      details: '[EXTERNAL]|01p000000000000|AccountApi.getAccount()',
      lineNumber: 1,
      rawLine: '123|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000000|AccountApi.getAccount()'
    });
    expect(result.events[1]?.eventType).toBe('USER_DEBUG');
    expect(result.events[2]?.eventType).toBe('EXCEPTION_THROWN');
    expect(result.ignoredLineCount).toBe(1);
  });

  it('parses Salesforce high-resolution timestamps in parentheses', () => {
    const content = [
      '00:29:50.54 (54115287)|EXECUTION_STARTED',
      '00:29:50.55 (54126731)|USER_DEBUG|[1]|DEBUG|starting request',
      '00:29:50.56 (54138882)|EXCEPTION_THROWN|[42]|System.MathException: Divide by 0'
    ].join('\n');

    const result = new SalesforceLogScanner().scan(content);

    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      timestamp: 54115287,
      eventType: 'EXECUTION_STARTED'
    });
    expect(result.events[1]).toMatchObject({
      timestamp: 54126731,
      eventType: 'USER_DEBUG',
      details: '[1]|DEBUG|starting request'
    });
    expect(result.events[2]).toMatchObject({
      timestamp: 54138882,
      eventType: 'EXCEPTION_THROWN'
    });
  });

  it('counts event types without collapsing unknown Salesforce events', () => {
    const content = [
      '1|FLOW_START_INTERVIEW_BEGIN|flow',
      '2|FLOW_ELEMENT_BEGIN|element',
      '3|FLOW_ELEMENT_BEGIN|another element',
      '4|FATAL_ERROR|error'
    ].join('\n');

    const result = new SalesforceLogScanner().scan(content);

    expect(result.eventTypeCounts).toEqual({
      FLOW_START_INTERVIEW_BEGIN: 1,
      FLOW_ELEMENT_BEGIN: 2,
      FATAL_ERROR: 1
    });
  });

  it('ignores blank lines', () => {
    const result = new SalesforceLogScanner().scan('\n\n1|USER_DEBUG|message\n\n');

    expect(result.events).toHaveLength(1);
    expect(result.ignoredLineCount).toBe(0);
  });
});
