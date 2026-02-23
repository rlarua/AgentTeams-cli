import { createInterface } from 'node:readline/promises';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkConventionFreshness, conventionDownload } from './convention.js';
import { findProjectConfig } from '../utils/config.js';
import { withSpinner, printFileInfo } from '../utils/spinner.js';
import { formatPlanWithDependenciesText, mergePlanWithDependencies, normalizeDependencies } from '../utils/planFormat.js';
import { interpretEscapes, toPositiveInteger, toSafeFileName } from '../utils/parsers.js';
import {
  assignPlan,
  createPlan,
  deletePlan,
  getPlan,
  getPlanDependencies,
  getPlanStatus,
  listPlans,
  patchPlanStatus,
  updatePlan,
} from '../api/plan.js';
import { reportStatus } from '../api/status.js';

function findProjectRoot(): string | null {
  const configPath = findProjectConfig(process.cwd());
  if (!configPath) return null;
  return resolve(configPath, '..', '..');
}

function formatFreshnessChangeLabel(change: { type: 'new' | 'updated' | 'deleted'; title?: string; fileName?: string; id: string }): string {
  const target = (change.title && change.title.trim().length > 0)
    ? change.title.trim()
    : (change.fileName && change.fileName.trim().length > 0)
      ? change.fileName.trim()
      : change.id;

  if (change.type === 'new') return `new: ${target}`;
  if (change.type === 'deleted') return `deleted: ${target}`;
  return `updated: ${target}`;
}

export function buildFreshnessNoticeLines(freshness: {
  platformGuidesChanged: boolean;
  conventionChanges: Array<{ type: 'new' | 'updated' | 'deleted'; title?: string; fileName?: string; id: string }>;
}): string[] {
  const lines: string[] = ['⚠ Updated conventions found:'];
  if (freshness.platformGuidesChanged) {
    lines.push('  - platform guides (shared)');
  }

  for (const change of freshness.conventionChanges) {
    lines.push(`  - ${formatFreshnessChangeLabel(change)}`);
  }

  return lines;
}


