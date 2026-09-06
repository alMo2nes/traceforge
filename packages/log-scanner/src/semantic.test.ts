import { describe, expect, it } from 'vitest';

import { SalesforceLogScanner } from './index.js';
import { decodeSemanticEvent, decodeSemanticEvents } from './semantic.js';

describe('Salesforce semantic event decoder', () => {
  it('decodes variable assignments and preserves values', () => {
    const raw = new SalesforceLogScanner().scan(
      '1|VARIABLE_ASSIGNMENT|[72]|account|{"Id":"001ABC","Name":"Acme"}|0x123'
    ).events[0]!;

    expect(decodeSemanticEvent(raw)).toMatchObject({
      type: 'variable-assignment',
      line: 72,
      name: 'account',
      value: '{"Id":"001ABC","Name":"Acme"}',
      details: { heapReference: '0x123' }
    });
  });

  it('decodes USER_DEBUG into level and message', () => {
    const raw = new SalesforceLogScanner().scan(
      '2|USER_DEBUG|[74]|INFO|Processed account 001ABC'
    ).events[0]!;

    expect(decodeSemanticEvent(raw)).toMatchObject({
      type: 'user-debug',
      line: 74,
      value: 'Processed account 001ABC',
      details: {
        level: 'INFO',
        message: 'Processed account 001ABC'
      }
    });
  });

  it('decodes SOQL, DML and exception events', () => {
    const result = new SalesforceLogScanner().scan([
      '3|SOQL_EXECUTE_BEGIN|[45]|Aggregations:0|SELECT Id, Name FROM Account',
      '4|SOQL_EXECUTE_END|[45]|Rows:3',
      '5|DML_BEGIN|[35]|Op:Insert|Type:Account|Rows:3',
      '6|DML_END|[35]',
      '7|EXCEPTION_THROWN|[184]|System.MathException: Divide by 0'
    ].join('\n'));

    expect(decodeSemanticEvents(result.events).map((event) => event.type)).toEqual([
      'soql-begin',
      'soql-end',
      'dml-begin',
      'dml-end',
      'exception'
    ]);

    expect(decodeSemanticEvent(result.events[0]!)).toMatchObject({
      line: 45,
      details: {
        Aggregations: '0',
        value: 'SELECT Id, Name FROM Account'
      }
    });

    expect(decodeSemanticEvent(result.events[2]!)).toMatchObject({
      line: 35,
      details: {
        Op: 'Insert',
        Type: 'Account',
        Rows: '3'
      }
    });

    expect(decodeSemanticEvent(result.events[4]!)).toMatchObject({
      line: 184,
      value: 'System.MathException: Divide by 0'
    });
  });

  it('decodes code-unit and method names from external event details', () => {
    const result = new SalesforceLogScanner().scan([
      '8|CODE_UNIT_STARTED|[EXTERNAL]|DuplicateDetector',
      '9|METHOD_ENTRY|[133]||System.JSON.serialize(Object)',
      '10|METHOD_EXIT|[133]||System.JSON.serialize(Object)',
      '11|CODE_UNIT_FINISHED|DuplicateDetector'
    ].join('\n'));

    expect(decodeSemanticEvents(result.events)).toMatchObject([
      { type: 'code-unit-start', name: 'DuplicateDetector' },
      { type: 'method-entry', line: 133, name: 'System.JSON.serialize(Object)' },
      { type: 'method-exit', line: 133, name: 'System.JSON.serialize(Object)' },
      { type: 'code-unit-finish', name: 'DuplicateDetector' }
    ]);
  });
});
