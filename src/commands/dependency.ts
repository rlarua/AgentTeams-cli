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

function getApiBaseUrl(apiUrl: string): string {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

export async function dependencyList(planId: string): Promise<any> {
  const config = getConfigOrThrow();
  const apiBaseUrl = getApiBaseUrl(config.apiUrl);
  const response = await axios.get(
    `${apiBaseUrl}/api/projects/${config.projectId}/plans/${planId}/dependencies`,
    { headers: getHeaders(config.apiKey) }
  );
  return response.data;
}

export async function dependencyCreate(
  planId: string,
  blockingPlanId: string
): Promise<any> {
  const config = getConfigOrThrow();
  const apiBaseUrl = getApiBaseUrl(config.apiUrl);
  const response = await axios.post(
    `${apiBaseUrl}/api/projects/${config.projectId}/plans/${planId}/dependencies`,
    { blockingPlanId },
    { headers: getHeaders(config.apiKey) }
  );
  return response.data;
}

export async function dependencyDelete(
  planId: string,
  depId: string
): Promise<any> {
  const config = getConfigOrThrow();
  const apiBaseUrl = getApiBaseUrl(config.apiUrl);
  const response = await axios.delete(
    `${apiBaseUrl}/api/projects/${config.projectId}/plans/${planId}/dependencies/${depId}`,
    { headers: getHeaders(config.apiKey) }
  );
  if (response.status === 204) {
    return { message: `Dependency ${depId} deleted from plan ${planId}.` };
  }
  return response.data;
}
