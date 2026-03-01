import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createCoAction,
  deleteCoAction,
  getCoAction,
  listCoActions,
  updateCoAction,
  linkPlanToCoAction,
  unlinkPlanFromCoAction,
} from '../api/coaction.js';
import { findProjectConfig } from '../utils/config.js';
import { toPositiveInteger, toSafeFileName } from '../utils/parsers.js';
import { printFileInfo, withSpinner } from '../utils/spinner.js';

export async function executeCoActionCommand(
  apiUrl: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  if (!options.projectId || typeof options.projectId !== 'string') {
    throw new Error('--project-id is required (or configure AGENTTEAMS_PROJECT_ID / .agentteams/config.json)');
  }

  switch (action) {
    case 'list': {
      const params: Record<string, string | number> = {};
      if (options.status) params.status = options.status;
      if (options.search) params.search = options.search;

      const page = toPositiveInteger(options.page);
      const limitVal = toPositiveInteger(options.limit);
      const pageSizeVal = toPositiveInteger(options.pageSize);
      if (limitVal !== undefined && pageSizeVal !== undefined) {
        process.stderr.write('[warn] --limit and --page-size both specified; --limit takes precedence.\n');
      }
      const pageSize = limitVal ?? pageSizeVal;
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      return listCoActions(apiUrl, options.projectId, headers, params);
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for coaction get');
      return getCoAction(apiUrl, options.projectId, headers, options.id);
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for coaction create');
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        options.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, options.content);
      }
      if (!options.content) throw new Error('--content or --file is required for coaction create');

      const body: Record<string, unknown> = {
        title: options.title,
        content: options.content,
        status: options.status,
        visibility: options.visibility,
      };

      return withSpinner(
        'Creating co-action...',
        () => createCoAction(apiUrl, options.projectId, headers, body),
        'Co-action created',
      );
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for coaction update');
      const body: Record<string, string | null | undefined> = {};

      if (options.title) body.title = options.title;
      if (options.content) body.content = options.content;
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        body.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, body.content);
      }
      if (options.status) body.status = options.status;
      if (options.visibility) body.visibility = options.visibility;
      if (Object.prototype.hasOwnProperty.call(options, 'planId')) {
        body.planId = options.planId === null || options.planId === 'null' ? null : options.planId;
      }

      return updateCoAction(apiUrl, options.projectId, headers, options.id, body);
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for coaction delete');
      await deleteCoAction(apiUrl, options.projectId, headers, options.id);
      return { message: `CoAction ${options.id} deleted successfully` };
    }
    case 'download': {
      if (!options.id) throw new Error('--id is required for coaction download');
      const projectRoot = (() => {
        const configPath = findProjectConfig(process.cwd());
        if (!configPath) return null;
        return resolve(configPath, '..', '..');
      })();
      if (!projectRoot) {
        throw new Error("Project root not found. Run 'agentteams init' first.");
      }

      return withSpinner(
        'Downloading co-action...',
        async () => {
          const response = await getCoAction(apiUrl, options.projectId, headers, options.id);
          const coAction = response.data;

          const downloadDir = join(projectRoot, '.agentteams', 'active-plan');
          if (!existsSync(downloadDir)) {
            mkdirSync(downloadDir, { recursive: true });
          }

          const existingFiles = readdirSync(downloadDir).filter((name) => name.endsWith('.md'));
          const idPrefix = coAction.id.slice(0, 8);
          const safeName = toSafeFileName(coAction.title) || 'coaction';
          const baseName = `${safeName}-${idPrefix}`;
          const used = new Set(existingFiles.map((name) => name.toLowerCase()));
          let fileName = `${baseName}.md`;
          let sequence = 2;
          while (used.has(fileName.toLowerCase())) {
            fileName = `${baseName}-${sequence}.md`;
            sequence += 1;
          }

          const filePath = join(downloadDir, fileName);
          const frontmatter = [
            '---',
            `coActionId: ${coAction.id}`,
            `title: ${coAction.title}`,
            `status: ${coAction.status}`,
            `visibility: ${coAction.visibility}`,
            `downloadedAt: ${new Date().toISOString()}`,
            '---',
          ].join('\n');

          const content = coAction.content ?? '';
          writeFileSync(filePath, `${frontmatter}\n\n${content}`, 'utf-8');

          return {
            message: `Co-action downloaded to ${fileName}`,
            filePath: `.agentteams/active-plan/${fileName}`,
          };
        },
        'Co-action downloaded',
      );
    }
    case 'link-plan': {
      if (!options.id) throw new Error('--id is required for coaction link-plan');
      if (!options.planId) throw new Error('--plan-id is required for coaction link-plan');

      return withSpinner(
        'Linking plan...',
        () => linkPlanToCoAction(apiUrl, options.projectId, headers, options.id, options.planId),
        'Plan linked',
      );
    }
    case 'unlink-plan': {
      if (!options.id) throw new Error('--id is required for coaction unlink-plan');
      if (!options.planId) throw new Error('--plan-id is required for coaction unlink-plan');

      return withSpinner(
        'Unlinking plan...',
        () => unlinkPlanFromCoAction(apiUrl, options.projectId, headers, options.id, options.planId),
        'Plan unlinked',
      );
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
