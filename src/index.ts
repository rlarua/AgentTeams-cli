#!/usr/bin/env node

import { Command } from 'commander';
import { executeCommand } from './commands/index.js';
import { formatOutput } from './utils/formatter.js';
import { handleError } from './utils/errors.js';

const program = new Command();

program
  .name('agentteams')
  .description('CLI tool for AgentTeams API')
  .version('1.0.0');

program
  .command('status')
  .description('Manage agent statuses')
  .argument('<action>', 'Action to perform (report, list)')
  .option('--agent-name <name>', 'Agent name')
  .option('--status <status>', 'Agent status')
  .option('--project-id <id>', 'Project ID', parseInt)
  .option('--metadata <json>', 'Metadata as JSON string')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('status', action, {
        agentName: options.agentName,
        status: options.status,
        projectId: options.projectId,
        metadata: options.metadata ? JSON.parse(options.metadata) : undefined,
      });

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('task')
  .description('Manage tasks')
  .argument('<action>', 'Action to perform (list, get)')
  .option('--id <id>', 'Task ID')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('task', action, {
        id: options.id,
      });

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('comment')
  .description('Manage task comments')
  .argument('<action>', 'Action to perform (create)')
  .option('--task-id <id>', 'Task ID', parseInt)
  .option('--content <content>', 'Comment content')
  .option('--author-id <id>', 'Author ID', parseInt)
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('comment', action, {
        taskId: options.taskId,
        content: options.content,
        authorId: options.authorId,
      });

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Manage completion reports')
  .argument('<action>', 'Action to perform (create)')
  .option('--task-id <id>', 'Task ID', parseInt)
  .option('--summary <summary>', 'Report summary')
  .option('--agent-id <id>', 'Agent ID', parseInt)
  .option('--details <json>', 'Details as JSON string')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('report', action, {
        taskId: options.taskId,
        summary: options.summary,
        agentId: options.agentId,
        details: options.details ? JSON.parse(options.details) : undefined,
      });

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('convention')
  .description('Manage conventions')
  .argument('<action>', 'Action to perform (list)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('convention', action, {});

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Manage configuration')
  .argument('<action>', 'Action to perform (whoami)')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('config', action, {});

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program.parse();
