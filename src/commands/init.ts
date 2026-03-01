import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import httpClient from '../utils/httpClient.js';
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

function buildAuthorizeUrl(port: number, projectName: string): string {
  return `${AUTH_BASE_URL}/cli/authorize?port=${port}&projectName=${encodeURIComponent(projectName)}`;
}

function printAuthorizeUrl(url: string): void {
  console.log('🚀 Complete a free login in 1 second to download the template:');
  console.log(url);
}

async function tryOpenBrowser(url: string): Promise<void> {
  printAuthorizeUrl(url);

  if (isSshEnvironment()) {
    return;
  }

  try {
    await open(url);
  } catch {
    // Already printed
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

  const response = await httpClient.get(
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

function generateAgentEntryPointFiles(cwd: string): void {
  const DEFAULT_CONVENTION_REFERENCE = `---
alwaysApply: true
agentInstruction: |
**Always refer to \`.agentteams/convention.md\`.**
---

# AgentTeams Convention

**Before starting any task, always refer to \`.agentteams/convention.md\`.**
`;

  const files = [
    'CLAUDE.md',
    'AGENTS.md',
    'GEMINI.md',
    '.cursor/rules/agentteams.mdc'
  ];

  for (const relativePath of files) {
    const fullPath = join(cwd, relativePath);
    if (!existsSync(fullPath)) {
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, DEFAULT_CONVENTION_REFERENCE, 'utf-8');
      console.log(`✅ Agent integration file created: ${relativePath}`);
    } else {
      console.log(`⏭️ Agent integration file skipped (already exists): ${relativePath}`);
    }
  }
}

export async function executeInitCommand(options?: InitOptions): Promise<InitResult> {
  const cwd = resolve(options?.cwd ?? process.cwd());
  const configPath = join(cwd, CONFIG_DIR, CONFIG_FILE);
  const conventionPath = join(cwd, CONFIG_DIR, CONVENTION_FILE);

  const projectName = basename(cwd);

  let authContext;

  try {
    authContext = startLocalAuthServer();
  } catch (error) {
    throw new Error(
      `Failed to start local OAuth server: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const authUrl = buildAuthorizeUrl(authContext.port, projectName);
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
    generateAgentEntryPointFiles(cwd);

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
