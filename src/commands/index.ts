import axios from 'axios';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { executeInitCommand } from './init.js';
import {
  conventionList,
  conventionShow,
  conventionDownload,
  conventionCreate,
  conventionUpdate,
  conventionDelete,
} from './convention.js';
import { agentConfigList, agentConfigGet, agentConfigDelete } from './agentConfig.js';
import { dependencyList, dependencyCreate, dependencyDelete } from './dependency.js';
import { loadConfig, findProjectConfig } from '../utils/config.js';
import { withSpinner, printFileInfo } from '../utils/spinner.js';
import { withoutJsonContentType } from '../utils/httpHeaders.js';
import { collectGitMetrics } from '../utils/git.js';

function isCreatedByRequiredValidationError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const data = error.response?.data as
    | { message?: unknown; details?: unknown; error?: unknown }
    | string
    | undefined;

  const message = typeof data === 'string'
    ? data
    : [data?.message, data?.details, data?.error]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');

  return /required property ['"]createdBy['"]|body\.createdBy/i.test(message);
}

function resolveLegacyCreatedBy(options: any): string | undefined {
  return toNonEmptyString(options.createdBy)
    ?? toNonEmptyString(options.defaultCreatedBy)
    ?? undefined;
}

function findProjectRoot(): string | null {
  const configPath = findProjectConfig(process.cwd());
  if (!configPath) return null;
  return resolve(configPath, '..', '..');
}

function toSafeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function interpretEscapes(content: string): string {
  return content
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n');
}

