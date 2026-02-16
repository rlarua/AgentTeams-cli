import axios from 'axios';
import { getApiConfig } from '../utils/env.js';

export async function executeCommand(
  resource: string,
  action: string,
  options: any
): Promise<any> {
  const { apiKey, apiUrl } = getApiConfig();

  const headers = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };

  switch (resource) {
    case 'status':
      return executeStatusCommand(apiUrl, headers, action, options);
    case 'task':
      return executeTaskCommand(apiUrl, headers, action, options);
    case 'comment':
      return executeCommentCommand(apiUrl, headers, action, options);
    case 'report':
      return executeReportCommand(apiUrl, headers, action, options);
    case 'convention':
      return executeConventionCommand(apiUrl, headers, action, options);
    case 'config':
      return executeConfigCommand(action, options);
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
      const response = await axios.get(`${apiUrl}/tasks/${options.id}`, {
        headers,
      });
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
    case 'create': {
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
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function executeConventionCommand(
  apiUrl: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'list': {
      const response = await axios.get(`${apiUrl}/conventions`, { headers });
      return response.data;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function executeConfigCommand(action: string, options: any): Promise<any> {
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
