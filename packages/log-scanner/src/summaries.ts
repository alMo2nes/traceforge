export interface GovernorLimitUsage {
  namespace: string;
  metrics: Record<string, { used: number; limit: number }>;
}

export interface CumulativeProfilingEntry {
  category: 'SOQL' | 'SOSL' | 'DML' | 'METHOD' | 'UNKNOWN';
  text: string;
  line?: number;
  durationMs?: number;
  invocationCount?: number;
}

export interface SalesforceLogSummaries {
  governorLimits: GovernorLimitUsage[];
  profiling: CumulativeProfilingEntry[];
  emailsQueued?: number;
}

export function parseSalesforceLogSummaries(content: string): SalesforceLogSummaries {
  const lines = content.split(/\r?\n/);
  const governorLimits: GovernorLimitUsage[] = [];
  const profiling: CumulativeProfilingEntry[] = [];
  let emailsQueued: number | undefined;
  let currentNamespace: GovernorLimitUsage | undefined;
  let profilingCategory: CumulativeProfilingEntry['category'] = 'UNKNOWN';
  let inGovernorLimitBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const limitHeader = line.match(/\|LIMIT_USAGE_FOR_NS\|([^|]*)\|$/);
    if (limitHeader) {
      currentNamespace = {
        namespace: limitHeader[1] || '(default)',
        metrics: {}
      };
      governorLimits.push(currentNamespace);
      inGovernorLimitBlock = true;
      continue;
    }

    if (inGovernorLimitBlock) {
      const metric = trimmed.match(/^(.+?):\s*(\d+) out of (\d+)$/);
      if (metric && currentNamespace) {
        currentNamespace.metrics[metric[1].trim()] = {
          used: Number(metric[2]),
          limit: Number(metric[3])
        };
        continue;
      }

      if (line.includes('|TOTAL_EMAIL_RECIPIENTS_QUEUED|')) {
        const value = line.split('|').at(-1)?.trim();
        if (value && /^\d+$/.test(value)) {
          emailsQueued = Number(value);
        }
        continue;
      }

      if (line.includes('|CUMULATIVE_LIMIT_USAGE_END')) {
        inGovernorLimitBlock = false;
        currentNamespace = undefined;
      }
    }

    const profilingHeader = line.match(/\|CUMULATIVE_PROFILING\|(.+?)(?:\||$)/);
    if (profilingHeader) {
      const value = profilingHeader[1].trim();
      if (/^SOQL operations$/.test(value)) profilingCategory = 'SOQL';
      else if (/^SOSL operations$/.test(value)) profilingCategory = 'SOSL';
      else if (/^DML operations$/.test(value)) profilingCategory = 'DML';
      else if (/^method invocations$/.test(value)) profilingCategory = 'METHOD';
      else profilingCategory = 'UNKNOWN';
      continue;
    }

    if (line.includes('|CUMULATIVE_PROFILING_END')) {
      profilingCategory = 'UNKNOWN';
      continue;
    }

    if (profilingCategory !== 'UNKNOWN' && trimmed && trimmed !== 'No profiling information for SOSL operations') {
      profiling.push(parseProfilingEntry(trimmed, profilingCategory));
    }
  }

  return { governorLimits, profiling, emailsQueued };
}

function parseProfilingEntry(text: string, category: CumulativeProfilingEntry['category']): CumulativeProfilingEntry {
  const lineMatch = text.match(/line (\d+), column \d+:/);
  const executionMatch = text.match(/: executed (\d+) time(?:s)? in ([\d.]+) ms$/);
  const entry: CumulativeProfilingEntry = {
    category,
    text,
    line: lineMatch ? Number(lineMatch[1]) : undefined
  };

  if (executionMatch) {
    entry.invocationCount = Number(executionMatch[1]);
    entry.durationMs = Number(executionMatch[2]);
  }

  return entry;
}
