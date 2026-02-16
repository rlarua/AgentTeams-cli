import axios from 'axios';
import { loadConfig } from '../utils/config.js';

function getConfigOrThrow() {
  const config = loadConfig();
  if (!config) {
    throw new Error(
      'Configuration not found. Run "agentteams init" first or set AGENTTEAMS_* environment variables.'
    );
  }
  return config;
}

function getHeaders(apiKey: string) {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

export async function dependencyList(taskId: string): Promise<any> {
  const config = getConfigOrThrow();
  const response = await axios.get(
    `${config.apiUrl}/api/tasks/${taskId}/dependencies`,
    { headers: getHeaders(config.apiKey) }
  );
  return response.data;
}

export async function dependencyCreate(
  taskId: string,
  dependsOnId: string
): Promise<any> {
  const config = getConfigOrThrow();
  const response = await axios.post(
    `${config.apiUrl}/api/tasks/${taskId}/dependencies`,
    { dependsOnId: Number(dependsOnId) },
    { headers: getHeaders(config.apiKey) }
  );
  return response.data;
}

export async function dependencyDelete(
  taskId: string,
  depId: string
): Promise<any> {
  const config = getConfigOrThrow();
  const response = await axios.delete(
    `${config.apiUrl}/api/tasks/${taskId}/dependencies/${depId}`,
    { headers: getHeaders(config.apiKey) }
  );
  if (response.status === 204) {
    return { message: `Dependency ${depId} deleted from task ${taskId}.` };
  }
  return response.data;
}
