import { Connection } from 'jsforce';

import { SalesforceCli, SalesforceCliError, type SalesforceCliRunner } from './SalesforceCli.js';

interface OrgDisplayResult {
  result?: {
    accessToken?: unknown;
    instanceUrl?: unknown;
    instanceApiVersion?: unknown;
    username?: unknown;
  };
}

/**
 * Creates a JSforce connection from the auth session already maintained by sf CLI.
 * The CLI is used only to access the local auth store; Salesforce API operations
 * are performed directly through JSforce.
 */
export class SalesforceConnectionService {
  constructor(private readonly cli: SalesforceCliRunner = new SalesforceCli()) {}

  async connect(org: string): Promise<Connection> {
    const output = await this.cli.run(['org', 'display', '--target-org', org, '--json']);
    const display = this.parseDisplay(output);
    const accessToken = this.stringValue(display.result?.accessToken);
    const instanceUrl = this.stringValue(display.result?.instanceUrl);
    const apiVersion = this.stringValue(display.result?.instanceApiVersion) ?? '67.0';

    if (!accessToken || !instanceUrl) {
      throw new SalesforceCliError(`Salesforce CLI did not return an access token and instance URL for ${org}.`);
    }

    return new Connection({
      instanceUrl,
      accessToken,
      version: apiVersion
    });
  }

  private parseDisplay(output: string): OrgDisplayResult {
    try {
      const cleaned = output.replace(/^\uFEFF/, '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      const json = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
      return JSON.parse(json) as OrgDisplayResult;
    } catch (error) {
      throw new SalesforceCliError('Could not parse Salesforce org authentication information.', error);
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
