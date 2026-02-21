import { describe, it, expect } from '@jest/globals';
import { createSummaryLines, shouldPrintSummary } from '../src/utils/outputPolicy.js';

describe('outputPolicy', () => {
  it('prints summary by default for plan create', () => {
    expect(
      shouldPrintSummary({
        resource: 'plan',
        action: 'create',
        format: 'json',
        formatExplicit: false,
      })
    ).toBe(true);
  });

  it('keeps full output for plan list by default', () => {
    expect(
      shouldPrintSummary({
        resource: 'plan',
        action: 'list',
        format: 'json',
        formatExplicit: false,
      })
    ).toBe(false);
  });

  it('keeps full output when json format is explicitly requested', () => {
    expect(
      shouldPrintSummary({
        resource: 'plan',
        action: 'update',
        format: 'json',
        formatExplicit: true,
      })
    ).toBe(false);
  });

  it('forces full output when verbose is enabled', () => {
    expect(
      shouldPrintSummary({
        resource: 'plan',
        action: 'update',
        format: 'text',
        formatExplicit: false,
        verbose: true,
      })
    ).toBe(false);
  });

  it('prints summary when output-file is used', () => {
    expect(
      shouldPrintSummary({
        resource: 'plan',
        action: 'update',
        format: 'json',
        formatExplicit: true,
        outputFile: './tmp/out.json',
      })
    ).toBe(true);
  });

  it('creates summary lines with message and id/title', () => {
    const lines = createSummaryLines(
      {
        data: {
          id: 'plan-123',
          title: 'CLI output fix',
        },
      },
      { resource: 'plan', action: 'create' }
    );

    expect(lines).toEqual([
      'Success: plan create',
      'id: plan-123, title: CLI output fix',
      'Next: agentteams plan start --id plan-123',
    ]);
  });

  it('uses message when available', () => {
    const lines = createSummaryLines(
      {
        message: 'Plan downloaded',
        filePath: '.agentteams/active-plan/a.md',
      },
      { resource: 'plan', action: 'download' }
    );

    expect(lines[0]).toBe('Plan downloaded');
  });

  it('creates next action hint for plan start', () => {
    const lines = createSummaryLines(
      {
        data: {
          id: 'plan-456',
          title: 'Started plan',
        },
      },
      { resource: 'plan', action: 'start' }
    );

    expect(lines).toContain('Next: agentteams plan download --id plan-456');
  });

  it('creates next action hint for plan finish', () => {
    const lines = createSummaryLines(
      {
        data: {
          id: 'plan-789',
          title: 'Finished plan',
        },
      },
      { resource: 'plan', action: 'finish' }
    );

    expect(lines).toContain('Next: agentteams report create --plan-id plan-789');
  });
});
