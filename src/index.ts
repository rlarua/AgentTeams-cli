#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { executeCommand } from './commands/index.js';
import { formatOutput } from './utils/formatter.js';
import { handleError } from './utils/errors.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('agentteams')
  .description('CLI tool for AgentTeams API')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize AgentTeams CLI via OAuth')
  .option('--format <format>', 'Output format (json, text)', 'text')
  .action(async (options) => {
    try {
      const result = await executeCommand('init', 'start', {});

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Manage agent statuses')
  .argument('<action>', 'Action to perform (report, list, get, update, delete)')
  .option('--id <id>', 'Status ID')
  .option('--agent-name <name>', 'Agent name')
  .option('--status <status>', 'Agent status')
  .option('--project-id <id>', 'Project ID', parseInt)
  .option('--metadata <json>', 'Metadata as JSON string')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('status', action, {
        id: options.id,
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
  .argument('<action>', 'Action to perform (list, get, create, update, delete, assign)')
  .option('--id <id>', 'Task ID')
  .option('--title <title>', 'Task title')
  .option('--description <description>', 'Task description')
  .option('--status <status>', 'Task status (PENDING, IN_PROGRESS, DONE, CANCELLED)')
  .option('--priority <priority>', 'Task priority (LOW, MEDIUM, HIGH)')
  .option('--plan-id <planId>', 'Plan ID')
  .option('--agent <agent>', 'Agent name or ID to assign')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('task', action, {
        id: options.id,
        title: options.title,
        description: options.description,
        status: options.status,
        priority: options.priority,
        planId: options.planId,
        agent: options.agent,
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
  .argument('<action>', 'Action to perform (list, get, create, update, delete)')
  .option('--id <id>', 'Comment ID', parseInt)
  .option('--task-id <id>', 'Task ID', parseInt)
  .option('--content <content>', 'Comment content')
  .option('--author-id <id>', 'Author ID', parseInt)
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('comment', action, {
        id: options.id,
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
  .argument('<action>', 'Action to perform (list, get, create, update, delete)')
  .option('--id <id>', 'Report ID')
  .option('--task-id <id>', 'Task ID', parseInt)
  .option('--summary <summary>', 'Report summary')
  .option('--agent-id <id>', 'Agent ID', parseInt)
  .option('--details <json>', 'Details as JSON string')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('report', action, {
        id: options.id,
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
  .description('Manage project conventions')
  .argument('<action>', 'Action to perform (show, append, update)')
  .action(async (action) => {
    try {
      const result = await executeCommand('convention', action, {});

      if (typeof result === 'string') {
        console.log(result);
      } else {
        console.log(formatOutput(result, 'text'));
      }
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('dependency')
  .description('Manage task dependencies')
  .argument('<action>', 'Action to perform (list, create, delete)')
  .option('--task-id <id>', 'Task ID')
  .option('--depends-on <id>', 'Dependency target task ID')
  .option('--dep-id <id>', 'Dependency ID to delete')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('dependency', action, {
        taskId: options.taskId,
        dependsOn: options.dependsOn,
        depId: options.depId,
      });

      console.log(formatOutput(result, options.format));
    } catch (error) {
      console.error(handleError(error));
      process.exit(1);
    }
  });

program
  .command('agent-config')
  .description('Manage agent configurations')
  .argument('<action>', 'Action to perform (list, get, delete)')
  .option('--id <id>', 'Agent config ID')
  .option('--format <format>', 'Output format (json, text)', 'json')
  .action(async (action, options) => {
    try {
      const result = await executeCommand('agent-config', action, {
        id: options.id,
      });

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
