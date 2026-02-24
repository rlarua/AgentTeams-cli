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
  const planId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('includes planId prefix in runbook filename', () => {
    const fileName = buildUniquePlanRunbookFileName('My Plan Title', planId, []);
    expect(fileName).toBe('my-plan-title-a1b2c3d4.md');
  });

  it('adds numeric suffix when filename already exists', () => {
    const fileName = buildUniquePlanRunbookFileName('My Plan Title', planId, ['my-plan-title-a1b2c3d4.md']);
    expect(fileName).toBe('my-plan-title-a1b2c3d4-2.md');
  });

  it('uses planId prefix for non-ascii-only titles', () => {
    const fileName = buildUniquePlanRunbookFileName('플랜 제목', planId, []);
    expect(fileName).toBe('plan-a1b2c3d4.md');
  });

  it('different planIds produce different filenames for same title', () => {
    const id1 = 'aaaaaaaa-1111-2222-3333-444444444444';
    const id2 = 'bbbbbbbb-1111-2222-3333-444444444444';
    const f1 = buildUniquePlanRunbookFileName('플랜', id1, []);
    const f2 = buildUniquePlanRunbookFileName('플랜', id2, []);
    expect(f1).toBe('plan-aaaaaaaa.md');
    expect(f2).toBe('plan-bbbbbbbb.md');
    expect(f1).not.toBe(f2);
  });
});
