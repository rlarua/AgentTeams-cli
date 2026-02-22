import { describe, it, expect } from '@jest/globals';
import { buildFreshnessNoticeLines } from '../src/commands/plan.js';


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
