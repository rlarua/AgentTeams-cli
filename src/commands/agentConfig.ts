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

export async function agentConfigList(): Promise<any> {
  const config = getConfigOrThrow();
  const response = await axios.get(
    `${config.apiUrl}/api/projects/${config.projectId}/agent-configs`,
    { headers: getHeaders(config.apiKey) }
  );
  return response.data;
}

export async function agentConfigGet(id: string): Promise<any> {
  const config = getConfigOrThrow();
  const response = await axios.get(
    `${config.apiUrl}/api/projects/${config.projectId}/agent-configs/${id}`,
    { headers: getHeaders(config.apiKey) }
  );
  return response.data;
}

export async function agentConfigDelete(id: string): Promise<any> {
  const config = getConfigOrThrow();
  const response = await axios.delete(
    `${config.apiUrl}/api/projects/${config.projectId}/agent-configs/${id}`,
    { headers: getHeaders(config.apiKey) }
  );
  if (response.status === 204) {
    return { message: `Agent config ${id} deleted successfully.` };
  }
  return response.data;
}
