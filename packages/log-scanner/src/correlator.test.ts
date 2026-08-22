import { describe, expect, it } from 'vitest';

import { SalesforceLogScanner } from './index.js';
import { decodeSemanticEvents } from './semantic.js';
import { correlateInvestigationEvents } from './correlator.js';

describe('investigation event correlator', () => {
  it('groups a DML operation and nested code unit', () => {
    const events = decodeSemanticEvents(new SalesforceLogScanner().scan([
      '1|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
      '2|DML_BEGIN|[35]|Op:Insert|Type:Account|Rows:3',
      '3|CODE_UNIT_STARTED|[EXTERNAL]|DuplicateDetector',
      '4|CODE_UNIT_FINISHED|DuplicateDetector',
      '5|DML_END|[35]',
      '6|CODE_UNIT_FINISHED|execute_anonymous_apex'
    ].join('\n')).events);

    const [root] = correlateInvestigationEvents(events);
    expect(root?.type).toBe('code-unit');
    expect(root?.name).toBe('execute_anonymous_apex');
    expect(root?.children.map((node) => `${node.type}:${node.name}`)).toEqual([
      'dml:Insert Account (3 rows)'
    ]);
    expect(root?.children[0]?.children.map((node) => `${node.type}:${node.name}`)).toEqual([
      'code-unit:DuplicateDetector'
    ]);
  });

  it('groups SOQL begin/explain/end into one node', () => {
    const events = decodeSemanticEvents(new SalesforceLogScanner().scan([
      '1|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
      '2|SOQL_EXECUTE_BEGIN|[45]|Aggregations:0|SELECT Id FROM Account',
      '3|SOQL_EXECUTE_EXPLAIN|[45]|Index on Account : [Id], relativeCost 0.333',
      '4|SOQL_EXECUTE_END|[45]|Rows:1',
      '5|CODE_UNIT_FINISHED|execute_anonymous_apex'
    ].join('\n')).events);

    const [root] = correlateInvestigationEvents(events);
    const soql = root?.children[0];
    expect(soql?.type).toBe('soql');
    expect(soql?.name).toBe('SELECT Id FROM Account');
    expect(soql?.events.map((event) => event.type)).toEqual([
      'soql-begin',
      'soql-explain',
      'soql-end'
    ]);
  });

  it('keeps variables and debug events under the active code unit', () => {
    const events = decodeSemanticEvents(new SalesforceLogScanner().scan([
      '1|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
      '2|VARIABLE_SCOPE_BEGIN|[14]|account|Account|true|false',
      '3|VARIABLE_ASSIGNMENT|[14]|account|{"Id":"001ABC"}|0x1',
      '4|USER_DEBUG|[21]|DEBUG|Processing account 001ABC',
      '5|CODE_UNIT_FINISHED|execute_anonymous_apex'
    ].join('\n')).events);

    const [root] = correlateInvestigationEvents(events);
    expect(root?.children.map((node) => node.type)).toEqual([
      'variable',
      'variable',
      'debug'
    ]);
    expect(root?.children[1]?.name).toContain('account =');
    expect(root?.children[2]?.name).toBe('Processing account 001ABC');
  });

  it('attaches exceptions to the active code unit', () => {
    const events = decodeSemanticEvents(new SalesforceLogScanner().scan([
      '1|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
      '2|EXCEPTION_THROWN|[184]|System.MathException: Divide by 0',
      '3|CODE_UNIT_FINISHED|execute_anonymous_apex'
    ].join('\n')).events);

    const [root] = correlateInvestigationEvents(events);
    expect(root?.children[0]).toMatchObject({
      type: 'exception',
      line: 184,
      name: 'System.MathException: Divide by 0'
    });
  });
});
