import axios from 'axios';
import { getApiConfig } from '../utils/env.js';
import { executeInitCommand } from './init.js';
import { conventionShow, conventionAppend, conventionUpdate } from './convention.js';
import { agentConfigList, agentConfigGet, agentConfigDelete } from './agentConfig.js';
import { dependencyList, dependencyCreate, dependencyDelete } from './dependency.js';

export async function executeCommand(
  resource: string,
  action: string,
  options: any
): Promise<any> {
  switch (resource) {
    case 'init':
      return executeInitCommand(options);
    case 'convention':
      return executeConventionLocalCommand(action);
    case 'status':
    case 'task':
    case 'comment':
    case 'report': {
      const { apiKey, apiUrl } = getApiConfig();

      const headers = {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      };

      if (resource === 'status') {
        return executeStatusCommand(apiUrl, headers, action, options);
      }

      if (resource === 'task') {
        return executeTaskCommand(apiUrl, headers, action, options);
      }

      if (resource === 'comment') {
        return executeCommentCommand(apiUrl, headers, action, options);
      }

      return executeReportCommand(apiUrl, headers, action, options);
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
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'report': {
      const response = await axios.post(
        `${apiUrl}/agent-statuses`,
        {
          agentName: options.agentName,
          status: options.status,
          projectId: options.projectId,
          metadata: options.metadata,
        },
        { headers }
      );
      return response.data;
    }
    case 'list': {
      const response = await axios.get(`${apiUrl}/agent-statuses`, { headers });
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for status get');
      const response = await axios.get(
        `${apiUrl}/agent-statuses/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for status update');
      const response = await axios.put(
        `${apiUrl}/agent-statuses/${options.id}`,
        {
          agentName: options.agentName,
          status: options.status,
          metadata: options.metadata,
        },
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for status delete');
      const response = await axios.delete(
        `${apiUrl}/agent-statuses/${options.id}`,
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
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'list': {
      const response = await axios.get(`${apiUrl}/tasks`, { headers });
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for task get');
      const response = await axios.get(`${apiUrl}/tasks/${options.id}`, {
        headers,
      });
      return response.data;
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for task create');
      const response = await axios.post(
        `${apiUrl}/tasks`,
        {
          title: options.title,
          description: options.description ?? '',
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
        `${apiUrl}/tasks/${options.id}`,
        body,
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for task delete');
      await axios.delete(`${apiUrl}/tasks/${options.id}`, { headers });
      return { message: `Task ${options.id} deleted successfully` };
    }
    case 'assign': {
      if (!options.id) throw new Error('--id is required for task assign');
      if (!options.agent) throw new Error('--agent is required for task assign');
      const response = await axios.post(
        `${apiUrl}/tasks/${options.id}/assign`,
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
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'list': {
      if (!options.taskId) throw new Error('--task-id is required for comment list');
      const response = await axios.get(
        `${apiUrl}/tasks/${options.taskId}/comments`,
        { headers }
      );
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for comment get');
      const response = await axios.get(
        `${apiUrl}/comments/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'create': {
      if (!options.taskId) throw new Error('--task-id is required for comment create');
      if (!options.content) throw new Error('--content is required for comment create');
      const response = await axios.post(
        `${apiUrl}/tasks/${options.taskId}/comments`,
        {
          content: options.content,
          authorId: options.authorId,
        },
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for comment update');
      if (!options.content) throw new Error('--content is required for comment update');
      const response = await axios.put(
        `${apiUrl}/comments/${options.id}`,
        { content: options.content },
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for comment delete');
      await axios.delete(
        `${apiUrl}/comments/${options.id}`,
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
  switch (action) {
    case 'list': {
      const response = await axios.get(`${apiUrl}/completion-reports`, { headers });
      return response.data;
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for report get');
      const response = await axios.get(
        `${apiUrl}/completion-reports/${options.id}`,
        { headers }
      );
      return response.data;
    }
    case 'create': {
      const response = await axios.post(
        `${apiUrl}/completion-reports`,
        {
          taskId: options.taskId,
          summary: options.summary,
          agentId: options.agentId,
          details: options.details,
        },
        { headers }
      );
      return response.data;
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for report update');
      const body: Record<string, any> = {};
      if (options.summary) body.summary = options.summary;
      if (options.details) body.details = options.details;

      const response = await axios.put(
        `${apiUrl}/completion-reports/${options.id}`,
        body,
        { headers }
      );
      return response.data;
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for report delete');
      await axios.delete(
        `${apiUrl}/completion-reports/${options.id}`,
        { headers }
      );
      return { message: `Report ${options.id} deleted successfully` };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function executeConventionLocalCommand(action: string): Promise<any> {
  switch (action) {
    case 'show':
      return conventionShow();
    case 'append':
      return conventionAppend();
    case 'update':
      return conventionUpdate();
    default:
      throw new Error(`Unknown convention action: ${action}. Use show, append, or update.`);
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
      if (!options.dependsOn) throw new Error('--depends-on is required for dependency create');
      return dependencyCreate(options.taskId, options.dependsOn);
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
