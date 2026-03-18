import { createLinearComment, getLinearIssue } from '../api/linear.js';

export async function executeLinearCommand(
  apiUrl: string,
  headers: any,
  action: string,
  options: any
): Promise<any> {
  switch (action) {
    case 'issue-get': {
      if (!options.issueId) {
        throw new Error('--issue-id is required for linear issue get');
      }

      return getLinearIssue(apiUrl, headers, options.issueId);
    }
    case 'comment-create': {
      if (!options.issueId) {
        throw new Error('--issue-id is required for linear comment create');
      }
      if (!options.body) {
        throw new Error('--body is required for linear comment create');
      }

      return createLinearComment(apiUrl, headers, options.issueId, options.body);
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
