import { describe, it, expect } from '@jest/globals';
import { buildFreshnessNoticeLines, buildUniquePlanRunbookFileName } from '../src/commands/plan.js';


describe('buildFreshnessNoticeLines', () => {
  it('includes platform guide change and convention changes', () => {
    const lines = buildFreshnessNoticeLines({
      platformGuidesChanged: true,
      conventionChanges: [
        { id: 'c1', type: 'updated', title: 'conventions' },
      ],
    });

    expect(lines).toEqual([
      '⚠ Updated conventions found:',
      '  - platform guides (shared)',
      '  - updated: conventions',
    ]);
  });

  it('prints only changed conventions when platform guides are unchanged', () => {
    const lines = buildFreshnessNoticeLines({
      platformGuidesChanged: false,
      conventionChanges: [
        { id: 'c2', type: 'new', fileName: 'testing.md' },
      ],
    });

    expect(lines).toEqual([
      '⚠ Updated conventions found:',
      '  - new: testing.md',
    ]);
  });
});

describe('buildUniquePlanRunbookFileName', () => {
  it('replaces spaces with hyphens in runbook filename', () => {
    const fileName = buildUniquePlanRunbookFileName('My Plan Title', []);
    expect(fileName).toBe('my-plan-title.md');
  });

  it('adds numeric suffix when filename already exists', () => {
    const fileName = buildUniquePlanRunbookFileName('My Plan Title', ['my-plan-title.md', 'my-plan-title-2.md']);
    expect(fileName).toBe('my-plan-title-3.md');
  });

  it('avoids collisions for non-ascii-only titles by suffixing fallback name', () => {
    const fileName = buildUniquePlanRunbookFileName('플랜 제목', ['plan.md']);
    expect(fileName).toBe('plan-2.md');
  });
});
