import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import axios from 'axios';
import open from 'open';
import { startLocalAuthServer } from '../utils/authServer.js';
import { saveConfig } from '../utils/config.js';
import { withSpinner } from '../utils/spinner.js';
import { conventionDownload } from './convention.js';
import type { Config } from '../types/index.js';

const AUTH_BASE_URL = process.env.AGENTTEAMS_WEB_URL || 'https://agentteams.run';
const CONFIG_DIR = '.agentteams';
const CONFIG_FILE = 'config.json';
const CONVENTION_FILE = 'convention.md';

type InitOptions = {
  cwd?: string;
};

type InitResult = {
  success: true;
  authUrl: string;
  configPath: string;
  conventionPath: string;
  teamId: string;
  projectId: string;
  agentName: string;
};

function isSshEnvironment(): boolean {
  return Boolean(process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY);
}

function buildAuthorizeUrl(port: number): string {
  return `${AUTH_BASE_URL}/cli/authorize?port=${port}`;
}

function printAuthorizeUrl(url: string): void {
  console.log('Open this URL to continue authentication:');
  console.log(url);
}

async function tryOpenBrowser(url: string): Promise<void> {
  if (isSshEnvironment()) {
    printAuthorizeUrl(url);
    return;
  }

  try {
    await open(url);
  } catch {
    printAuthorizeUrl(url);
  }
}

function toConfig(authResult: {
  teamId: string;
  projectId: string;
  repositoryId: string;
  agentName: string;
  apiKey: string;
  apiUrl: string;
}): Config {
  return {
    teamId: authResult.teamId,
    projectId: authResult.projectId,
    agentName: authResult.agentName,
    apiKey: authResult.apiKey,
    apiUrl: authResult.apiUrl,
    repositoryId: authResult.repositoryId,
  };
}

async function fetchConventionTemplate(authResult: {
  projectId: string;
  apiKey: string;
  apiUrl: string;
  configId: string;
}): Promise<string> {
  const apiUrl = authResult.apiUrl.endsWith('/')
    ? authResult.apiUrl.slice(0, -1)
    : authResult.apiUrl;

  const response = await axios.get(
    `${apiUrl}/api/projects/${authResult.projectId}/agent-configs/${authResult.configId}/convention`,
    {
      headers: {
        'X-API-Key': authResult.apiKey,
        'Content-Type': 'application/json',
      },
    }
  );

  const content = response.data?.data?.content;
  if (typeof content !== 'string') {
    throw new Error('Invalid convention template response from server.');
  }

  return content;
}

export async function executeInitCommand(options?: InitOptions): Promise<InitResult> {
  const cwd = resolve(options?.cwd ?? process.cwd());
  const configPath = join(cwd, CONFIG_DIR, CONFIG_FILE);
  const conventionPath = join(cwd, CONFIG_DIR, CONVENTION_FILE);

  let authContext;

  try {
    authContext = startLocalAuthServer();
  } catch (error) {
    throw new Error(
      `Failed to start local OAuth server: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const authUrl = buildAuthorizeUrl(authContext.port);
  await tryOpenBrowser(authUrl);

  try {
    const authResult = await withSpinner(
      'Waiting for authentication...',
      () => authContext.waitForCallback(),
    );
    const config = toConfig(authResult);
    const conventionContent = await withSpinner(
      'Fetching convention template...',
      () => fetchConventionTemplate(authResult),
    );

    saveConfig(configPath, config);
    writeFileSync(conventionPath, conventionContent, 'utf-8');
    await conventionDownload({ cwd, config });

    return {
      success: true,
      authUrl,
      configPath,
      conventionPath,
      teamId: authResult.teamId,
      projectId: authResult.projectId,
      agentName: authResult.agentName,
    };
  } catch (error) {
    if (authContext.server.listening) {
      authContext.server.close();
    }

    throw new Error(
      `Initialization failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
