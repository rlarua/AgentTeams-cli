export function validateEnv(): void {
  if (!process.env.AGENTTEAMS_API_KEY) {
    throw new Error('AGENTTEAMS_API_KEY environment variable is required');
  }

  if (!process.env.AGENTTEAMS_API_URL) {
    throw new Error('AGENTTEAMS_API_URL environment variable is required');
  }
}

export function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getApiConfig() {
  validateEnv();

  return {
    apiKey: process.env.AGENTTEAMS_API_KEY!,
    apiUrl: normalizeUrl(process.env.AGENTTEAMS_API_URL!),
  };
}
