import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';

const PACKAGE_NAME = '@rlarua/agentteams-cli';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 3000;

interface CacheData {
  lastCheck: number;
  latestVersion: string;
}

function getCachePath(): string {
  return join(homedir(), '.agentteams', 'update-check.json');
}

function readCache(): CacheData | null {
  try {
    const cachePath = getCachePath();
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as CacheData;
  } catch {
    return null;
  }
}

function writeCache(data: CacheData): void {
  try {
    const cachePath = getCachePath();
    const dir = join(homedir(), '.agentteams');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore write failures silently
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Start an async update check. Call early, collect the message later.
 * Never throws, never blocks CLI execution.
 */
export function startUpdateCheck(currentVersion: string): Promise<string | null> {
  return (async () => {
    const cache = readCache();

    if (cache && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
      if (compareVersions(currentVersion, cache.latestVersion)) {
        return formatUpdateMessage(currentVersion, cache.latestVersion);
      }
      return null;
    }

    const latestVersion = await fetchLatestVersion();
    if (!latestVersion) return null;

    writeCache({ lastCheck: Date.now(), latestVersion });

    if (compareVersions(currentVersion, latestVersion)) {
      return formatUpdateMessage(currentVersion, latestVersion);
    }
    return null;
  })().catch(() => null);
}

function formatUpdateMessage(current: string, latest: string): string {
  return [
    '',
    chalk.yellow(`  Update available: ${current} → ${latest}`),
    chalk.cyan(`  Run \`npm install -g ${PACKAGE_NAME}\` to update`),
    '',
  ].join('\n');
}
