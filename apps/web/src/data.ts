export type NodeKind =
  | 'transaction'
  | 'code-unit'
  | 'method'
  | 'soql'
  | 'dml'
  | 'flow'
  | 'exception';

export interface VariableValue {
  name: string;
  type: string;
  value: string;
}

export interface InvestigationNode {
  id: string;
  kind: NodeKind;
  label: string;
  subtitle?: string;
  line?: number;
  timestamp: string;
  durationMs?: number;
  status?: 'ok' | 'error' | 'info';
  variables: VariableValue[];
  children: InvestigationNode[];
}

export interface LogRecord {
  id: string;
  timestamp: string;
  entryPoint: string;
  operation: string;
  durationMs: number;
  sizeKb: number;
  user: string;
  status: 'Success' | 'Error';
  summary: string;
  nodes: InvestigationNode[];
}

const variables = (...items: VariableValue[]): VariableValue[] => items;

export const logs: LogRecord[] = [
  {
    id: '07L-demo-001',
    timestamp: '09:21:44.412',
    entryPoint: 'AccountController.saveAccount()',
    operation: 'Aura → Apex',
    durationMs: 128.42,
    sizeKb: 72,
    user: 'moones@example.com',
    status: 'Error',
    summary: 'NullPointerException while preparing Account update.',
    nodes: [
      {
        id: 'n-001', kind: 'transaction', label: 'AccountController.saveAccount()', subtitle: 'Apex entry point', timestamp: '09:21:44.412', durationMs: 128.42, status: 'error',
        variables: variables({ name: 'accountId', type: 'Id', value: '001…7TAAS' }, { name: 'requestMode', type: 'String', value: 'UPDATE' }),
        children: [
          { id: 'n-002', kind: 'method', label: 'AccountService.validate()', subtitle: 'Application code', line: 74, timestamp: '09:21:44.425', durationMs: 2.18, variables: variables({ name: 'account', type: 'Account', value: '{ Id: 001…7TAAS, Name: Acme }' }, { name: 'isValid', type: 'Boolean', value: 'true' }), children: [] },
          { id: 'n-003', kind: 'soql', label: 'SELECT Id, Name, Status__c FROM Account', subtitle: 'SOQL · 1 row', line: 82, timestamp: '09:21:44.431', durationMs: 14.7, status: 'ok', variables: variables({ name: 'Rows', type: 'Integer', value: '1' }), children: [] },
          { id: 'n-004', kind: 'method', label: 'NotificationService.notify()', subtitle: 'Application code', line: 93, timestamp: '09:21:44.457', durationMs: 4.31, variables: variables({ name: 'message', type: 'String', value: 'Account updated' }), children: [] },
          { id: 'n-005', kind: 'exception', label: 'NullPointerException', subtitle: 'AccountService.update()', line: 147, timestamp: '09:21:44.539', status: 'error', variables: variables({ name: 'exception', type: 'NullPointerException', value: 'Attempt to de-reference a null object' }, { name: 'account', type: 'Account', value: 'null' }), children: [] }
        ]
      }
    ]
  },
  {
    id: '07L-demo-002',
    timestamp: '09:23:10.081',
    entryPoint: 'AccountController.saveAccount()',
    operation: 'Aura → Apex',
    durationMs: 96.18,
    sizeKb: 61,
    user: 'moones@example.com',
    status: 'Success',
    summary: 'Account update completed successfully.',
    nodes: [
      { id: 'n-101', kind: 'transaction', label: 'AccountController.saveAccount()', subtitle: 'Apex entry point', timestamp: '09:23:10.081', durationMs: 96.18, status: 'ok', variables: variables({ name: 'accountId', type: 'Id', value: '001…7TAAS' }), children: [
        { id: 'n-102', kind: 'method', label: 'AccountService.validate()', subtitle: 'Application code', line: 74, timestamp: '09:23:10.095', durationMs: 1.84, variables: variables({ name: 'account', type: 'Account', value: '{ Id: 001…7TAAS, Name: Acme }' }, { name: 'isValid', type: 'Boolean', value: 'true' }), children: [] },
        { id: 'n-103', kind: 'soql', label: 'SELECT Id, Name, Status__c FROM Account', subtitle: 'SOQL · 1 row', line: 82, timestamp: '09:23:10.102', durationMs: 11.6, variables: variables({ name: 'Rows', type: 'Integer', value: '1' }), children: [] },
        { id: 'n-104', kind: 'dml', label: 'UPDATE Account', subtitle: 'DML · 1 row', line: 99, timestamp: '09:23:10.119', durationMs: 21.4, variables: variables({ name: 'Rows', type: 'Integer', value: '1' }, { name: 'Status__c', type: 'String', value: 'Active' }), children: [] },
        { id: 'n-105', kind: 'method', label: 'NotificationService.notify()', subtitle: 'Application code', line: 104, timestamp: '09:23:10.145', durationMs: 3.08, variables: variables({ name: 'message', type: 'String', value: 'Account updated' }), children: [] }
      ] }
    ]
  },
  {
    id: '07L-demo-003',
    timestamp: '09:25:02.673',
    entryPoint: 'AccountController.saveAccount()',
    operation: 'Aura → Apex → Flow',
    durationMs: 214.77,
    sizeKb: 108,
    user: 'moones@example.com',
    status: 'Error',
    summary: 'Flow action failed after Account update.',
    nodes: [
      { id: 'n-201', kind: 'transaction', label: 'AccountController.saveAccount()', subtitle: 'Apex entry point', timestamp: '09:25:02.673', durationMs: 214.77, status: 'error', variables: variables({ name: 'accountId', type: 'Id', value: '001…7TAAS' }), children: [
        { id: 'n-202', kind: 'method', label: 'AccountService.validate()', subtitle: 'Application code', line: 74, timestamp: '09:25:02.688', durationMs: 2.01, variables: variables({ name: 'isValid', type: 'Boolean', value: 'true' }), children: [] },
        { id: 'n-203', kind: 'dml', label: 'UPDATE Account', subtitle: 'DML · 1 row', line: 99, timestamp: '09:25:02.711', durationMs: 18.2, variables: variables({ name: 'Rows', type: 'Integer', value: '1' }), children: [] },
        { id: 'n-204', kind: 'flow', label: 'Flow: Account_Update', subtitle: 'Decision → Apex Action', timestamp: '09:25:02.742', durationMs: 164.1, status: 'error', variables: variables({ name: 'IsVIP', type: 'Boolean', value: 'true' }, { name: 'AccountId', type: 'Id', value: '001…7TAAS' }), children: [
          { id: 'n-205', kind: 'method', label: 'NotificationService.notify()', subtitle: 'Apex Action', line: 182, timestamp: '09:25:02.811', durationMs: 3.65, variables: variables({ name: 'message', type: 'String', value: 'VIP account updated' }), children: [] },
          { id: 'n-206', kind: 'exception', label: 'FlowFault: Notification failed', subtitle: 'Apex Action', timestamp: '09:25:02.906', status: 'error', variables: variables({ name: 'faultMessage', type: 'String', value: 'Recipient is missing' }), children: [] }
        ] }
      ] }
    ]
  },
  {
    id: '07L-demo-004',
    timestamp: '09:27:51.245',
    entryPoint: 'fot.AccountApi.getAccount()',
    operation: 'REST Apex',
    durationMs: 36.83,
    sizeKb: 47,
    user: 'integration@example.com',
    status: 'Success',
    summary: 'REST request returned Account data.',
    nodes: [
      { id: 'n-301', kind: 'transaction', label: 'fot.AccountApi.getAccount()', subtitle: 'Apex REST entry point', timestamp: '09:27:51.245', durationMs: 36.83, status: 'ok', variables: variables({ name: 'accountId', type: 'String', value: '001…7TAAS' }, { name: 'statusCode', type: 'Integer', value: '200' }), children: [
        { id: 'n-302', kind: 'method', label: 'fot.AccountApi.isValidSalesforceId()', subtitle: 'Application code', line: 32, timestamp: '09:27:51.252', durationMs: 0.19, variables: variables({ name: 'id', type: 'String', value: '001…7TAAS' }, { name: 'valid', type: 'Boolean', value: 'true' }), children: [] },
        { id: 'n-303', kind: 'soql', label: 'SELECT Id, Name FROM Account', subtitle: 'SOQL · 1 row', line: 41, timestamp: '09:27:51.258', durationMs: 17.31, variables: variables({ name: 'Rows', type: 'Integer', value: '1' }), children: [] },
        { id: 'n-304', kind: 'method', label: 'AccountApi.buildResponse()', subtitle: 'Application code', line: 51, timestamp: '09:27:51.279', durationMs: 0.41, variables: variables({ name: 'statusCode', type: 'Integer', value: '200' }), children: [] }
      ] }
    ]
  },
  {
    id: '07L-demo-005',
    timestamp: '09:29:33.009',
    entryPoint: 'AccountController.saveAccount()',
    operation: 'Aura → Apex',
    durationMs: 141.03,
    sizeKb: 84,
    user: 'moones@example.com',
    status: 'Success',
    summary: 'Account save followed by notification.',
    nodes: [
      { id: 'n-401', kind: 'transaction', label: 'AccountController.saveAccount()', subtitle: 'Apex entry point', timestamp: '09:29:33.009', durationMs: 141.03, status: 'ok', variables: variables({ name: 'accountId', type: 'Id', value: '001…7TAAS' }, { name: 'requestMode', type: 'String', value: 'UPDATE' }), children: [
        { id: 'n-402', kind: 'method', label: 'AccountService.validate()', subtitle: 'Application code', line: 74, timestamp: '09:29:33.021', durationMs: 1.96, variables: variables({ name: 'isValid', type: 'Boolean', value: 'true' }), children: [] },
        { id: 'n-403', kind: 'soql', label: 'SELECT Id, Name, Status__c FROM Account', subtitle: 'SOQL · 1 row', line: 82, timestamp: '09:29:33.030', durationMs: 9.8, variables: variables({ name: 'Rows', type: 'Integer', value: '1' }), children: [] },
        { id: 'n-404', kind: 'dml', label: 'UPDATE Account', subtitle: 'DML · 1 row', line: 99, timestamp: '09:29:33.044', durationMs: 24.2, variables: variables({ name: 'Rows', type: 'Integer', value: '1' }), children: [] },
        { id: 'n-405', kind: 'method', label: 'NotificationService.notify()', subtitle: 'Application code', line: 104, timestamp: '09:29:33.076', durationMs: 2.9, variables: variables({ name: 'message', type: 'String', value: 'Account updated' }), children: [] }
      ] }
    ]
  }
];

export const flattenNodes = (nodes: InvestigationNode[]): InvestigationNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
