import { formatOutput } from './formatter.js';
import type { OutputFormat } from './outputPolicy.js';

interface InitResultShape {
  success: true;
  agentName: string;
  configPath: string;
  conventionPath: string;
}

function isInitResult(result: unknown): result is InitResultShape {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return (
    r.success === true &&
    typeof r.agentName === 'string' &&
    typeof r.configPath === 'string' &&
    typeof r.conventionPath === 'string'
  );
}

export function printInitResult(result: unknown, format: OutputFormat): void {
  if (format === 'json') {
    const outputText =
      typeof result === 'string' ? result : formatOutput(result, format);
    console.log(outputText);
    return;
  }

  if (!isInitResult(result)) {
    const outputText =
      typeof result === 'string' ? result : formatOutput(result, format);
    console.log(outputText);
    return;
  }

  console.log(`✓ Authenticated as ${result.agentName}`);
  console.log(`✓ Config saved:      ${result.configPath}`);
  console.log(`✓ Convention saved:  ${result.conventionPath}`);
  console.log(`✓ Conventions synced to .agentteams/`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Add .agentteams/ to .gitignore');
  console.log('  2. Link convention.md to your agent:');
  console.log('     - Claude Code → CLAUDE.md');
  console.log('     - opencode    → AGENTS.md');
  console.log('     Always reference `.agentteams/convention.md`.');
  console.log('  3. Copy the convention content to your agent\'s instruction file:');
  console.log('     agentteams convention show');
}
