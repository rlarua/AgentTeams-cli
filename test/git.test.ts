import { describe, it, expect } from '@jest/globals';
import { collectGitMetrics } from '../src/utils/git.js';

describe('Git Metrics Utility', () => {
  it('collects commit hash, branch, and shortstat metrics', () => {
    const metrics = collectGitMetrics((cmd, args) => {
      if (cmd !== 'git') {
        throw new Error('unexpected command');
      }

      const serializedArgs = Array.isArray(args) ? args.join(' ') : '';
      if (serializedArgs === 'rev-parse HEAD') return 'abc123\n';
      if (serializedArgs === 'branch --show-current') return 'feature/report-metrics\n';
      if (serializedArgs === 'diff --shortstat HEAD~1') {
        return ' 3 files changed, 15 insertions(+), 4 deletions(-)\n';
      }

      throw new Error(`unexpected args: ${serializedArgs}`);
    });

    expect(metrics).toEqual({
      commitHash: 'abc123',
      branchName: 'feature/report-metrics',
      filesModified: 3,
      linesAdded: 15,
      linesDeleted: 4,
    });
  });

  it('returns empty metrics when git is unavailable', () => {
    const metrics = collectGitMetrics(() => {
      throw new Error('git not found');
    });

    expect(metrics).toEqual({
      commitHash: undefined,
      branchName: undefined,
      filesModified: undefined,
      linesAdded: undefined,
      linesDeleted: undefined,
    });
  });

  it('keeps hash/branch even when shortstat command fails', () => {
    const metrics = collectGitMetrics((cmd, args) => {
      if (cmd !== 'git') {
        throw new Error('unexpected command');
      }

      const serializedArgs = Array.isArray(args) ? args.join(' ') : '';
      if (serializedArgs === 'rev-parse HEAD') return 'def456\n';
      if (serializedArgs === 'branch --show-current') return 'main\n';
      if (serializedArgs === 'diff --shortstat HEAD~1') {
        throw new Error('no previous commit');
      }

      throw new Error(`unexpected args: ${serializedArgs}`);
    });

    expect(metrics).toEqual({
      commitHash: 'def456',
      branchName: 'main',
      filesModified: undefined,
      linesAdded: undefined,
      linesDeleted: undefined,
    });
  });
});
