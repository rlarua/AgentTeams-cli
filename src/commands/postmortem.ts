import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPostMortem,
  deletePostMortem,
  getPostMortem,
  listPostMortems,
  updatePostMortem,
} from '../api/postmortem.js';
import { isCreatedByRequiredValidationError, resolveLegacyCreatedBy } from '../utils/legacyCompat.js';
import { splitCsv, toPositiveInteger } from '../utils/parsers.js';
import { printFileInfo, withSpinner } from '../utils/spinner.js';

export async function executePostMortemCommand(
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
      if (options.planId) params.planId = options.planId;
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

      return listPostMortems(apiUrl, options.projectId, headers, params);
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for postmortem get');
      return getPostMortem(apiUrl, options.projectId, headers, options.id);
    }
    case 'create': {
      if (!options.title) throw new Error('--title is required for postmortem create');
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        options.content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, options.content);
      }
      if (!options.content) throw new Error('--content or --file is required for postmortem create');
      if (options.actionItems === undefined) throw new Error('--action-items is required for postmortem create');

      const body: Record<string, unknown> = {
        planId: options.planId,
        repositoryId: options.repositoryId ?? options.defaultRepositoryId,
        title: options.title,
        content: options.content,
        actionItems: splitCsv(options.actionItems),
        status: options.status,
      };

      return withSpinner(
        'Creating post-mortem...',
        async () => {
          try {
            return await createPostMortem(apiUrl, options.projectId, headers, body);
          } catch (error) {
            if (!isCreatedByRequiredValidationError(error)) {
              throw error;
            }

            const legacyCreatedBy = resolveLegacyCreatedBy(options);
            if (!legacyCreatedBy) {
              throw error;
            }

            return createPostMortem(apiUrl, options.projectId, headers, {
              ...body,
              createdBy: legacyCreatedBy,
            });
          }
        },
        'Post-mortem created',
      );
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for postmortem update');
      const body: Record<string, string | string[] | undefined> = {};

      if (Object.prototype.hasOwnProperty.call(options, 'planId')) {
        body.planId = options.planId;
      }
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
      if (options.actionItems !== undefined) body.actionItems = splitCsv(options.actionItems);
      if (options.status) body.status = options.status;

      return updatePostMortem(apiUrl, options.projectId, headers, options.id, body);
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for postmortem delete');
      await deletePostMortem(apiUrl, options.projectId, headers, options.id);
      return { message: `PostMortem ${options.id} deleted successfully` };
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
