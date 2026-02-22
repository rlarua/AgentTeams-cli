import axios from 'axios';
import { withoutJsonContentType } from '../utils/httpHeaders.js';

export async function reportStatus(
  apiUrl: string,
  projectId: string,
  headers: any,
  body: {
    agent: unknown;
    status: unknown;
    task: unknown;
    issues: string[];
    remaining: string[];
  }
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
  const response = await axios.post(baseUrl, body, { headers });
  return response.data;
}

export async function listStatuses(
  apiUrl: string,
  projectId: string,
  headers: any,
  params?: Record<string, number>
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
  const requestConfig = params && Object.keys(params).length > 0
    ? { headers, params }
    : { headers };

  const response = await axios.get(baseUrl, requestConfig);
  return response.data;
}

export async function getStatus(
  apiUrl: string,
  projectId: string,
  headers: any,
  id: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
  const response = await axios.get(`${baseUrl}/${id}`, { headers });
  return response.data;
}

export async function updateStatus(
  apiUrl: string,
  projectId: string,
  headers: any,
  id: string,
  body: Record<string, unknown>
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
  const response = await axios.put(`${baseUrl}/${id}`, body, { headers });
  return response.data;
}

export async function deleteStatus(
  apiUrl: string,
  projectId: string,
  headers: any,
  id: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/agent-statuses`;
  const response = await axios.delete(`${baseUrl}/${id}`, {
    headers: withoutJsonContentType(headers),
  });
  return response.data;
}
