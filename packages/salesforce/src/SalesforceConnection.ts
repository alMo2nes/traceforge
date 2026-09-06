import { Connection } from 'jsforce';

import { SalesforceCli, SalesforceCliError, type SalesforceCliRunner } from './SalesforceCli.js';

interface OrgDisplayResult {
  result?: {
    instanceUrl?: unknown;
    instanceApiVersion?: unknown;
  };
}

interface AccessTokenResult {
  result?: unknown;
}

/**
 * Creates a JSforce connection from the auth session already maintained by sf CLI.
 * The CLI is used only to access local auth state; Salesforce API operations
 * are performed directly through JSforce.
 */
export class SalesforceConnectionService {
  constructor(private readonly cli: SalesforceCliRunner = new SalesforceCli()) {}

  async connect(org: string): Promise<Connection> {
    // `sf org display --json` no longer exposes the access token in current
    // Salesforce CLI releases. Retrieve the token explicitly through the
    // documented auth command instead.
    const [displayOutput, tokenOutput] = await Promise.all([
      this.cli.run(['org', 'display', '--target-org', org, '--json']),
      this.cli.run(['org', 'auth', 'show-access-token', '--target-org', org, '--json'])
    ]);

    const display = this.parseDisplay(displayOutput);
    const token = this.parseAccessToken(tokenOutput);
    const instanceUrl = this.stringValue(display.result?.instanceUrl);
    const apiVersion = this.stringValue(display.result?.instanceApiVersion) ?? '67.0';

    if (!token || !instanceUrl) {
      throw new SalesforceCliError(`Salesforce CLI did not return an access token and instance URL for ${org}.`);
    }

    console.info(`[SF AUTH] resolved JSforce connection org=${org} instance=${instanceUrl} apiVersion=${apiVersion}`);

    return new Connection({
      instanceUrl,
      accessToken: token,
      version: apiVersion
    });
  }

  private parseDisplay(output: string): OrgDisplayResult {
    try {
      const cleaned = this.cleanJsonOutput(output);
      return JSON.parse(cleaned) as OrgDisplayResult;
    } catch (error) {
      throw new SalesforceCliError('Could not parse Salesforce org information.', error);
    }
  }

  private parseAccessToken(output: string): string | undefined {
    try {
      const cleaned = this.cleanJsonOutput(output);
      const value = JSON.parse(cleaned) as AccessTokenResult;

      // Current CLI JSON response is expected to place the token in result.
      if (typeof value.result === 'string') return value.result;

      if (this.isObject(value.result)) {
        for (const field of ['accessToken', 'access_token', 'token']) {
          const token = value.result[field];
          if (typeof token === 'string' && token.trim()) return token;
        }
      }

      return undefined;
    } catch (error) {
      throw new SalesforceCliError('Could not parse the Salesforce access token returned by the CLI.', error);
    }
  }

  private cleanJsonOutput(output: string): string {
    const cleaned = output
      .replace(/^\uFEFF/, '')
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    return start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
