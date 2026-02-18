import axios from 'axios';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { executeInitCommand } from './init.js';
import {
  conventionList,
  conventionShow,
  conventionDownload,
} from './convention.js';
import { agentConfigList, agentConfigGet, agentConfigDelete } from './agentConfig.js';
import { dependencyList, dependencyCreate, dependencyDelete } from './dependency.js';
import { loadConfig, findProjectConfig } from '../utils/config.js';
import { withSpinner, printFileInfo } from '../utils/spinner.js';

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
        return executePlanCommand(apiUrl, config.projectId, headers, action, options);
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
        { headers }
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
      return response.data;
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for plan create');

      let content = options.content;
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, content);
      }
      if (!content || content.trim().length === 0) {
        throw new Error('--content or --file is required for plan create');
      }

      const response = await withSpinner(
        'Creating plan...',
        () => axios.post(
          baseUrl,
          {
            title: options.title,
            content,
            priority: options.priority ?? 'MEDIUM',
            status: options.status,
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
      await axios.delete(`${baseUrl}/${options.id}`, { headers });
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
        { headers }
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
      if (options.createdBy) params.createdBy = options.createdBy;

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
      const content = rawContent ?? toDetailsAsMarkdown(options.details);
      if (!content || content.trim().length === 0) {
        throw new Error('--content is required for report create (or use --details)');
      }

      const reportType = (options.reportType as string | undefined) ?? 'IMPL_PLAN';
      const status = (options.status as string | undefined) ?? 'COMPLETED';
      const createdBy = (options.createdBy as string | undefined)
        ?? (options.defaultCreatedBy as string | undefined)
        ?? '__cli__';

      const response = await withSpinner(
        'Creating report...',
        () => axios.post(
          baseUrl,
          {
            planId: options.planId,
            title,
            content,
            reportType,
            status,
            createdBy
          },
          { headers }
        ),
        'Report created',
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for report update');
      const body: Record<string, any> = {};

      if (options.title ?? options.summary) body.title = options.title ?? options.summary;
      if (options.content) body.content = options.content;
      if (options.reportType) body.reportType = options.reportType;
      if (options.status) body.status = options.status;
      if (options.qualityScore !== undefined) body.qualityScore = options.qualityScore;

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
        { headers }
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
      if (options.createdBy) params.createdBy = options.createdBy;

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
      if (!options.id) throw new Error('--id is required for postmortem get');
      const response = await axios.get(
        `${baseUrl}/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for postmortem create');
      if (!options.content) throw new Error('--content is required for postmortem create');
      if (options.actionItems === undefined) throw new Error('--action-items is required for postmortem create');

      const response = await withSpinner(
        'Creating post-mortem...',
        () => axios.post(
          baseUrl,
          {
            planId: options.planId,
            title: options.title,
            content: options.content,
            actionItems: splitCsv(options.actionItems),
            status: options.status,
            createdBy: (options.createdBy as string | undefined)
              ?? (options.defaultCreatedBy as string | undefined)
              ?? '__cli__'
          },
          { headers }
        ),
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
        { headers }
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

async function executeConventionCommand(action: string, options: any): Promise<any> {
  switch (action) {
    case 'list':
      return conventionList();
    case 'show':
      return conventionShow();
    case 'download':
      return conventionDownload({ cwd: options?.cwd });
    default:
      throw new Error(`Unknown convention action: ${action}. Use list, show, or download.`);
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
      return {
        apiKey: process.env.AGENTTEAMS_API_KEY,
        apiUrl: process.env.AGENTTEAMS_API_URL,
      };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
