import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import open from 'open';
import { startLocalAuthServer } from '../utils/authServer.js';
import { saveConfig } from '../utils/config.js';
import type { Config } from '../types/index.js';

const AUTH_BASE_URL = process.env.AGENTTEAMS_WEB_URL || 'https://agent-web.justin-mk.me';
const CONFIG_DIR = '.agentteams';
const CONFIG_FILE = 'config.json';
const CONVENTION_FILE = 'reporting.md';

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
  environment: string;
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
  };
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
    const authResult = await authContext.waitForCallback();
    const config = toConfig(authResult);

    saveConfig(configPath, config);
    writeFileSync(conventionPath, authResult.convention.content, 'utf-8');

    return {
      success: true,
      authUrl,
      configPath,
      conventionPath,
      teamId: authResult.teamId,
      projectId: authResult.projectId,
      agentName: authResult.agentName,
      environment: authResult.environment,
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
