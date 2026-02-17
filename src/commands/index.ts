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
        createdBy: options.createdBy ?? config.agentName
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
      const response = await axios.get(baseUrl, { headers });
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
      if (!options.content || options.content.trim().length === 0) {
        throw new Error('--content is required for plan create');
      }
      const response = await axios.post(
        baseUrl,
        {
          title: options.title,
          content: options.content,
          priority: options.priority ?? 'MEDIUM',
          status: options.status,
        },
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for plan update');
      const body: Record<string, string> = {};
      if (options.title) body.title = options.title;
      if (options.content) body.content = options.content;
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
      const response = await axios.get(
        `${planBaseUrl}/${options.planId}/comments`,
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
          planId: options.planId,
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
      const response = await axios.get(baseUrl, { headers });
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
      if (!options.summary) throw new Error('--summary is required for postmortem create');
      if (!options.rootCause) throw new Error('--root-cause is required for postmortem create');
      if (!options.timeline) throw new Error('--timeline is required for postmortem create');
      if (!options.impact) throw new Error('--impact is required for postmortem create');
      if (options.actionItems === undefined) throw new Error('--action-items is required for postmortem create');
      if (!options.lessonsLearned) throw new Error('--lessons-learned is required for postmortem create');

      const response = await axios.post(
        baseUrl,
        {
          planId: options.planId,
          summary: options.summary,
          rootCause: options.rootCause,
          timeline: options.timeline,
          impact: options.impact,
          actionItems: splitCsv(options.actionItems),
          lessonsLearned: options.lessonsLearned,
          status: options.status,
          createdBy: options.createdBy
        },
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for postmortem update');
      const body: Record<string, any> = {};

      if (Object.prototype.hasOwnProperty.call(options, 'planId')) {
        body.planId = options.planId;
      }
      if (options.summary) body.summary = options.summary;
      if (options.rootCause) body.rootCause = options.rootCause;
      if (options.timeline) body.timeline = options.timeline;
      if (options.impact) body.impact = options.impact;
      if (options.actionItems !== undefined) body.actionItems = splitCsv(options.actionItems);
      if (options.lessonsLearned) body.lessonsLearned = options.lessonsLearned;
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
