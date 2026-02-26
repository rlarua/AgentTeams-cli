import axios from 'axios';
import { withoutJsonContentType } from '../utils/httpHeaders.js';

export async function listComments(
  apiUrl: string,
  projectId: string,
  headers: any,
  planId: string,
  params?: Record<string, string | number>
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/plans/${planId}/comments`;
  const requestConfig = params && Object.keys(params).length > 0
    ? { headers, params }
    : { headers };

  const response = await axios.get(baseUrl, requestConfig);
  return response.data;
}

export async function getComment(
  apiUrl: string,
  projectId: string,
  headers: any,
  commentId: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/comments/${commentId}`;
  const response = await axios.get(baseUrl, { headers });
  return response.data;
}

export async function createComment(
  apiUrl: string,
  projectId: string,
  headers: any,
  planId: string,
  body: {
    type: string;
    content: string;
    affectedFiles?: string[];
  }
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/plans/${planId}/comments`;
  const response = await axios.post(baseUrl, body, { headers });
  return response.data;
}

export async function updateComment(
  apiUrl: string,
  projectId: string,
  headers: any,
  commentId: string,
  body: {
    content: string;
    affectedFiles?: string[];
  }
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/comments/${commentId}`;
  const response = await axios.put(baseUrl, body, { headers });
  return response.data;
}

export async function deleteComment(
  apiUrl: string,
  projectId: string,
  headers: any,
  commentId: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/projects/${projectId}/comments/${commentId}`;
  const response = await axios.delete(baseUrl, {
    headers: withoutJsonContentType(headers),
  });
  return response.data;
}
