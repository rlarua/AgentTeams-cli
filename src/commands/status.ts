import { deleteStatus, getStatus, listStatuses, reportStatus, updateStatus } from '../api/status.js';
import { splitCsv, toPositiveInteger } from '../utils/parsers.js';

export async function executeStatusCommand(
  apiUrl: string,
  projectId: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'report': {
      if (!options.status) throw new Error('--status is required for status report');
      if (!options.task) throw new Error('--task is required for status report');
      if (options.issues === undefined) throw new Error('--issues is required for status report');
      if (options.remaining === undefined) throw new Error('--remaining is required for status report');

      return reportStatus(apiUrl, projectId, headers, {
        agent: options.agent,
        status: options.status,
        task: options.task,
        issues: splitCsv(options.issues),
        remaining: splitCsv(options.remaining),
      });
    }
    case 'list': {
      const params: Record<string, number> = {};
      const page = toPositiveInteger(options.page);
      const pageSize = toPositiveInteger(options.pageSize);

      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      return listStatuses(apiUrl, projectId, headers, params);
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for status get');
      return getStatus(apiUrl, projectId, headers, options.id);
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for status update');
      const body: Record<string, unknown> = {};
      if (options.status !== undefined) body.status = options.status;
      if (options.task !== undefined) body.task = options.task;
      if (options.issues !== undefined) body.issues = splitCsv(options.issues);
      if (options.remaining !== undefined) body.remaining = splitCsv(options.remaining);

      return updateStatus(apiUrl, projectId, headers, options.id, body);
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for status delete');
      return deleteStatus(apiUrl, projectId, headers, options.id);
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
