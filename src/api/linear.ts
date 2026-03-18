import httpClient from '../utils/httpClient.js';

export async function getLinearIssue(
  apiUrl: string,
  headers: any,
  issueId: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/linear/issues/${issueId}`;
  const response = await httpClient.get(baseUrl, { headers });
  return response.data;
}

export async function createLinearComment(
  apiUrl: string,
  headers: any,
  issueId: string,
  body: string
): Promise<any> {
  const baseUrl = `${apiUrl}/api/linear/issues/${issueId}/comments`;
  const response = await httpClient.post(baseUrl, { body }, { headers });
  return response.data;
}
