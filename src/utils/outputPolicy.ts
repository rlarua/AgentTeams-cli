export type OutputFormat = 'json' | 'text';

export interface OutputPolicyContext {
  resource?: string;
  action?: string;
  format: OutputFormat;
  formatExplicit?: boolean;
  outputFile?: string;
  verbose?: boolean;
}

const summaryDefaultActions: Record<string, Set<string>> = {
  plan: new Set(['create', 'update', 'start', 'finish']),
};

export function shouldPrintSummary(context: OutputPolicyContext): boolean {
  if (context.verbose) return false;

  if (typeof context.outputFile === 'string' && context.outputFile.trim().length > 0) {
    return true;
  }

  if (!context.resource || !context.action) return false;

  if (context.format === 'json' && context.formatExplicit) {
    return false;
  }

  const actions = summaryDefaultActions[context.resource];
  if (!actions) return false;
  return actions.has(context.action);
}

export function createSummaryLines(result: unknown, context: Pick<OutputPolicyContext, 'resource' | 'action'>): string[] {
  const lines: string[] = [];

  const message = extractString(result, 'message');
  if (message) {
    lines.push(message);
  } else {
    const resource = context.resource ?? 'command';
    const action = context.action ?? 'run';
    lines.push(`Success: ${resource} ${action}`);
  }

  const id = extractString(result, 'id');
  const title = extractString(result, 'title');
  const count = extractCount(result);

  if (id && title) {
    lines.push(`id: ${id}, title: ${title}`);
    return lines;
  }

  if (id) {
    lines.push(`id: ${id}`);
    return lines;
  }

  if (title) {
    lines.push(`title: ${title}`);
    return lines;
  }

  if (typeof count === 'number') {
    lines.push(`count: ${count}`);
  }

  return lines;
}

function extractCandidate(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const obj = result as Record<string, unknown>;
  const data = obj.data;

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return obj;
}

function extractString(result: unknown, key: string): string | undefined {
  const candidate = extractCandidate(result);
  if (!candidate) return undefined;
  const value = candidate[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

function extractCount(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const obj = result as Record<string, unknown>;

  if (Array.isArray(obj.data)) {
    return obj.data.length;
  }

  const candidate = extractCandidate(result);
  if (!candidate) return undefined;

  const nestedData = candidate.data;
  if (Array.isArray(nestedData)) {
    return nestedData.length;
  }

  return undefined;
}
