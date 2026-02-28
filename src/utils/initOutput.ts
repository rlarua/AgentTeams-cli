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
  console.log('  2. Add the following to the top of your AI agent\'s convention file (e.g., as frontmatter):');
  console.log('');
  console.log('       ---');
  console.log('       alwaysApply: true');
  console.log('       agentInstruction: |');
  console.log('         Always refer to `.agentteams/convention.md`.');
  console.log('       ---');
  console.log('');
  console.log('     AI Agent     Convention File');
  console.log('     Claude Code  CLAUDE.md');
  console.log('     OpenCode     AGENTS.md');
  console.log('     Codex        AGENTS.md');
  console.log('     Cursor       .cursor/rules/*.mdc');
  console.log('     Antigravity  GEMINI.md');
  console.log('');
  console.log('  3. Try saying to your AI agent:');
  console.log('       Analyze the codebase and create conventions.');
  console.log('       Create a plan to improve test coverage for this project.');
}
