import { executeInitCommand } from './init.js';
import { executeAgentConfigCommand } from './agentConfigCommand.js';
import { executeConfigCommand } from './config.js';
import { executeConventionCommand, executeSyncCommand } from './conventionRouter.js';
import { executeDependencyCommand } from './dependencyCommand.js';
import { executeCommentCommand } from './comment.js';
import { executePlanCommand } from './plan.js';
import { executePostMortemCommand } from './postmortem.js';
import { executeReportCommand } from './report.js';
import { executeStatusCommand } from './status.js';
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
        return executePlanCommand(apiUrl, config.projectId, headers, action, {
          ...options,
          defaultCreatedBy: config.agentName,
          defaultRepositoryId: config.repositoryId,
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
        defaultCreatedBy: config.agentName,
        defaultRepositoryId: config.repositoryId
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
        defaultCreatedBy: config.agentName,
        defaultRepositoryId: config.repositoryId
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