async function promptConventionDownload(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question('Download now? (y/N) ');
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

function minimalPlanRefactorChecklistTemplate(): string {
  return [
    '## Refactor Checklist',
    '- [ ] Define current pain points and target behavior',
    '- [ ] Identify impacted modules and side effects',
    '- [ ] Keep API/schema contracts backward-compatible',
    '- [ ] Add or update related tests',
    '- [ ] Run verification (`npm test`, `npm run build`) and record outcomes',
    '',
  ].join('\n');
}

function resolvePlanTemplate(template: unknown): string | undefined {
  if (template === undefined || template === null) return undefined;
  const value = String(template).trim();
  if (value.length === 0) return undefined;

  if (value === 'refactor-minimal') return minimalPlanRefactorChecklistTemplate();

  throw new Error(`Unsupported plan template: ${value}. Only 'refactor-minimal' is supported.`);
}

export async function executePlanCommand(
  apiUrl: string,
  projectId: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'list': {
      const params: Record<string, string | number> = {};

      if (options.title) params.title = options.title;
      if (options.search) params.search = options.search;
      if (options.status) params.status = options.status;
      if (options.assignedTo) params.assignedTo = options.assignedTo;
      const page = toPositiveInteger(options.page);
      const pageSize = toPositiveInteger(options.pageSize);
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      return listPlans(apiUrl, projectId, headers, params);
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for plan get');
      const response = await getPlan(apiUrl, projectId, headers, options.id);

      if (options.includeDeps) {
        const depsResponse = await getPlanDependencies(apiUrl, projectId, headers, options.id);
        const dependencies = normalizeDependencies(depsResponse);
        const mergedPlan = mergePlanWithDependencies(response, dependencies);

        if (options.format === 'text') {
          return formatPlanWithDependenciesText(mergedPlan.data, dependencies);
        }

        return mergedPlan;
      }

      return response;
    }
    case 'show': {
      if (!options.id) throw new Error('--id is required for plan show');
      const response = await getPlan(apiUrl, projectId, headers, options.id);

      if (options.includeDeps) {
        const depsResponse = await getPlanDependencies(apiUrl, projectId, headers, options.id);
        const dependencies = normalizeDependencies(depsResponse);
        const mergedPlan = mergePlanWithDependencies(response, dependencies);

        if (options.format === 'text') {
          return formatPlanWithDependenciesText(mergedPlan.data, dependencies);
        }

        return mergedPlan;
      }

      return response;
    }
    case 'status': {
      if (!options.id) throw new Error('--id is required for plan status');
      return getPlanStatus(apiUrl, projectId, headers, options.id);
    }
    case 'set-status': {
      if (!options.id) throw new Error('--id is required for plan set-status');
      if (!options.status) throw new Error('--status is required for plan set-status');
      return patchPlanStatus(apiUrl, projectId, headers, options.id, options.status);
    }
    case 'start': {
      if (!options.id) throw new Error('--id is required for plan start');

      const planResponse = await getPlan(apiUrl, projectId, headers, options.id);
      const plan = (planResponse as any)?.data;
      const planTitle = plan?.title ?? options.id;
      const planStatus = plan?.status as string | undefined;
      const assignAgent = (options.agent as string | undefined)
        ?? (options.defaultCreatedBy as string | undefined);

      const updatedPlan = await withSpinner('Starting plan...', async () => {
        if (planStatus === 'DRAFT') {
          await updatePlan(apiUrl, projectId, headers, options.id, { status: 'PENDING' });
        }

        if (planStatus === 'DRAFT' || planStatus === 'PENDING') {
          if (!assignAgent) {
            throw new Error('No agent available for assignment. Set AGENTTEAMS_AGENT_NAME or pass --agent.');
          }

          await assignPlan(apiUrl, projectId, headers, options.id, assignAgent);
        }

        return updatePlan(apiUrl, projectId, headers, options.id, { status: 'IN_PROGRESS' });
      }, 'Plan started');

      const statusReport = await reportStatus(apiUrl, projectId, headers, {
        agent: options.agent,
        status: 'IN_PROGRESS',
        task: options.task ?? `Started plan: ${planTitle}`,
        issues: [],
        remaining: [],
      });

      return {
        data: {
          plan: updatedPlan,
          statusReport,
        },
      };
    }
    case 'finish': {
      if (!options.id) throw new Error('--id is required for plan finish');

      const planResponse = await getPlan(apiUrl, projectId, headers, options.id);
      const planTitle = (planResponse as any)?.data?.title ?? options.id;

      const updatedPlan = await withSpinner(
        'Finishing plan...',
        () => updatePlan(apiUrl, projectId, headers, options.id, { status: 'DONE' }),
        'Plan finished',
      );

      const statusReport = await reportStatus(apiUrl, projectId, headers, {
        agent: options.agent,
        status: 'DONE',
        task: options.task ?? `Finished plan: ${planTitle}`,
        issues: [],
        remaining: [],
      });

      return {
        data: {
          plan: updatedPlan,
          statusReport,
        },
      };
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for plan create');

      let content = options.content;
      const hasExplicitContent = typeof options.content === 'string' && options.content.trim().length > 0;
      const hasExplicitFile = typeof options.file === 'string' && options.file.trim().length > 0;
      const templateContent = resolvePlanTemplate(options.template);

      if (!content && !options.file && templateContent) {
        content = templateContent;
      }

      if ((hasExplicitContent || hasExplicitFile) && templateContent) {
        console.warn('[warn] plan create: --template is ignored because --content/--file was provided.');
      }

      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, content);
      }
      if (typeof content === 'string' && options.interpretEscapes) {
        content = interpretEscapes(content);
      }
      if (!content || content.trim().length === 0) {
        throw new Error('--content, --file, or --template is required for plan create');
      }

      if (options.status && options.status !== 'DRAFT') {
        console.warn(`[warn] plan create: --status ${options.status} is ignored. Plans are always created as DRAFT.`);
      }

      return withSpinner(
        'Creating plan...',
        () => createPlan(apiUrl, projectId, headers, {
          title: options.title,
          content,
          priority: options.priority ?? 'MEDIUM',
          repositoryId: options.repositoryId ?? options.defaultRepositoryId,
          status: 'DRAFT',
        }),
        'Plan created',
      );
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for plan update');
      const body: Record<string, string> = {};
      if (options.title) body.title = options.title;
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        body.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, body.content);
      } else if (options.content) {
        body.content = options.content;
        if (typeof body.content === 'string' && options.interpretEscapes) {
          body.content = interpretEscapes(body.content);
        }
      }
      if (options.status) body.status = options.status;
      if (options.priority) body.priority = options.priority;

      return withSpinner(
        'Updating plan...',
        () => updatePlan(apiUrl, projectId, headers, options.id, body),
        'Plan updated',
      );
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for plan delete');
      await deletePlan(apiUrl, projectId, headers, options.id);
      return { message: `Plan ${options.id} deleted successfully` };
    }
    case 'assign': {
      if (!options.id) throw new Error('--id is required for plan assign');
      if (!options.agent) throw new Error('--agent is required for plan assign');
      return assignPlan(apiUrl, projectId, headers, options.id, options.agent);
    }
    case 'download': {
      if (!options.id) throw new Error('--id is required for plan download');
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        throw new Error(
          "Project root not found. Run 'agentteams init' first."
        );
      }

      let conventionUpdates: {
        hasChanges: boolean;
        changes: string[];
        suggestion: string;
      } | undefined;

      try {
        const freshness = await checkConventionFreshness(apiUrl, projectId, headers, projectRoot);
        const hasChanges = freshness.platformGuidesChanged || freshness.conventionChanges.length > 0;

        if (hasChanges) {
          const changeLabels: string[] = [];
          if (freshness.platformGuidesChanged) {
            changeLabels.push('platform guides (shared)');
          }
          for (const change of freshness.conventionChanges) {
            changeLabels.push(formatFreshnessChangeLabel(change));
          }

          conventionUpdates = {
            hasChanges: true,
            changes: changeLabels,
            suggestion: "Run 'agentteams convention download' to sync latest conventions.",
          };

          const isTty = process.stdin.isTTY === true && process.stdout.isTTY === true;
          if (isTty) {
            const noticeLines = buildFreshnessNoticeLines(freshness);
            for (const line of noticeLines) {
              process.stderr.write(`${line}\n`);
            }

            const confirmed = await promptConventionDownload();
            if (confirmed) {
              await conventionDownload();
              console.log('✔ Convention download completed');
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[warn] Convention freshness check failed: ${message}`);
      }

      const result = await withSpinner(
        'Downloading plan...',
        async () => {
          const response = await getPlan(apiUrl, projectId, headers, options.id);
          const plan = response.data;

          const activePlanDir = join(projectRoot, '.agentteams', 'active-plan');
          if (!existsSync(activePlanDir)) {
            mkdirSync(activePlanDir, { recursive: true });
          }

          const safeName = toSafeFileName(plan.title) || 'plan';
          const fileName = `${safeName}.md`;
          const filePath = join(activePlanDir, fileName);

          const frontmatter = [
            '---',
            `planId: ${plan.id}`,
            `title: ${plan.title}`,
            `status: ${plan.status}`,
            `priority: ${plan.priority}`,
            `downloadedAt: ${new Date().toISOString()}`,
            '---',
          ].join('\n');

          const markdown = plan.contentMarkdown ?? '';
          writeFileSync(filePath, `${frontmatter}\n\n${markdown}`, 'utf-8');

          const downloadResult: Record<string, unknown> = {
            message: `Plan downloaded to ${fileName}`,
            filePath: `.agentteams/active-plan/${fileName}`,
          };

          if (conventionUpdates) {
            downloadResult.conventionUpdates = conventionUpdates;
          }

          return downloadResult;
        },
        'Plan downloaded',
      );

      return result;
    }
    case 'cleanup': {
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        throw new Error(
          "Project root not found. Run 'agentteams init' first."
        );
      }

      const activePlanDir = join(projectRoot, '.agentteams', 'active-plan');
      if (!existsSync(activePlanDir)) {
        return { message: 'No active-plan directory found.', deletedFiles: [] };
      }

      const deletedFiles = await withSpinner(
        'Cleaning up plan files...',
        async () => {
          const allFiles = readdirSync(activePlanDir).filter((f) => f.endsWith('.md'));
          const deleted: string[] = [];

          if (options.id) {
            for (const file of allFiles) {
              const content = readFileSync(join(activePlanDir, file), 'utf-8');
              const match = content.match(/^planId:\s*(.+)$/m);
              if (match && match[1].trim() === options.id) {
                rmSync(join(activePlanDir, file));
                deleted.push(file);
              }
            }
          } else {
            for (const file of allFiles) {
              rmSync(join(activePlanDir, file));
              deleted.push(file);
            }
          }

          return deleted;
        },
        'Cleaned up plan files',
      );

      return {
        message: deletedFiles.length > 0
          ? `Deleted ${deletedFiles.length} file(s).`
          : 'No matching files found.',
        deletedFiles,
      };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
