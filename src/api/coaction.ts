import httpClient from '../utils/httpClient.js';
import { withoutJsonContentType } from '../utils/httpHeaders.js';

export async function listCoActions(
  apiUrl: string,
  projectId: string,
  headers: any,
  params?: Record<string, string | number>
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const requestConfig = params && Object.keys(params).length > 0
    ? { headers, params }
    : { headers };

  const response = await httpClient.get(baseUrl, requestConfig);
  return response.data;
}

export async function getCoAction(
  apiUrl: string,
  projectId: string,
  headers: any,
  id: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const response = await httpClient.get(`${baseUrl}/${id}`, { headers });
  return response.data;
}

export async function createCoAction(
  apiUrl: string,
  projectId: string,
  headers: any,
  body: Record<string, unknown>
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const response = await httpClient.post(baseUrl, body, { headers });
  return response.data;
}

export async function updateCoAction(
  apiUrl: string,
  projectId: string,
  headers: any,
  id: string,
  body: Record<string, unknown>
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const response = await httpClient.put(`${baseUrl}/${id}`, body, { headers });
  return response.data;
}

export async function deleteCoAction(
  apiUrl: string,
  projectId: string,
  headers: any,
  id: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const response = await httpClient.delete(`${baseUrl}/${id}`, {
    headers: withoutJsonContentType(headers),
  });
  return response.data;
}

export async function linkPlanToCoAction(
  apiUrl: string,
  projectId: string,
  headers: any,
  coActionId: string,
  planId: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const response = await httpClient.post(`${baseUrl}/${coActionId}/plans/${planId}`, {}, { headers });
  return response.data;
}

export async function unlinkPlanFromCoAction(
  apiUrl: string,
  projectId: string,
  headers: any,
  coActionId: string,
  planId: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/co-actions`;
  const response = await httpClient.delete(`${baseUrl}/${coActionId}/plans/${planId}`, {
    headers: withoutJsonContentType(headers),
  });
  return response.data;
}
