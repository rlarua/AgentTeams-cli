#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { executeCommand } from './commands/index.js';
import { formatOutput } from './utils/formatter.js';
import { handleError } from './utils/errors.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

type OutputFormat = 'json' | 'text';

function normalizeFormat(format: unknown, fallback: OutputFormat): OutputFormat {
  if (format === 'json' || format === 'text') return format;
  return fallback;
}

function extractSummary(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const obj = result as any;
  const candidate = obj?.data ?? obj;

  const id = typeof candidate?.id === 'string' ? candidate.id : undefined;
  if (id) return `id: ${id}`;

  if (Array.isArray(candidate)) return `count: ${candidate.length}`;

  if (Array.isArray(candidate?.data)) return `count: ${candidate.data.length}`;

  return undefined;
}

function writeOutputFile(outputFile: string, content: string): { resolvedPath: string; bytes: number } {
  const resolvedPath = resolve(outputFile);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, content, 'utf-8');
  const bytes = Buffer.byteLength(content, 'utf-8');
  return { resolvedPath, bytes };
}

function printCommandResult(params: {
  result: unknown;
  format: OutputFormat;
  outputFile?: string;
  verbose?: boolean;
}): void {
  const outputText =
    typeof params.result === 'string' ? params.result : formatOutput(params.result, params.format);

  if (typeof params.outputFile === 'string' && params.outputFile.trim().length > 0) {
    const { resolvedPath, bytes } = writeOutputFile(params.outputFile, outputText);
    console.log(`Saved output to ${resolvedPath} (${bytes} bytes).`);
    const summary = extractSummary(params.result);
    if (summary) console.log(summary);

    if (params.verbose) {
      console.log(outputText);
    }
    return;
  }

  console.log(outputText);
}

