import { AxiosError } from 'axios';

export function handleError(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { message?: string } | undefined;
      const message = data?.message || error.message;

      switch (status) {
        case 401:
          return `Invalid API key. Please check your AGENTTEAMS_API_KEY environment variable.\nDetails: ${message}`;
        case 403:
          return `Cross-project access denied. You don't have permission to access this resource.\nDetails: ${message}`;
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
