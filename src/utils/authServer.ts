import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const expressModule = require('express') as any;
const express = expressModule.default ?? expressModule;

const DEFAULT_OAUTH_PORT = 7777;
const OAUTH_PORT_MIN = 7777;
const OAUTH_PORT_MAX = 7790;
const CALLBACK_TIMEOUT_MS = 60_000;

export type AuthResult = {
  teamId: string;
  projectId: string;
  agentName: string;
  apiKey: string;
  apiUrl: string;
  configId: number;
  environment: string;
  convention: {
    fileName: string;
    content: string;
  };
};

type AuthServerResult = {
  server: Server;
  waitForCallback: () => Promise<AuthResult>;
  port: number;
};

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsedPort = Number.parseInt(value, 10);
  if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return null;
  }

  return parsedPort;
}

function buildCandidatePorts(): number[] {
  const requestedPort = parsePort(process.env.AGENTTEAMS_OAUTH_PORT) ?? DEFAULT_OAUTH_PORT;
  const rangePorts: number[] = [];

  for (let port = OAUTH_PORT_MIN; port <= OAUTH_PORT_MAX; port += 1) {
    rangePorts.push(port);
  }

  const uniquePorts = new Set<number>();
  uniquePorts.add(requestedPort);

  for (const port of rangePorts) {
    uniquePorts.add(port);
  }

  return Array.from(uniquePorts.values());
}

function isPortAvailableSync(port: number): boolean {
  const checkScript = [
    'const net = require("node:net");',
    'const port = Number(process.argv[1]);',
    'const server = net.createServer();',
    'server.once("error", () => process.exit(1));',
    'server.listen(port, () => {',
    '  server.close(() => process.exit(0));',
    '});',
  ].join(' ');

  try {
    execFileSync(process.execPath, ['-e', checkScript, String(port)], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findAvailablePortSync(): number {
  const candidatePorts = buildCandidatePorts();

  for (const candidatePort of candidatePorts) {
    if (isPortAvailableSync(candidatePort)) {
      return candidatePort;
    }
  }

  throw new Error(
    `No available OAuth callback port found in ${OAUTH_PORT_MIN}-${OAUTH_PORT_MAX} and requested AGENTTEAMS_OAUTH_PORT.`
  );
}

function isAuthResult(value: unknown): value is AuthResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const convention = candidate.convention as Record<string, unknown> | undefined;

  return (
    typeof candidate.teamId === 'string' &&
    typeof candidate.projectId === 'string' &&
    typeof candidate.agentName === 'string' &&
    typeof candidate.apiKey === 'string' &&
    typeof candidate.apiUrl === 'string' &&
    typeof candidate.configId === 'number' &&
    typeof candidate.environment === 'string' &&
    !!convention &&
    typeof convention.fileName === 'string' &&
    typeof convention.content === 'string'
  );
}

export function startLocalAuthServer(): AuthServerResult {
  const port = findAvailablePortSync();
  const app = express();
  app.use(express.json());

  let settled = false;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let isWaiting = false;

  let resolveCallback: ((result: AuthResult) => void) | undefined;
  let rejectCallback: ((error: Error) => void) | undefined;

  const callbackPromise = new Promise<AuthResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer(app);

  const stopServer = (): void => {
    if (!server.listening) {
      return;
    }

    server.close();
  };

  const clearTimeoutHandle = (): void => {
    if (!timeoutHandle) {
      return;
    }

    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  };

  const resolveAuth = (payload: AuthResult): void => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeoutHandle();
    resolveCallback?.(payload);
    stopServer();
  };

  const rejectAuth = (error: Error): void => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeoutHandle();
    rejectCallback?.(error);
    stopServer();
  };

  app.post('/callback', (request: { body: unknown }, response: { status: (code: number) => { json: (payload: unknown) => void } }) => {
    if (settled) {
      response.status(409).json({ message: 'OAuth callback already processed.' });
      return;
    }

    const payload = request.body;

    if (!isAuthResult(payload)) {
      response.status(400).json({ message: 'Invalid OAuth callback payload.' });
      return;
    }

    response.status(200).json({ success: true });
    resolveAuth(payload);
  });

  server.once('error', (error: Error & { code?: string }) => {
    rejectAuth(
      new Error(
        error.code === 'EADDRINUSE'
          ? `OAuth callback port ${port} is already in use.`
          : `OAuth callback server failed: ${error.message}`
      )
    );
  });

  server.once('close', () => {
    if (!settled && isWaiting) {
      rejectAuth(new Error('OAuth callback server closed before receiving callback.'));
      return;
    }

    if (!settled) {
      settled = true;
      clearTimeoutHandle();
    }
  });

  server.listen(port, 'localhost');

  const waitForCallback = (): Promise<AuthResult> => {
    if (!isWaiting) {
      isWaiting = true;
      timeoutHandle = setTimeout(() => {
        rejectAuth(new Error('OAuth callback timed out after 60 seconds.'));
      }, CALLBACK_TIMEOUT_MS);
    }

    return callbackPromise;
  };

  return {
    server,
    waitForCallback,
    port,
  };
}
