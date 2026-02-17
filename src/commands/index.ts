import axios from 'axios';
import { executeInitCommand } from './init.js';
import {
  conventionList,
  conventionShow,
  conventionDownload,
} from './convention.js';
import { agentConfigList, agentConfigGet, agentConfigDelete } from './agentConfig.js';
import { dependencyList, dependencyCreate, dependencyDelete } from './dependency.js';
import { loadConfig } from '../utils/config.js';

export async function executeCommand(
  resource: string,
  action: string,
  options: any
): Promise<any> {
  switch (resource) {
    case 'init':
      return executeInitCommand(options);
    case 'convention':
      return executeConventionCommand(action);
    case 'status':
    case 'task':
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

      if (resource === 'task') {
        return executeTaskCommand(apiUrl, config.projectId, headers, action, options);
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
        createdBy: options.createdBy ?? config.agentName
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
      const response = await axios.get(baseUrl, { headers });
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

async function executeTaskCommand(
  apiUrl: string,
  projectId: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/tasks`;

  switch (action) {
    case 'list': {
      const response = await axios.get(baseUrl, { headers });
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for task get');
      const response = await axios.get(`${baseUrl}/${options.id}`, {
        headers,
      });
      return response.data;
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for task create');
      if (!options.description || options.description.trim().length === 0) {
        throw new Error('--description is required for task create');
      }
      const response = await axios.post(
        baseUrl,
        {
          title: options.title,
          description: options.description,
          priority: options.priority ?? 'MEDIUM',
          status: options.status,
          planId: options.planId,
        },
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for task update');
      const body: Record<string, string> = {};
      if (options.title) body.title = options.title;
      if (options.description) body.description = options.description;
      if (options.status) body.status = options.status;
      if (options.priority) body.priority = options.priority;

      const response = await axios.put(
        `${baseUrl}/${options.id}`,
        body,
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for task delete');
      await axios.delete(`${baseUrl}/${options.id}`, { headers });
      return { message: `Task ${options.id} deleted successfully` };
    }
    case 'assign': {
      if (!options.id) throw new Error('--id is required for task assign');
      if (!options.agent) throw new Error('--agent is required for task assign');
      const response = await axios.post(
        `${baseUrl}/${options.id}/assign`,
        { assignedTo: options.agent },
        { headers }
      );
      return response.data;
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
  const taskBaseUrl = `${apiUrl}/api/projects/${projectId}/tasks`;
  const commentBaseUrl = `${apiUrl}/api/projects/${projectId}/comments`;

  switch (action) {
    case 'list': {
      if (!options.taskId) throw new Error('--task-id is required for comment list');
      const response = await axios.get(
        `${taskBaseUrl}/${options.taskId}/comments`,
        { headers }
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
      if (!options.taskId) throw new Error('--task-id is required for comment create');
      if (!options.type) throw new Error('--type is required for comment create');
      if (!options.content) throw new Error('--content is required for comment create');
      const response = await axios.post(
        `${taskBaseUrl}/${options.taskId}/comments`,
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
      const response = await axios.get(baseUrl, { headers });
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
      const createdBy = (options.createdBy as string | undefined) ?? '__cli__';

      const response = await axios.post(
        baseUrl,
        {
          taskId: options.taskId,
          title,
          content,
          reportType,
          status,
          createdBy
        },
        { headers }
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

async function executeConventionCommand(action: string): Promise<any> {
  switch (action) {
    case 'list':
      return conventionList();
    case 'show':
      return conventionShow();
    case 'download':
      return conventionDownload();
    default:
      throw new Error(`Unknown convention action: ${action}. Use list, show, or download.`);
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
      if (!options.taskId) throw new Error('--task-id is required for dependency list');
      return dependencyList(options.taskId);
    }
    case 'create': {
      if (!options.taskId) throw new Error('--task-id is required for dependency create');
      if (!options.blockingTaskId) throw new Error('--blocking-task-id is required for dependency create');
      return dependencyCreate(options.taskId, options.blockingTaskId);
    }
    case 'delete': {
      if (!options.taskId) throw new Error('--task-id is required for dependency delete');
      if (!options.depId) throw new Error('--dep-id is required for dependency delete');
      return dependencyDelete(options.taskId, options.depId);
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
