import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createReport, deleteReport, getReport, listReports, updateReport } from '../api/report.js';
import { collectGitMetrics } from '../utils/git.js';
import { findProjectConfig } from '../utils/config.js';
import { isCreatedByRequiredValidationError, resolveLegacyCreatedBy } from '../utils/legacyCompat.js';
import { toNonEmptyString, toNonNegativeInteger, toPositiveInteger, toSafeFileName } from '../utils/parsers.js';
import { printFileInfo, withSpinner } from '../utils/spinner.js';

function toDetailsAsMarkdown(details: unknown): string | undefined {
  if (typeof details !== 'string' || details.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(details) as unknown;
    return `\n\n## Details\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
  } catch {
    return `\n\n## Details\n\n${details}\n`;
  }
}

function minimalCompletionReportTemplate(): string {
  return [
    '## Summary',
    '- What changed and why',
    '',
    '## Verification',
    '- typecheck: ...',
    '- tests: ...',
    '',
    '## Notes',
    '- risks / follow-ups',
    '',
    '## Conventions Referenced',
    '- `.agentteams/rules/...`  # list conventions you referenced during this work',
    '',
  ].join('\n');
}

function resolveReportTemplate(template: unknown): string | undefined {
  if (template === undefined || template === null) return undefined;
  const value = String(template).trim();
  if (value.length === 0) return undefined;

  if (value === 'minimal') return minimalCompletionReportTemplate();

  throw new Error(`Unsupported template: ${value}. Only 'minimal' is supported.`);
}

