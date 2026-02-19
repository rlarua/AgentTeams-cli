import { AxiosError } from 'axios';

function translateServerMessage(message: string): string {
  const mapping: Array<{ match: string; translated: string }> = [
    { match: '컨벤션 수정 권한이 없습니다', translated: "You don't have permission to modify conventions." },
    { match: '프로젝트 접근 권한이 없습니다', translated: "You don't have permission to access this project." },
    { match: '인증 토큰이 필요합니다', translated: 'Authentication token is required.' },
    { match: 'projectId 파라미터가 필요합니다', translated: 'projectId parameter is required.' },
  ];

  for (const item of mapping) {
    if (message.includes(item.match)) {
      return item.translated;
    }
  }

  return message;
}

export function handleError(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { message?: string } | undefined;
      const rawMessage = data?.message || error.message;
      const message = typeof rawMessage === 'string' ? translateServerMessage(rawMessage) : String(rawMessage);

      switch (status) {
        case 400:
          return `Bad request. Check your flags and payload.\nNext: Verify required options (e.g., --id/--plan-id) and try again.\nDetails: ${message}`;
        case 401:
          return `Invalid API key. Please check your AGENTTEAMS_API_KEY environment variable.\nNext: Re-run 'agentteams init' or set AGENTTEAMS_API_KEY.\nDetails: ${message}`;
        case 403:
          if (typeof message === 'string' && message.toLowerCase().includes('cross-project')) {
            return `Cross-project access denied. You don't have permission to access this resource.\nNext: Confirm you're using an API key for the same project/team.\nDetails: ${message}`;
          }
          return `Forbidden.\nNext: Confirm your API key permissions for this project/team.\nDetails: ${message}`;
        case 404:
          return `Resource not found.\nNext: Check identifiers (e.g., --id) and the target project.\nDetails: ${message}`;
        case 409:
          return `Conflict.\nNext: If this is a convention update/delete, run 'agentteams convention download' and retry.\nDetails: ${message}`;
        case 500:
          return `Server error occurred. Please try again later.\nNext: Retry later. If it persists, check server status/logs.\nDetails: ${message}`;
        default:
          return `HTTP ${status} error: ${message}`;
      }
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const apiUrl = process.env.AGENTTEAMS_API_URL ?? '(not set)';
      return `Cannot connect to server at ${apiUrl}.\nNext: Check AGENTTEAMS_API_URL and connectivity.`;
    }

    return `Network error: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isAxiosError(error: unknown): error is AxiosError {
  return (error as AxiosError).isAxiosError === true;
}
