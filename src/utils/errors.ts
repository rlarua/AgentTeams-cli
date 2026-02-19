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
        case 401:
          return `Invalid API key. Please check your AGENTTEAMS_API_KEY environment variable.\nDetails: ${message}`;
        case 403:
          if (typeof message === 'string' && message.toLowerCase().includes('cross-project')) {
            return `Cross-project access denied. You don't have permission to access this resource.\nDetails: ${message}`;
          }
          return `Forbidden.\nDetails: ${message}`;
        case 404:
          return `Resource not found.\nDetails: ${message}`;
        case 500:
          return `Server error occurred. Please try again later.\nDetails: ${message}`;
        default:
          return `HTTP ${status} error: ${message}`;
      }
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return `Cannot connect to server at ${process.env.AGENTTEAMS_API_URL}. Please check if the server is running and the URL is correct.`;
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