export async function executeReportCommand(
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

      return listReports(apiUrl, options.projectId, headers, params);
    }
    case 'get': {
      if (!options.id) throw new Error('--id is required for report get');
      return getReport(apiUrl, options.projectId, headers, options.id);
    }
    case 'create': {
      const title = (options.title ?? options.summary) as string | undefined;
      if (!title || title.trim().length === 0) {
        throw new Error('--title is required for report create (or use --summary)');
      }

      const rawContent = options.content as string | undefined;
      let content = rawContent
        ?? toDetailsAsMarkdown(options.details)
        ?? resolveReportTemplate(options.template);
      if (options.file) {
        const filePath = resolve(options.file);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${options.file}`);
        }
        content = readFileSync(filePath, 'utf-8');
        printFileInfo(options.file, content);
      }
      if (!content || content.trim().length === 0) {
        throw new Error('--content, --file, or --template is required for report create.');
      }

      const status = (options.status as string | undefined) ?? 'COMPLETED';

      const autoGitMetrics = options.git === false ? {} : collectGitMetrics();

      const commitHash = toNonEmptyString(options.commitHash) ?? autoGitMetrics.commitHash;
      const branchName = toNonEmptyString(options.branchName) ?? autoGitMetrics.branchName;
      const filesModified = toNonNegativeInteger(options.filesModified) ?? autoGitMetrics.filesModified;
      const linesAdded = toNonNegativeInteger(options.linesAdded) ?? autoGitMetrics.linesAdded;
      const linesDeleted = toNonNegativeInteger(options.linesDeleted) ?? autoGitMetrics.linesDeleted;
      const durationSeconds = toNonNegativeInteger(options.durationSeconds);
      const commitStart = toNonEmptyString(options.commitStart);
      const commitEnd = toNonEmptyString(options.commitEnd);
      const pullRequestId = toNonEmptyString(options.pullRequestId);
      const qualityScore = toNonNegativeInteger(options.qualityScore);

      const body: Record<string, unknown> = {
        planId: options.planId,
        repositoryId: options.repositoryId ?? options.defaultRepositoryId,
        title,
        content,
        status,
      };

      if (commitHash !== undefined) body.commitHash = commitHash;
      if (branchName !== undefined) body.branchName = branchName;
      if (filesModified !== undefined) body.filesModified = filesModified;
      if (linesAdded !== undefined) body.linesAdded = linesAdded;
      if (linesDeleted !== undefined) body.linesDeleted = linesDeleted;
      if (durationSeconds !== undefined) body.durationSeconds = durationSeconds;
      if (commitStart !== undefined) body.commitStart = commitStart;
      if (commitEnd !== undefined) body.commitEnd = commitEnd;
      if (pullRequestId !== undefined) body.pullRequestId = pullRequestId;
      if (qualityScore !== undefined) body.qualityScore = qualityScore;

      if (body.planId && durationSeconds === undefined) {
        process.stderr.write('[info] durationSeconds is omitted; server will auto-calculate from linked plan timing when available.\n');
      }

      return withSpinner(
        'Creating report...',
        async () => {
          try {
            return await createReport(apiUrl, options.projectId, headers, body);
          } catch (error) {
            if (!isCreatedByRequiredValidationError(error)) {
              throw error;
            }

            const legacyCreatedBy = resolveLegacyCreatedBy(options);
            if (!legacyCreatedBy) {
              throw error;
            }

            return createReport(apiUrl, options.projectId, headers, {
              ...body,
              createdBy: legacyCreatedBy,
            });
          }
        },
        'Report created',
      );
    }
    case 'update': {
      if (!options.id) throw new Error('--id is required for report update');
      const body: Record<string, string | number> = {};

      if (options.title ?? options.summary) body.title = options.title ?? options.summary;
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

      const commitHash = toNonEmptyString(options.commitHash);
      const branchName = toNonEmptyString(options.branchName);
      const filesModified = toNonNegativeInteger(options.filesModified);
      const linesAdded = toNonNegativeInteger(options.linesAdded);
      const linesDeleted = toNonNegativeInteger(options.linesDeleted);
      const durationSeconds = toNonNegativeInteger(options.durationSeconds);
      const commitStart = toNonEmptyString(options.commitStart);
      const commitEnd = toNonEmptyString(options.commitEnd);
      const pullRequestId = toNonEmptyString(options.pullRequestId);
      const qualityScore = toNonNegativeInteger(options.qualityScore);

      if (commitHash !== undefined) body.commitHash = commitHash;
      if (branchName !== undefined) body.branchName = branchName;
      if (filesModified !== undefined) body.filesModified = filesModified;
      if (linesAdded !== undefined) body.linesAdded = linesAdded;
      if (linesDeleted !== undefined) body.linesDeleted = linesDeleted;
      if (durationSeconds !== undefined) body.durationSeconds = durationSeconds;
      if (commitStart !== undefined) body.commitStart = commitStart;
      if (commitEnd !== undefined) body.commitEnd = commitEnd;
      if (pullRequestId !== undefined) body.pullRequestId = pullRequestId;
      if (qualityScore !== undefined) body.qualityScore = qualityScore;

      return updateReport(apiUrl, options.projectId, headers, options.id, body);
    }
    case 'delete': {
      if (!options.id) throw new Error('--id is required for report delete');
      await deleteReport(apiUrl, options.projectId, headers, options.id);
      return { message: `Report ${options.id} deleted successfully` };
    }
    case 'download': {
      if (!options.id) throw new Error('--id is required for report download');
      const projectRoot = (() => {
        const configPath = findProjectConfig(process.cwd());
        if (!configPath) return null;
        return resolve(configPath, '..', '..');
      })();
      if (!projectRoot) {
        throw new Error("Project root not found. Run 'agentteams init' first.");
      }

      return withSpinner(
        'Downloading report...',
        async () => {
          const response = await getReport(apiUrl, options.projectId, headers, options.id);
          const report = response.data;

          const downloadDir = join(projectRoot, '.agentteams', 'active-plan');
          if (!existsSync(downloadDir)) {
            mkdirSync(downloadDir, { recursive: true });
          }

          const existingFiles = readdirSync(downloadDir).filter((name) => name.endsWith('.md'));
          const idPrefix = report.id.slice(0, 8);
          const safeName = toSafeFileName(report.title) || 'report';
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
            `reportId: ${report.id}`,
            `title: ${report.title}`,
            `status: ${report.status}`,
            report.planId ? `planId: ${report.planId}` : null,
            report.planTitle ? `planTitle: ${report.planTitle}` : null,
            `downloadedAt: ${new Date().toISOString()}`,
            '---',
          ].filter(Boolean).join('\n');

          const content = report.content ?? '';
          writeFileSync(filePath, `${frontmatter}\n\n${content}`, 'utf-8');

          return {
            message: `Report downloaded to ${fileName}`,
            filePath: `.agentteams/active-plan/${fileName}`,
          };
        },
        'Report downloaded',
      );
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