export async function executeCommand(
  resource: string,
  action: string,
  options: any
): Promise<any> {
  switch (resource) {
    case 'init':
      return executeInitCommand(options);
    case 'convention':
      return executeConventionCommand(action, options);
    case 'sync':
      return executeSyncCommand(action, options);
    case 'status':
    case 'plan':
    case 'comment':
      {
      const config = loadConfig();

      if (!config) {
        throw new Error(
          "Configuration not found. Run 'agentteams init' first or set AGENTTEAMS_* environment variables."
        );
      }

      const apiUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;

      const headers = {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
      };

      if (resource === 'status') {
        return executeStatusCommand(apiUrl, config.projectId, headers, action, options);
      }

      if (resource === 'plan') {
        return executePlanCommand(apiUrl, config.projectId, headers, action, {
          ...options,
          defaultCreatedBy: config.agentName,
        });
      }

      if (resource === 'comment') {
        return executeCommentCommand(apiUrl, config.projectId, headers, action, options);
      }

      throw new Error(`Unknown resource: ${resource}`);
    }
    case 'report': {
      const configOverrides: Record<string, string> = {
        ...(typeof options.apiKey === 'string' && options.apiKey.length > 0 ? { apiKey: options.apiKey } : {}),
        ...(typeof options.apiUrl === 'string' && options.apiUrl.length > 0 ? { apiUrl: options.apiUrl } : {}),
        ...(typeof options.teamId === 'string' && options.teamId.length > 0 ? { teamId: options.teamId } : {}),
        ...(typeof options.projectId === 'string' && options.projectId.length > 0 ? { projectId: options.projectId } : {}),
        ...(typeof options.agentName === 'string' && options.agentName.length > 0 ? { agentName: options.agentName } : {})
      };

      const config = loadConfig(configOverrides);

      if (!config) {
        throw new Error(
          "Configuration not found. Run 'agentteams init' first or set AGENTTEAMS_* environment variables."
        );
      }

      const apiUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
      const headers = {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      };

      return executeReportCommand(apiUrl, headers, action, {
        ...options,
        projectId: config.projectId,
        defaultCreatedBy: config.agentName
      });
    }
    case 'postmortem': {
      const configOverrides: Record<string, string> = {
        ...(typeof options.apiKey === 'string' && options.apiKey.length > 0 ? { apiKey: options.apiKey } : {}),
        ...(typeof options.apiUrl === 'string' && options.apiUrl.length > 0 ? { apiUrl: options.apiUrl } : {}),
        ...(typeof options.teamId === 'string' && options.teamId.length > 0 ? { teamId: options.teamId } : {}),
        ...(typeof options.projectId === 'string' && options.projectId.length > 0 ? { projectId: options.projectId } : {}),
        ...(typeof options.agentName === 'string' && options.agentName.length > 0 ? { agentName: options.agentName } : {})
      };

      const config = loadConfig(configOverrides);

      if (!config) {
        throw new Error(
          "Configuration not found. Run 'agentteams init' first or set AGENTTEAMS_* environment variables."
        );
      }

      const apiUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
      const headers = {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      };

      return executePostMortemCommand(apiUrl, headers, action, {
        ...options,
        projectId: config.projectId,
        defaultCreatedBy: config.agentName
      });
    }
    case 'dependency':
      return executeDependencyCommand(action, options);
    case 'agent-config':
      return executeAgentConfigCommand(action, options);
    case 'config':
      return executeConfigCommand(action);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

async function executeStatusCommand(
  apiUrl: string,
  projectId: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;

  switch (action) {
    case 'report': {
      if (!options.status) throw new Error('--status is required for status report');
      if (!options.task) throw new Error('--task is required for status report');
      if (options.issues === undefined) throw new Error('--issues is required for status report');
      if (options.remaining === undefined) throw new Error('--remaining is required for status report');

      const response = await axios.post(
        baseUrl,
        {
          agent: options.agent,
          status: options.status,
          task: options.task,
          issues: splitCsv(options.issues),
          remaining: splitCsv(options.remaining),
        },
        { headers }
      );
      return response.data;
    }
    case 'list': {
      const params: Record<string, number> = {};
      const page = toPositiveInteger(options.page);
      const pageSize = toPositiveInteger(options.pageSize);

      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      const requestConfig = Object.keys(params).length > 0
        ? { headers, params }
        : { headers };

      const response = await axios.get(baseUrl, requestConfig);
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for status get');
      const response = await axios.get(
        `${baseUrl}/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for status update');
      const body: Record<string, unknown> = {};
      if (options.status !== undefined) body.status = options.status;
      if (options.task !== undefined) body.task = options.task;
      if (options.issues !== undefined) body.issues = splitCsv(options.issues);
      if (options.remaining !== undefined) body.remaining = splitCsv(options.remaining);

      const response = await axios.put(
        `${baseUrl}/${options.id}`,
        body,
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for status delete');
      const response = await axios.delete(
        `${baseUrl}/${options.id}`,
        { headers: withoutJsonContentType(headers) }
      );
      return response.data;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function executePlanCommand(
  apiUrl: string,
  projectId: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/plans`;

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

      const requestConfig = Object.keys(params).length > 0
        ? { headers, params }
        : { headers };

      const response = await axios.get(baseUrl, requestConfig);
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for plan get');
      const response = await axios.get(`${baseUrl}/${options.id}`, {
        headers,
      });

      if (options.includeDeps) {
        const depsResponse = await axios.get(`${baseUrl}/${options.id}/dependencies`, {
          headers,
        });

        const dependencies = normalizeDependencies(depsResponse.data);
        const mergedPlan = mergePlanWithDependencies(response.data, dependencies);

        if (options.format === 'text') {
          return formatPlanWithDependenciesText(mergedPlan.data, dependencies);
        }

        return mergedPlan;
      }

      return response.data;
    }
    case 'show': {
      if (!options.id) throw new Error('--id is required for plan show');
      const response = await axios.get(`${baseUrl}/${options.id}`, {
        headers,
      });

      if (options.includeDeps) {
        const depsResponse = await axios.get(`${baseUrl}/${options.id}/dependencies`, {
          headers,
        });

        const dependencies = normalizeDependencies(depsResponse.data);
        const mergedPlan = mergePlanWithDependencies(response.data, dependencies);

        if (options.format === 'text') {
          return formatPlanWithDependenciesText(mergedPlan.data, dependencies);
        }

        return mergedPlan;
      }

      return response.data;
    }
    case 'start': {
      if (!options.id) throw new Error('--id is required for plan start');

      const planResponse = await axios.get(`${baseUrl}/${options.id}`, { headers });
      const plan = (planResponse.data as any)?.data;
      const planTitle = plan?.title ?? options.id;
      const planStatus = plan?.status as string | undefined;
      const assignAgent = (options.agent as string | undefined)
        ?? (options.defaultCreatedBy as string | undefined);

      const updatedPlan = await withSpinner('Starting plan...', async () => {
        if (planStatus === 'DRAFT') {
          await axios.put(
            `${baseUrl}/${options.id}`,
            { status: 'PENDING' },
            { headers }
          );
        }

        if (planStatus === 'DRAFT' || planStatus === 'PENDING') {
          if (!assignAgent) {
            throw new Error('No agent available for assignment. Set AGENTTEAMS_AGENT_NAME or pass --agent.');
          }

          await axios.post(
            `${baseUrl}/${options.id}/assign`,
            { assignedTo: assignAgent },
            { headers }
          );
        }

        return axios.put(
          `${baseUrl}/${options.id}`,
          { status: 'IN_PROGRESS' },
          { headers }
        );
      }, 'Plan started');

      const statusBaseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
      const statusReport = await axios.post(
        statusBaseUrl,
        {
          agent: options.agent,
          status: 'IN_PROGRESS',
          task: options.task ?? `Started plan: ${planTitle}`,
          issues: [],
          remaining: [],
        },
        { headers }
      );

      return {
        data: {
          plan: updatedPlan.data,
          statusReport: statusReport.data,
        },
      };
    }
    case 'finish': {
      if (!options.id) throw new Error('--id is required for plan finish');

      const planResponse = await axios.get(`${baseUrl}/${options.id}`, { headers });
      const planTitle = (planResponse.data as any)?.data?.title ?? options.id;

      const updatedPlan = await withSpinner(
        'Finishing plan...',
        () => axios.put(
          `${baseUrl}/${options.id}`,
          { status: 'DONE' },
          { headers }
        ),
        'Plan finished',
      );

      const statusBaseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
      const statusReport = await axios.post(
        statusBaseUrl,
        {
          agent: options.agent,
          status: 'DONE',
          task: options.task ?? `Finished plan: ${planTitle}`,
          issues: [],
          remaining: [],
        },
        { headers }
      );

      return {
        data: {
          plan: updatedPlan.data,
          statusReport: statusReport.data,
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
        // Server enforces DRAFT on creation; status can be updated afterwards.
        console.warn(`[warn] plan create: --status ${options.status} is ignored. Plans are always created as DRAFT.`);
      }

      const response = await withSpinner(
        'Creating plan...',
        () => axios.post(
          baseUrl,
          {
            title: options.title,
            content,
            priority: options.priority ?? 'MEDIUM',
            status: 'DRAFT',
          },
          { headers }
        ),
        'Plan created',
      );
      return response.data;
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

      const response = await withSpinner(
        'Updating plan...',
        () => axios.put(
          `${baseUrl}/${options.id}`,
          body,
          { headers }
        ),
        'Plan updated',
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for plan delete');
      await axios.delete(`${baseUrl}/${options.id}`, { headers: withoutJsonContentType(headers) });
      return { message: `Plan ${options.id} deleted successfully` };
    }
    case 'assign': {
      if (!options.id) throw new Error('--id is required for plan assign');
      if (!options.agent) throw new Error('--agent is required for plan assign');
      const response = await axios.post(
        `${baseUrl}/${options.id}/assign`,
        { assignedTo: options.agent },
        { headers }
      );
      return response.data;
    }
    case 'download': {
      if (!options.id) throw new Error('--id is required for plan download');

      const result = await withSpinner(
        'Downloading plan...',
        async () => {
          const response = await axios.get(`${baseUrl}/${options.id}`, { headers });
          const plan = response.data.data;

          const projectRoot = findProjectRoot();
          if (!projectRoot) {
            throw new Error(
              "Project root not found. Run 'agentteams init' first."
            );
          }

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

          return {
            message: `Plan downloaded to ${fileName}`,
            filePath: `.agentteams/active-plan/${fileName}`,
          };
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
        `Cleaned up plan files`,
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

async function executeCommentCommand(
  apiUrl: string,
  projectId: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  const planBaseUrl = `${apiUrl}/api/projects/${projectId}/plans`;
  const commentBaseUrl = `${apiUrl}/api/projects/${projectId}/comments`;

  switch (action) {
    case 'list': {
      if (!options.planId) throw new Error('--plan-id is required for comment list');
      const params: Record<string, string | number> = {};
      if (options.type) params.type = options.type;

      const page = toPositiveInteger(options.page);
      const pageSize = toPositiveInteger(options.pageSize);
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      const requestConfig = Object.keys(params).length > 0
        ? { headers, params }
        : { headers };

      const response = await axios.get(
        `${planBaseUrl}/${options.planId}/comments`,
        requestConfig
      );
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for comment get');
      const response = await axios.get(
        `${commentBaseUrl}/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'create': {
      if (!options.planId) throw new Error('--plan-id is required for comment create');
      if (!options.type) throw new Error('--type is required for comment create');
      if (!options.content) throw new Error('--content is required for comment create');
      const response = await axios.post(
        `${planBaseUrl}/${options.planId}/comments`,
        {
          type: options.type,
          content: options.content,
        },
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for comment update');
      if (!options.content) throw new Error('--content is required for comment update');
      const response = await axios.put(
        `${commentBaseUrl}/${options.id}`,
        { content: options.content },
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for comment delete');
      await axios.delete(
        `${commentBaseUrl}/${options.id}`,
        { headers: withoutJsonContentType(headers) }
      );
      return { message: `Comment ${options.id} deleted successfully` };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function executeReportCommand(
  apiUrl: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  if (!options.projectId || typeof options.projectId !== 'string') {
    throw new Error('--project-id is required (or configure AGENTTEAMS_PROJECT_ID / .agentteams/config.json)');
  }

  const baseUrl = `${apiUrl}/api/projects/${options.projectId}/completion-reports`;

  switch (action) {
    case 'list': {
      const params: Record<string, string | number> = {};
      if (options.planId) params.planId = options.planId;
      if (options.reportType) params.reportType = options.reportType;
      if (options.status) params.status = options.status;
      if (options.search) params.search = options.search;

      const page = toPositiveInteger(options.page);
      const limitVal = toPositiveInteger(options.limit);
      const pageSizeVal = toPositiveInteger(options.pageSize);
      if (limitVal !== undefined && pageSizeVal !== undefined) {
        console.warn('[warn] --limit and --page-size both specified; --limit takes precedence.');
      }
      const pageSize = limitVal ?? pageSizeVal;
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      const requestConfig = Object.keys(params).length > 0
        ? { headers, params }
        : { headers };

      const response = await axios.get(baseUrl, requestConfig);
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for report get');
      const response = await axios.get(
        `${baseUrl}/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'create': {
      const title = (options.title ?? options.summary) as string | undefined;
      if (!title || title.trim().length === 0) {
        throw new Error('--title is required for report create (or use --summary)');
      }

      const rawContent = options.content as string | undefined;
      let content = rawContent
        ?? toDetailsAsMarkdown(options.details)
        ?? resolveReportTemplate(options.template);
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, content);
      }
      if (!content || content.trim().length === 0) {
        throw new Error('--content, --file, or --template is required for report create.');
      }

      const reportType = (options.reportType as string | undefined) ?? 'IMPL_PLAN';
      const status = (options.status as string | undefined) ?? 'COMPLETED';

      const autoGitMetrics = options.git === false ? {} : collectGitMetrics();

      const commitHash = toNonEmptyString(options.commitHash) ?? autoGitMetrics.commitHash;
      const branchName = toNonEmptyString(options.branchName) ?? autoGitMetrics.branchName;
      const filesModified = toNonNegativeInteger(options.filesModified) ?? autoGitMetrics.filesModified;
      const linesAdded = toNonNegativeInteger(options.linesAdded) ?? autoGitMetrics.linesAdded;
      const linesDeleted = toNonNegativeInteger(options.linesDeleted) ?? autoGitMetrics.linesDeleted;
      const durationSeconds = toNonNegativeInteger(options.durationSeconds);
      const commitStart = toNonEmptyString(options.commitStart);
      const commitEnd = toNonEmptyString(options.commitEnd);
      const pullRequestId = toNonEmptyString(options.pullRequestId);
      const qualityScore = toNonNegativeInteger(options.qualityScore);

      const body: Record<string, unknown> = {
        planId: options.planId,
        title,
        content,
        reportType,
        status,
      };

      if (commitHash !== undefined) body.commitHash = commitHash;
      if (branchName !== undefined) body.branchName = branchName;
      if (filesModified !== undefined) body.filesModified = filesModified;
      if (linesAdded !== undefined) body.linesAdded = linesAdded;
      if (linesDeleted !== undefined) body.linesDeleted = linesDeleted;
      if (durationSeconds !== undefined) body.durationSeconds = durationSeconds;
      if (commitStart !== undefined) body.commitStart = commitStart;
      if (commitEnd !== undefined) body.commitEnd = commitEnd;
      if (pullRequestId !== undefined) body.pullRequestId = pullRequestId;
      if (qualityScore !== undefined) body.qualityScore = qualityScore;

      const response = await withSpinner(
        'Creating report...',
        async () => {
          try {
            return await axios.post(baseUrl, body, { headers });
          } catch (error) {
            if (!isCreatedByRequiredValidationError(error)) {
              throw error;
            }

            const legacyCreatedBy = resolveLegacyCreatedBy(options);
            if (!legacyCreatedBy) {
              throw error;
            }

            return axios.post(
              baseUrl,
              { ...body, createdBy: legacyCreatedBy },
              { headers }
            );
          }
        },
        'Report created',
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for report update');
      const body: Record<string, any> = {};

      if (options.title ?? options.summary) body.title = options.title ?? options.summary;
      if (options.content) body.content = options.content;
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        body.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, body.content);
      }
      if (options.reportType) body.reportType = options.reportType;
      if (options.status) body.status = options.status;

      const commitHash = toNonEmptyString(options.commitHash);
      const branchName = toNonEmptyString(options.branchName);
      const filesModified = toNonNegativeInteger(options.filesModified);
      const linesAdded = toNonNegativeInteger(options.linesAdded);
      const linesDeleted = toNonNegativeInteger(options.linesDeleted);
      const durationSeconds = toNonNegativeInteger(options.durationSeconds);
      const commitStart = toNonEmptyString(options.commitStart);
      const commitEnd = toNonEmptyString(options.commitEnd);
      const pullRequestId = toNonEmptyString(options.pullRequestId);
      const qualityScore = toNonNegativeInteger(options.qualityScore);

      if (commitHash !== undefined) body.commitHash = commitHash;
      if (branchName !== undefined) body.branchName = branchName;
      if (filesModified !== undefined) body.filesModified = filesModified;
      if (linesAdded !== undefined) body.linesAdded = linesAdded;
      if (linesDeleted !== undefined) body.linesDeleted = linesDeleted;
      if (durationSeconds !== undefined) body.durationSeconds = durationSeconds;
      if (commitStart !== undefined) body.commitStart = commitStart;
      if (commitEnd !== undefined) body.commitEnd = commitEnd;
      if (pullRequestId !== undefined) body.pullRequestId = pullRequestId;
      if (qualityScore !== undefined) body.qualityScore = qualityScore;

      const response = await axios.put(
        `${baseUrl}/${options.id}`,
        body,
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for report delete');
      await axios.delete(
        `${baseUrl}/${options.id}`,
        { headers: withoutJsonContentType(headers) }
      );
      return { message: `Report ${options.id} deleted successfully` };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function executePostMortemCommand(
  apiUrl: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  if (!options.projectId || typeof options.projectId !== 'string') {
    throw new Error('--project-id is required (or configure AGENTTEAMS_PROJECT_ID / .agentteams/config.json)');
  }

  const baseUrl = `${apiUrl}/api/projects/${options.projectId}/post-mortems`;

  switch (action) {
    case 'list': {
      const params: Record<string, string | number> = {};
      if (options.planId) params.planId = options.planId;
      if (options.status) params.status = options.status;
      if (options.search) params.search = options.search;

      const page = toPositiveInteger(options.page);
      const limitVal = toPositiveInteger(options.limit);
      const pageSizeVal = toPositiveInteger(options.pageSize);
      if (limitVal !== undefined && pageSizeVal !== undefined) {
        console.warn('[warn] --limit and --page-size both specified; --limit takes precedence.');
      }
      const pageSize = limitVal ?? pageSizeVal;
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      const requestConfig = Object.keys(params).length > 0
        ? { headers, params }
        : { headers };

      const response = await axios.get(baseUrl, requestConfig);
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for postmortem get');
      const response = await axios.get(
        `${baseUrl}/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for postmortem create');
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        options.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, options.content);
      }
      if (!options.content) throw new Error('--content or --file is required for postmortem create');
      if (options.actionItems === undefined) throw new Error('--action-items is required for postmortem create');

      const body: Record<string, unknown> = {
        planId: options.planId,
        title: options.title,
        content: options.content,
        actionItems: splitCsv(options.actionItems),
        status: options.status,
      };

      const response = await withSpinner(
        'Creating post-mortem...',
        async () => {
          try {
            return await axios.post(baseUrl, body, { headers });
          } catch (error) {
            if (!isCreatedByRequiredValidationError(error)) {
              throw error;
            }

            const legacyCreatedBy = resolveLegacyCreatedBy(options);
            if (!legacyCreatedBy) {
              throw error;
            }

            return axios.post(
              baseUrl,
              { ...body, createdBy: legacyCreatedBy },
              { headers }
            );
          }
        },
        'Post-mortem created',
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for postmortem update');
      const body: Record<string, any> = {};

      if (Object.prototype.hasOwnProperty.call(options, 'planId')) {
        body.planId = options.planId;
      }
      if (options.title) body.title = options.title;
      if (options.content) body.content = options.content;
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        body.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, body.content);
      }
      if (options.actionItems !== undefined) body.actionItems = splitCsv(options.actionItems);
      if (options.status) body.status = options.status;

      const response = await axios.put(
        `${baseUrl}/${options.id}`,
        body,
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for postmortem delete');
      await axios.delete(
        `${baseUrl}/${options.id}`,
        { headers: withoutJsonContentType(headers) }
      );
      return { message: `PostMortem ${options.id} deleted successfully` };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function toDetailsAsMarkdown(details: unknown): string | undefined {
  if (typeof details !== 'string' || details.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(details) as unknown;
    return `\n\n## Details\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
  } catch {
    return `\n\n## Details\n\n${details}\n`;
  }
}

function minimalCompletionReportTemplate(): string {
  return [
    '## Summary',
    '- What changed and why',
    '',
    '## Verification',
    '- typecheck: ...',
    '- tests: ...',
    '',
    '## Notes',
    '- risks / follow-ups',
    '',
    '## Conventions Referenced',
    '- `.agentteams/rules/...`  # list conventions you referenced during this work',
    '',
  ].join('\n');
}

function resolveReportTemplate(template: unknown): string | undefined {
  if (template === undefined || template === null) return undefined;
  const value = String(template).trim();
  if (value.length === 0) return undefined;

  if (value === 'minimal') return minimalCompletionReportTemplate();

  throw new Error(`Unsupported template: ${value}. Only 'minimal' is supported.`);
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

async function executeConventionCommand(action: string, options: any): Promise<any> {
  switch (action) {
    case 'list':
      return conventionList();
    case 'show':
      return conventionShow();
    case 'download':
      return conventionDownload({ cwd: options?.cwd });
    case 'create': {
      const files = options?.file;
      const hasFiles = typeof files === 'string' || (Array.isArray(files) && files.length > 0);
      if (!hasFiles) {
        throw new Error('--file is required for convention create');
      }
      return conventionCreate({ cwd: options?.cwd, file: options.file });
    }
    case 'update': {
      const files = options?.file;
      const hasFiles = typeof files === 'string' || (Array.isArray(files) && files.length > 0);
      if (!hasFiles) {
        throw new Error('--file is required for convention update');
      }
      return conventionUpdate({ cwd: options?.cwd, file: options.file, apply: options.apply });
    }
    case 'delete': {
      const files = options?.file;
      const hasFiles = typeof files === 'string' || (Array.isArray(files) && files.length > 0);
      if (!hasFiles) {
        throw new Error('--file is required for convention delete');
      }
      return conventionDelete({ cwd: options?.cwd, file: options.file, apply: options.apply });
    }
    default:
      throw new Error(`Unknown convention action: ${action}. Use list, show, download, create, update, or delete.`);
  }
}

async function executeSyncCommand(action: string, options: any): Promise<any> {
  switch (action) {
    case 'download':
      return conventionDownload({ cwd: options?.cwd });
    default:
      throw new Error(`Unknown sync action: ${action}. Use download.`);
  }
}

async function executeAgentConfigCommand(
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'list':
      return agentConfigList();
    case 'get': {
      if (!options.id) throw new Error('--id is required for agent-config get');
      return agentConfigGet(options.id);
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for agent-config delete');
      return agentConfigDelete(options.id);
    }
    default:
      throw new Error(`Unknown agent-config action: ${action}. Use list, get, or delete.`);
  }
}

async function executeDependencyCommand(
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'list': {
      if (!options.planId) throw new Error('--plan-id is required for dependency list');
      return dependencyList(options.planId);
    }
    case 'create': {
      if (!options.planId) throw new Error('--plan-id is required for dependency create');
      if (!options.blockingPlanId) throw new Error('--blocking-plan-id is required for dependency create');
      return dependencyCreate(options.planId, options.blockingPlanId);
    }
    case 'delete': {
      if (!options.planId) throw new Error('--plan-id is required for dependency delete');
      if (!options.depId) throw new Error('--dep-id is required for dependency delete');
      return dependencyDelete(options.planId, options.depId);
    }
    default:
      throw new Error(`Unknown dependency action: ${action}. Use list, create, or delete.`);
  }
}

function splitCsv(value: string): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDependencies(raw: unknown): { blocking: any[]; dependents: any[] } {
  if (!raw || typeof raw !== 'object') {
    return { blocking: [], dependents: [] };
  }

  const root = raw as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' && !Array.isArray(root.data))
    ? (root.data as Record<string, unknown>)
    : root;

  const blocking = Array.isArray(data.blocking) ? data.blocking : [];
  const dependents = Array.isArray(data.dependents) ? data.dependents : [];

  return { blocking, dependents };
}

function mergePlanWithDependencies(
  rawPlanResponse: unknown,
  dependencies: { blocking: any[]; dependents: any[] }
): { data: Record<string, unknown> } {
  const fallback: Record<string, unknown> = {
    dependencies,
  };

  if (!rawPlanResponse || typeof rawPlanResponse !== 'object') {
    return { data: fallback };
  }

  const root = rawPlanResponse as Record<string, unknown>;
  const rawData = root.data;
  const planData =
    rawData && typeof rawData === 'object' && !Array.isArray(rawData)
      ? { ...(rawData as Record<string, unknown>) }
      : {};

  planData.dependencies = dependencies;

  return {
    ...root,
    data: planData,
  } as { data: Record<string, unknown> };
}

function formatPlanWithDependenciesText(
  planData: Record<string, unknown>,
  dependencies: { blocking: any[]; dependents: any[] }
): string {
  const lines: string[] = [];

  appendLineIfExists(lines, 'id', planData.id);
  appendLineIfExists(lines, 'title', planData.title);
  appendLineIfExists(lines, 'status', planData.status);
  appendLineIfExists(lines, 'priority', planData.priority);
  appendLineIfExists(lines, 'updatedAt', planData.updatedAt);
  appendLineIfExists(lines, 'createdAt', planData.createdAt);

  const ignoredKeys = new Set(['id', 'title', 'status', 'priority', 'updatedAt', 'createdAt', 'dependencies']);
  for (const [key, value] of Object.entries(planData)) {
    if (ignoredKeys.has(key) || value === null || value === undefined) {
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
  }

  lines.push('---');
  lines.push('## Dependencies');

  const rendered = [
    ...dependencies.blocking.map((plan) => renderDependencyLine('BLOCKING', plan)),
    ...dependencies.dependents.map((plan) => renderDependencyLine('DEPENDENT', plan)),
  ];

  if (rendered.length === 0) {
    lines.push('No dependencies.');
  } else {
    lines.push(...rendered);
  }

  return lines.join('\n');
}

function appendLineIfExists(lines: string[], key: string, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }

  const normalized = String(value).trim();
  if (normalized.length === 0) {
    return;
  }

  lines.push(`${key}: ${normalized}`);
}

function renderDependencyLine(label: 'BLOCKING' | 'DEPENDENT', plan: unknown): string {
  if (!plan || typeof plan !== 'object') {
    return `- [${label}] unknown`;
  }

  const target = plan as Record<string, unknown>;
  const id = typeof target.id === 'string' && target.id.length > 0 ? target.id : 'unknown-id';
  const title = typeof target.title === 'string' && target.title.length > 0 ? target.title : '(no title)';
  const status = typeof target.status === 'string' && target.status.length > 0 ? target.status : 'UNKNOWN';

  return `- [${label}] ${id}: ${title} (${status})`;
}

function toNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return undefined;
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

async function executeConfigCommand(action: string): Promise<any> {
  switch (action) {
    case 'whoami': {
      const configPath = findProjectConfig(process.cwd());
      const config = loadConfig();
      if (!config) {
        return {
          apiUrl: process.env.AGENTTEAMS_API_URL,
          projectId: process.env.AGENTTEAMS_PROJECT_ID,
          teamId: process.env.AGENTTEAMS_TEAM_ID,
          agentName: process.env.AGENTTEAMS_AGENT_NAME,
          hasApiKey: Boolean(process.env.AGENTTEAMS_API_KEY),
          configPath,
        };
      }

      return {
        apiUrl: config.apiUrl,
        projectId: config.projectId,
        teamId: config.teamId,
        agentName: config.agentName,
        hasApiKey: Boolean(config.apiKey),
        configPath,
      };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
