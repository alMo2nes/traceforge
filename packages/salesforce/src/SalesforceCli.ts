import { execFile, type ExecFileOptions } from 'node:child_process';

export interface SalesforceCliRunner {
  run(args: readonly string[]): Promise<string>;
}

export type ExecFile = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => unknown;

export class SalesforceCliError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'SalesforceCliError';
  }
}

/** Executes the locally installed Salesforce CLI using its existing auth state. */
export class SalesforceCli implements SalesforceCliRunner {
  constructor(private readonly execute: ExecFile = execFile as unknown as ExecFile) {}

  async run(args: readonly string[]): Promise<string> {
    try {
      return await new Promise<string>((resolve, reject) => {
        this.execute('sf', [...args], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(stdout);
        });
      });
    } catch (error) {
      throw new SalesforceCliError(this.errorMessage(args, error), error);
    }
  }

  private errorMessage(args: readonly string[], error: unknown): string {
    const command = `sf ${args.join(' ')}`;
    const code = this.errorCode(error);

    if (code === 'ENOENT') {
      return 'Salesforce CLI is not installed or is not available on PATH.';
    }

    const details = this.errorText(error);

    if (/not authenticated|not authorized|auth.*required|no.*auth/i.test(details)) {
      return 'The selected Salesforce org is not authenticated. Run `sf org login web` and try again.';
    }

    if (/not found|invalid.*org|unknown.*org|does not exist/i.test(details)) {
      return 'The selected Salesforce org alias or username is invalid.';
    }

    return `Salesforce CLI command failed: ${command}${details ? `\n${details}` : ''}`;
  }

  private errorCode(error: unknown): string | undefined {
    return this.isObject(error) && typeof error.code === 'string'
      ? error.code
      : undefined;
  }

  private errorText(error: unknown): string {
    if (!this.isObject(error)) {
      return error instanceof Error ? error.message : '';
    }

    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    const message = typeof error.message === 'string' ? error.message : '';
    return [stderr, message].filter(Boolean).join('\n').trim();
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