program
  .name('agentteams')
  .description('CLI tool for AgentTeams API')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize AgentTeams CLI via OAuth')
  .option('--format <format>', 'Output format (json, text)', 'text')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (options) => {
    try {
      const result = await executeCommand('init', 'start', {});

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'text'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Sync local convention files from API')
  .option('--format <format>', 'Output format (json, text)', 'text')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (options) => {
    try {
      const result = await executeCommand('sync', 'download', {
        cwd: process.cwd(),
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'text'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Manage agent statuses')
  .argument('<action>', 'Action to perform (report, list, get, update, delete)')
  .option('--id <id>', 'Status ID')
  .option('--agent <name>', 'Agent name')
  .option('--status <status>', 'Agent status (IN_PROGRESS, DONE, BLOCKED)')
  .option('--task <text>', 'Current task summary')
  .option('--issues <csv>', 'Comma-separated issue list')
  .option('--remaining <csv>', 'Comma-separated remaining work list')
  .option('--page <number>', 'Page number (list only)')
  .option('--page-size <number>', 'Page size (list only)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('status', action, {
        id: options.id,
        agent: options.agent,
        status: options.status,
        task: options.task,
        issues: options.issues,
        remaining: options.remaining,
        page: options.page,
        pageSize: options.pageSize,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('plan')
  .description('Manage plans')
  .argument('<action>', 'Action to perform (list, get, create, update, delete, assign, download, cleanup, start, finish)')
  .option('--id <id>', 'Plan ID')
  .option('--title <title>', 'Plan title')
  .option('--search <text>', 'Plan title/ID search keyword (list only)')
  .option('--content <content>', 'Plan content (plain text or Tiptap JSON)')
  .option('--interpret-escapes', 'Interpret \\n sequences in --content as newlines (create/update only)', false)
  .option('--file <path>', 'Read plan content from a local file (create/update)')
  .option('--status <status>', 'Plan status (DRAFT, PENDING, ASSIGNED, IN_PROGRESS, BLOCKED, DONE, CANCELLED)')
  .option('--priority <priority>', 'Plan priority (LOW, MEDIUM, HIGH)')
  .option('--assigned-to <id>', 'Assigned agent config ID (list filter)')
  .option('--task <text>', 'Task summary for plan start/finish')
  .option('--page <number>', 'Page number (list only)')
  .option('--page-size <number>', 'Page size (list only)')
  .option('--agent <agent>', 'Agent name or ID to assign')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('plan', action, {
        id: options.id,
        title: options.title,
        search: options.search,
        content: options.content,
        interpretEscapes: options.interpretEscapes,
        file: options.file,
        status: options.status,
        priority: options.priority,
        assignedTo: options.assignedTo,
        task: options.task,
        page: options.page,
        pageSize: options.pageSize,
        agent: options.agent,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('comment')
  .description('Manage plan comments')
  .argument('<action>', 'Action to perform (list, get, create, update, delete)')
  .option('--id <id>', 'Comment ID')
  .option('--plan-id <id>', 'Plan ID')
  .option('--type <type>', 'Comment type (RISK, MODIFICATION, GENERAL)')
  .option('--content <content>', 'Comment content')
  .option('--page <number>', 'Page number (list only)')
  .option('--page-size <number>', 'Page size (list only)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('comment', action, {
        id: options.id,
        planId: options.planId,
        type: options.type,
        content: options.content,
        page: options.page,
        pageSize: options.pageSize,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Manage completion reports')
  .argument('<action>', 'Action to perform (list, get, create, update, delete)')
  .option('--id <id>', 'Report ID')
  .option('--plan-id <id>', 'Plan ID (optional)')
  .option('--title <title>', 'Report title')
  .option('--content <content>', 'Report markdown content')
  .option('--template <name>', 'Report content template (minimal)', 'minimal')
  .option('--report-type <type>', 'Report type (IMPL_PLAN, COMMIT_RANGE, TASK_COMPLETION)')
  .option('--status <status>', 'Report status (COMPLETED, FAILED, PARTIAL)')
  .option('--created-by <name>', 'Created by (defaults to agentName from config)')
  .option('--page <number>', 'Page number (list only)')
  .option('--page-size <number>', 'Page size (list only)')
  .option('--summary <summary>', '[Deprecated] Alias for --title')
  .option('--details <details>', '[Deprecated] Will be embedded in content as JSON')
  .option('--api-url <url>', 'Override API URL (optional)')
  .option('--api-key <key>', 'Override API key (optional)')
  .option('--project-id <id>', 'Override project ID (optional)')
  .option('--team-id <id>', 'Override team ID (optional)')
  .option('--agent-name <name>', 'Override agent name (optional)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      if (typeof options.summary === 'string' && options.summary.trim().length > 0) {
        console.warn('[warn] --summary is deprecated. Use --title instead.');
      }
      if (typeof options.details === 'string' && options.details.trim().length > 0) {
        console.warn('[warn] --details is deprecated. Use --content instead.');
      }

      const result = await executeCommand('report', action, {
        id: options.id,
        planId: options.planId,
        title: options.title,
        content: options.content,
        template: options.template,
        reportType: options.reportType,
        status: options.status,
        createdBy: options.createdBy,
        page: options.page,
        pageSize: options.pageSize,
        summary: options.summary,
        details: options.details,
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
        projectId: options.projectId,
        teamId: options.teamId,
        agentName: options.agentName,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('postmortem')
  .description('Manage post mortems')
  .argument('<action>', 'Action to perform (list, get, create, update, delete)')
  .option('--id <id>', 'Post mortem ID')
  .option('--plan-id <id>', 'Plan ID (optional)')
  .option('--title <title>', 'Post mortem title')
  .option('--content <content>', 'Post mortem markdown content')
  .option('--action-items <csv>', 'Action items (comma-separated)')
  .option('--status <status>', 'Post mortem status (OPEN, IN_PROGRESS, RESOLVED)')
  .option('--created-by <name>', 'Created by (defaults to agentName from config)')
  .option('--page <number>', 'Page number (list only)')
  .option('--page-size <number>', 'Page size (list only)')
  .option('--api-url <url>', 'Override API URL (optional)')
  .option('--api-key <key>', 'Override API key (optional)')
  .option('--project-id <id>', 'Override project ID (optional)')
  .option('--team-id <id>', 'Override team ID (optional)')
  .option('--agent-name <name>', 'Override agent name (optional)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('postmortem', action, {
        id: options.id,
        planId: options.planId,
        title: options.title,
        content: options.content,
        actionItems: options.actionItems,
        status: options.status,
        createdBy: options.createdBy,
        page: options.page,
        pageSize: options.pageSize,
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
        projectId: options.projectId,
        teamId: options.teamId,
        agentName: options.agentName,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('convention')
  .description('Manage project conventions')
  .argument('<action>', 'Action to perform (list, show, download, create, update, delete)')
  .option('--cwd <path>', 'Working directory (defaults to current)')
  .option(
    '-f, --file <path>',
    'Target convention markdown file (repeatable; create requires a file under .agentteams/<category>/)',
    (value, previous: string[] = []) => previous.concat([value]),
    [] as string[]
  )
  .option('--apply', 'Apply changes to server (default: dry-run)', false)
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('convention', action, {
        cwd: options.cwd ?? process.cwd(),
        file: options.file,
        apply: options.apply,
      });

      printCommandResult({
        result,
        format: 'text',
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('dependency')
  .description('Manage plan dependencies')
  .argument('<action>', 'Action to perform (list, create, delete)')
  .option('--plan-id <id>', 'Plan ID')
  .option('--blocking-plan-id <id>', 'Blocking plan ID')
  .option('--dep-id <id>', 'Dependency ID to delete')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('dependency', action, {
        planId: options.planId,
        blockingPlanId: options.blockingPlanId,
        depId: options.depId,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('agent-config')
  .description('Manage agent configurations')
  .argument('<action>', 'Action to perform (list, get, delete)')
  .option('--id <id>', 'Agent config ID')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('agent-config', action, {
        id: options.id,
      });

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Manage configuration')
  .argument('<action>', 'Action to perform (whoami)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .option('--output-file <path>', 'Write full output to a file (stdout prints a short summary)')
  .option('--verbose', 'Print full output to stdout (useful with --output-file)', false)
  .action(async (action, options) => {
    try {
      const result = await executeCommand('config', action, {});

      printCommandResult({
        result,
        format: normalizeFormat(options.format, 'json'),
        outputFile: options.outputFile,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program.parse();
