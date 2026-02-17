import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import axios, { AxiosError } from 'axios';
import { executeCommand } from '../src/commands/index.js';
import { formatOutput } from '../src/utils/formatter.js';
import { handleError } from '../src/utils/errors.js';

const PROJECT_ID = 'project_1';
const API_URL = 'http://localhost:3001';

function authHeaders() {
  return {
    'X-API-Key': 'key_test123',
    'Content-Type': 'application/json',
  };
}

describe('CLI Integration Tests', () => {
  const originalEnv = process.env;
  let axiosGetSpy: jest.SpiedFunction<typeof axios.get>;
  let axiosPostSpy: jest.SpiedFunction<typeof axios.post>;
  let axiosPutSpy: jest.SpiedFunction<typeof axios.put>;
  let axiosDeleteSpy: jest.SpiedFunction<typeof axios.delete>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AGENTTEAMS_API_KEY: 'key_test123',
      AGENTTEAMS_API_URL: API_URL,
      AGENTTEAMS_TEAM_ID: 'team_1',
      AGENTTEAMS_PROJECT_ID: PROJECT_ID,
      AGENTTEAMS_AGENT_NAME: 'test-agent',
    };

    axiosGetSpy = jest.spyOn(axios, 'get');
    axiosPostSpy = jest.spyOn(axios, 'post');
    axiosPutSpy = jest.spyOn(axios, 'put');
    axiosDeleteSpy = jest.spyOn(axios, 'delete');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Commands', () => {
    it('init start: should complete OAuth flow with mocked callback', async () => {
      if (typeof (jest as any).unstable_mockModule !== 'function') {
        return;
      }

      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-init-success-'));
      const closeSpy = jest.fn();
      const callbackPayload = {
        teamId: 'team_1',
        projectId: PROJECT_ID,
        agentName: 'test-agent',
        apiKey: 'key_oauth_123',
        apiUrl: API_URL,
        configId: '7',
      };

      axiosGetSpy.mockResolvedValueOnce({
        data: {
          data: {
            fileName: 'convention.md',
            content: '# team convention\n- follow rules\n',
          },
        },
      } as any);
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'ag-1' }] } } as any)
        .mockResolvedValueOnce({ data: { data: { content: '# team convention\n- follow rules\n' } } } as any)
        .mockResolvedValueOnce({ data: { data: [] } } as any);

      const mockStartLocalAuthServer = jest.fn().mockReturnValue({
        server: {
          listening: true,
          close: closeSpy,
        } as any,
        waitForCallback: async () => callbackPayload,
        port: 7779,
      });

      if (typeof (jest as any).resetModules === 'function') {
        (jest as any).resetModules();
      }
      (jest as any).unstable_mockModule('axios', () => ({
        default: axios,
      }));
      (jest as any).unstable_mockModule('../src/utils/authServer.js', () => ({
        startLocalAuthServer: mockStartLocalAuthServer,
      }));
      (jest as any).unstable_mockModule('open', () => ({
        default: jest.fn().mockImplementation(async () => undefined),
      }));

      const { executeInitCommand } = await import('../src/commands/init.js');
      const result = await executeInitCommand({ cwd: tempCwd });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          authUrl: expect.stringContaining('/cli/authorize?port=7779'),
          configPath: join(tempCwd, '.agentteams', 'config.json'),
          conventionPath: join(tempCwd, '.agentteams', 'convention.md'),
          teamId: 'team_1',
          projectId: PROJECT_ID,
          agentName: 'test-agent',
        })
      );

      const savedConfig = JSON.parse(readFileSync(result.configPath, 'utf-8'));
      expect(savedConfig).toEqual({
        teamId: 'team_1',
        projectId: PROJECT_ID,
        agentName: 'test-agent',
        apiKey: 'key_oauth_123',
        apiUrl: API_URL,
      });

      const savedConvention = readFileSync(result.conventionPath, 'utf-8');
      expect(savedConvention).toBe('# team convention\n- follow rules\n');
      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/agent-configs/7/convention`,
        {
          headers: {
            'X-API-Key': 'key_oauth_123',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/agent-configs`,
        {
          headers: {
            'X-API-Key': 'key_oauth_123',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/conventions`,
        {
          headers: {
            'X-API-Key': 'key_oauth_123',
            'Content-Type': 'application/json',
          },
        }
      );

      rmSync(tempCwd, { recursive: true, force: true });
    });

    it('sync download: should download conventions by category', async () => {
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'ag-1' }] } } as any)
        .mockResolvedValueOnce({ data: { data: { content: '# reporting from sync\n' } } } as any)
        .mockResolvedValueOnce({
          data: {
            data: [
              { id: 'cv-1', title: 'Core Rules', category: 'rules' },
              { id: 'cv-2', title: 'API Rules', category: 'rules' },
            ],
          },
        } as any)
        .mockResolvedValueOnce({ data: '# core rules' } as any)
        .mockResolvedValueOnce({ data: '# api rules' } as any);

      const originalCwd = process.cwd();
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-sync-download-'));

      try {
        const agentteamsDir = join(tempCwd, '.agentteams');
        mkdirSync(agentteamsDir, { recursive: true });
        writeFileSync(
          join(agentteamsDir, 'config.json'),
          JSON.stringify(
            {
              teamId: 'team_1',
              projectId: PROJECT_ID,
              agentName: 'test-agent',
              apiKey: 'key_test123',
              apiUrl: API_URL,
            },
            null,
            2
          ) + '\n',
          'utf-8'
        );

        process.chdir(tempCwd);
        await executeCommand('sync', 'download', { cwd: tempCwd });

        const downloadedCore = readFileSync(join(agentteamsDir, 'rules', 'core-rules.md'), 'utf-8');
        const downloadedApi = readFileSync(join(agentteamsDir, 'rules', 'api-rules.md'), 'utf-8');
      const reporting = readFileSync(join(agentteamsDir, 'convention.md'), 'utf-8');
        expect(downloadedCore).toBe('# core rules');
        expect(downloadedApi).toBe('# api rules');
        expect(reporting).toBe('# reporting from sync\n');
      } finally {
        process.chdir(originalCwd);
        rmSync(tempCwd, { recursive: true, force: true });
      }
    });

    it('status report: should POST project-scoped path with required payload', async () => {
      axiosPostSpy.mockResolvedValue({ data: { data: { id: 's1' } } } as any);

      await executeCommand('status', 'report', {
        agent: 'test-agent',
        status: 'IN_PROGRESS',
        task: 'work in progress',
        issues: 'issue1, issue2',
        remaining: '',
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/agent-statuses`,
        {
          agent: 'test-agent',
          status: 'IN_PROGRESS',
          task: 'work in progress',
          issues: ['issue1', 'issue2'],
          remaining: [],
        },
        { headers: authHeaders() }
      );
    });

    it('status update: should PUT optional fields only', async () => {
      axiosPutSpy.mockResolvedValue({ data: { data: { id: 's1' } } } as any);

      await executeCommand('status', 'update', {
        id: 'status-uuid',
        status: 'BLOCKED',
        issues: 'api timeout,auth expired',
      });

      expect(axiosPutSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/agent-statuses/status-uuid`,
        {
          status: 'BLOCKED',
          issues: ['api timeout', 'auth expired'],
        },
        { headers: authHeaders() }
      );
    });

    it('status get/list/delete: should call project-scoped paths', async () => {
      axiosGetSpy.mockResolvedValue({ data: { data: [] } } as any);
      axiosDeleteSpy.mockResolvedValue({ data: { message: 'ok' } } as any);

      await executeCommand('status', 'list', {});
      await executeCommand('status', 'get', { id: 'status-1' });
      await executeCommand('status', 'delete', { id: 'status-2' });

      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        1,
        `${API_URL}/api/projects/${PROJECT_ID}/agent-statuses`,
        { headers: authHeaders() }
      );
      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        2,
        `${API_URL}/api/projects/${PROJECT_ID}/agent-statuses/status-1`,
        { headers: authHeaders() }
      );
      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/agent-statuses/status-2`,
        { headers: authHeaders() }
      );
    });

    it('plan CRUD/assign: should use project-scoped plan endpoints', async () => {
      axiosPostSpy.mockResolvedValue({ data: { data: { id: 't1' } } } as any);
      axiosGetSpy.mockResolvedValue({ data: { data: { id: 't1' } } } as any);
      axiosPutSpy.mockResolvedValue({ data: { data: { id: 't1' } } } as any);
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      await executeCommand('plan', 'create', {
        title: 'Plan 1',
        description: 'desc',
        priority: 'HIGH',
      });
      await executeCommand('plan', 'list', {});
      await executeCommand('plan', 'get', { id: 'plan-1' });
      await executeCommand('plan', 'update', { id: 'plan-1', status: 'IN_PROGRESS' });
      await executeCommand('plan', 'assign', { id: 'plan-1', agent: 'agent-a' });
      await executeCommand('plan', 'delete', { id: 'plan-1' });

      expect(axiosPostSpy).toHaveBeenNthCalledWith(
        1,
        `${API_URL}/api/projects/${PROJECT_ID}/plans`,
        expect.objectContaining({
          title: 'Plan 1',
          description: 'desc',
          priority: 'HIGH',
        }),
        { headers: authHeaders() }
      );
      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        1,
        `${API_URL}/api/projects/${PROJECT_ID}/plans`,
        { headers: authHeaders() }
      );
      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        2,
        `${API_URL}/api/projects/${PROJECT_ID}/plans/plan-1`,
        { headers: authHeaders() }
      );
      expect(axiosPutSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/plans/plan-1`,
        { status: 'IN_PROGRESS' },
        { headers: authHeaders() }
      );
      expect(axiosPostSpy).toHaveBeenNthCalledWith(
        2,
        `${API_URL}/api/projects/${PROJECT_ID}/plans/plan-1/assign`,
        { assignedTo: 'agent-a' },
        { headers: authHeaders() }
      );
      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/plans/plan-1`,
        { headers: authHeaders() }
      );
    });

    it('comment CRUD: should use project-scoped endpoints and required type', async () => {
      axiosGetSpy.mockResolvedValue({ data: { data: [] } } as any);
      axiosPostSpy.mockResolvedValue({ data: { data: { id: 'c1' } } } as any);
      axiosPutSpy.mockResolvedValue({ data: { data: { id: 'c1' } } } as any);
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      await executeCommand('comment', 'list', { planId: 'plan-1' });
      await executeCommand('comment', 'get', { id: 'comment-1' });
      await executeCommand('comment', 'create', {
        planId: 'plan-1',
        type: 'GENERAL',
        content: 'Test comment',
      });
      await executeCommand('comment', 'update', {
        id: 'comment-1',
        content: 'Updated',
      });
      await executeCommand('comment', 'delete', { id: 'comment-1' });

      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        1,
        `${API_URL}/api/projects/${PROJECT_ID}/plans/plan-1/comments`,
        { headers: authHeaders() }
      );
      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        2,
        `${API_URL}/api/projects/${PROJECT_ID}/comments/comment-1`,
        { headers: authHeaders() }
      );
      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/plans/plan-1/comments`,
        {
          type: 'GENERAL',
          content: 'Test comment',
        },
        { headers: authHeaders() }
      );
      expect(axiosPutSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/comments/comment-1`,
        { content: 'Updated' },
        { headers: authHeaders() }
      );
      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/comments/comment-1`,
        { headers: authHeaders() }
      );
    });

    it('dependency commands: should use project-scoped URL and blockingPlanId', async () => {
      axiosGetSpy.mockResolvedValue({ data: { data: { blocking: [], dependents: [] } } } as any);
      axiosPostSpy.mockResolvedValue({ data: { data: { id: 'dep-1' } } } as any);
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      const planId = '5cc7f9eb-f3f3-40af-9a1e-4f8ef2db2e65';
      const blockingPlanId = '255090be-80b0-4a5d-9bf0-0fd4d8c6616f';

      await executeCommand('dependency', 'list', { planId });
      await executeCommand('dependency', 'create', { planId, blockingPlanId });
      await executeCommand('dependency', 'delete', { planId, depId: 'dep-1' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/plans/${planId}/dependencies`,
        { headers: authHeaders() }
      );
      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/plans/${planId}/dependencies`,
        { blockingPlanId },
        { headers: authHeaders() }
      );
      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/plans/${planId}/dependencies/dep-1`,
        { headers: authHeaders() }
      );
      expect(axiosPostSpy.mock.calls[0]?.[0]).not.toContain('NaN');
    });

    it('convention list: should call project-scoped list endpoint', async () => {
      axiosGetSpy.mockResolvedValueOnce({ data: { data: [{ id: 'cv-1' }] } } as any);

      await executeCommand('convention', 'list', {});

      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/conventions`,
        { headers: authHeaders() }
      );
    });

    it('convention show: should fetch full markdown for all conventions', async () => {
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'cv-1', title: 'Core', category: 'rules' }] } } as any)
        .mockResolvedValueOnce({ data: '# full markdown' } as any);

      const result = await executeCommand('convention', 'show', {});

      expect(typeof result).toBe('string');
      expect(result).toContain('# Core');
      expect(result).toContain('category: rules');
      expect(result).toContain('id: cv-1');
      expect(result).toContain('# full markdown');
      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        1,
        `${API_URL}/api/projects/${PROJECT_ID}/conventions`,
        { headers: authHeaders() }
      );
      expect(axiosGetSpy).toHaveBeenNthCalledWith(
        2,
        `${API_URL}/api/projects/${PROJECT_ID}/conventions/cv-1/download`,
        { headers: authHeaders(), responseType: 'text' }
      );
    });

    it('convention download: should write convention files and update convention.md', async () => {
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'ag-1' }] } } as any)
        .mockResolvedValueOnce({ data: { data: { content: '# reporting template\n' } } } as any)
        .mockResolvedValueOnce({ data: { data: [{ id: 'cv-1', title: 'Core Rules', category: 'rules' }, { id: 'cv-2', title: 'API Rule', category: 'rules' }] } } as any)
        .mockResolvedValueOnce({ data: '# downloaded convention 1' } as any)
        .mockResolvedValueOnce({ data: '# downloaded convention 2' } as any);

      const originalCwd = process.cwd();
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-convention-update-'));

      try {
        const agentteamsDir = join(tempCwd, '.agentteams');
        mkdirSync(agentteamsDir, { recursive: true });

        writeFileSync(
          join(agentteamsDir, 'config.json'),
          JSON.stringify(
            {
              teamId: 'team_1',
              projectId: PROJECT_ID,
              agentName: 'test-agent',
              apiKey: 'key_test123',
              apiUrl: API_URL,
            },
            null,
            2
          ) + '\n',
          'utf-8'
        );
        writeFileSync(join(agentteamsDir, 'convention.md'), '# convention baseline\n', 'utf-8');

        process.chdir(tempCwd);
        await executeCommand('convention', 'download', {});

        const downloadedFile1 = readFileSync(join(agentteamsDir, 'rules', 'core-rules.md'), 'utf-8');
        const downloadedFile2 = readFileSync(join(agentteamsDir, 'rules', 'api-rule.md'), 'utf-8');
        const reportingContent = readFileSync(join(agentteamsDir, 'convention.md'), 'utf-8');

        expect(downloadedFile1).toBe('# downloaded convention 1');
        expect(downloadedFile2).toBe('# downloaded convention 2');
        expect(reportingContent).toBe('# reporting template\n');
      } finally {
        process.chdir(originalCwd);
        rmSync(tempCwd, { recursive: true, force: true });
      }
    });

    it('convention download: should throw when no .agentteams directory exists', async () => {
      const originalCwd = process.cwd();
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-convention-missing-'));

      try {
        process.chdir(tempCwd);
        await expect(executeCommand('convention', 'download', {})).rejects.toThrow(
          'No .agentteams directory found'
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempCwd, { recursive: true, force: true });
      }
    });

    it('convention download: should update reporting even when no project conventions', async () => {
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'ag-1' }] } } as any)
        .mockResolvedValueOnce({ data: { data: { content: '# reporting template only\n' } } } as any)
        .mockResolvedValueOnce({ data: { data: [] } } as any);

      const originalCwd = process.cwd();
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-convention-template-only-'));

      try {
        const agentteamsDir = join(tempCwd, '.agentteams');
        mkdirSync(agentteamsDir, { recursive: true });
        writeFileSync(
          join(agentteamsDir, 'config.json'),
          JSON.stringify(
            {
              teamId: 'team_1',
              projectId: PROJECT_ID,
              agentName: 'test-agent',
              apiKey: 'key_test123',
              apiUrl: API_URL,
            },
            null,
            2
          ) + '\n',
          'utf-8'
        );

        process.chdir(tempCwd);
        const result = await executeCommand('convention', 'download', {});
        const reporting = readFileSync(join(agentteamsDir, 'convention.md'), 'utf-8');

        expect(typeof result).toBe('string');
        expect(result).toContain('No project conventions found');
        expect(reporting).toBe('# reporting template only\n');
      } finally {
        process.chdir(originalCwd);
        rmSync(tempCwd, { recursive: true, force: true });
      }
    });

    it('convention download: should add numeric suffix for duplicated names', async () => {
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'ag-1' }] } } as any)
        .mockResolvedValueOnce({ data: { data: { content: '# reporting template\n' } } } as any)
        .mockResolvedValueOnce({ data: { data: [{ id: 'cv-1', title: 'Rules', category: 'rules' }, { id: 'cv-2', title: 'Rules', category: 'rules' }] } } as any)
        .mockResolvedValueOnce({ data: '# rules 1' } as any)
        .mockResolvedValueOnce({ data: '# rules 2' } as any);

      const originalCwd = process.cwd();
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-convention-duplicate-'));

      try {
        const agentteamsDir = join(tempCwd, '.agentteams');
        mkdirSync(agentteamsDir, { recursive: true });

        writeFileSync(
          join(agentteamsDir, 'config.json'),
          JSON.stringify(
            {
              teamId: 'team_1',
              projectId: PROJECT_ID,
              agentName: 'test-agent',
              apiKey: 'key_test123',
              apiUrl: API_URL,
            },
            null,
            2
          ) + '\n',
          'utf-8'
        );

        process.chdir(tempCwd);
        await executeCommand('convention', 'download', {});

        const file1 = readFileSync(join(agentteamsDir, 'rules', 'rules.md'), 'utf-8');
        const file2 = readFileSync(join(agentteamsDir, 'rules', 'rules-2.md'), 'utf-8');

        expect(file1).toBe('# rules 1');
        expect(file2).toBe('# rules 2');
      } finally {
        process.chdir(originalCwd);
        rmSync(tempCwd, { recursive: true, force: true });
      }
    });

    it('convention download: should cleanup existing conventions directory before writing', async () => {
      axiosGetSpy
        .mockResolvedValueOnce({ data: { data: [{ id: 'ag-1' }] } } as any)
        .mockResolvedValueOnce({ data: { data: { content: '# reporting template\n' } } } as any)
        .mockResolvedValueOnce({ data: { data: [{ id: 'cv-1', title: 'Rules', category: 'rules' }] } } as any)
        .mockResolvedValueOnce({ data: '# latest rules' } as any);

      const originalCwd = process.cwd();
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-convention-cleanup-'));

      try {
        const agentteamsDir = join(tempCwd, '.agentteams');
        const conventionDir = join(agentteamsDir, 'rules');
        mkdirSync(conventionDir, { recursive: true });

        writeFileSync(
          join(agentteamsDir, 'config.json'),
          JSON.stringify(
            {
              teamId: 'team_1',
              projectId: PROJECT_ID,
              agentName: 'test-agent',
              apiKey: 'key_test123',
              apiUrl: API_URL,
            },
            null,
            2
          ) + '\n',
          'utf-8'
        );

        writeFileSync(join(conventionDir, 'stale.md'), '# stale', 'utf-8');

        process.chdir(tempCwd);
        await executeCommand('convention', 'download', {});

        expect(existsSync(join(conventionDir, 'stale.md'))).toBe(false);
        const downloaded = readFileSync(join(conventionDir, 'rules.md'), 'utf-8');
        expect(downloaded).toBe('# latest rules');
      } finally {
        process.chdir(originalCwd);
        rmSync(tempCwd, { recursive: true, force: true });
      }
    });

    it('report command: should remain project-scoped completion report path', async () => {
      axiosGetSpy.mockResolvedValue({ data: { data: [] } } as any);
      axiosPostSpy.mockResolvedValue({ data: { data: { id: 'r1' } } } as any);

      await executeCommand('report', 'list', {});
      await executeCommand('report', 'create', {
        title: 'Test report',
        content: '# Report',
      });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/completion-reports`,
        { headers: authHeaders() }
      );
      expect(axiosPostSpy).toHaveBeenCalledWith(
        `${API_URL}/api/projects/${PROJECT_ID}/completion-reports`,
        expect.objectContaining({
          title: 'Test report',
          content: '# Report',
          reportType: 'IMPL_PLAN',
          status: 'COMPLETED',
          createdBy: 'test-agent',
        }),
        { headers: authHeaders() }
      );
    });

    it('config whoami: should display current API key info', async () => {
      const result = await executeCommand('config', 'whoami', {});

      expect(result).toEqual({
        apiKey: 'key_test123',
        apiUrl: API_URL,
      });
    });

    it('should validate required options for updated contracts', async () => {
      await expect(executeCommand('status', 'report', { status: 'IN_PROGRESS' })).rejects.toThrow(
        '--task is required for status report'
      );
      await expect(
        executeCommand('plan', 'create', { title: 'no desc' })
      ).rejects.toThrow('--description is required for plan create');
      await expect(
        executeCommand('comment', 'create', { planId: 'plan-1', content: 'x' })
      ).rejects.toThrow('--type is required for comment create');
      await expect(
        executeCommand('dependency', 'create', { planId: 'plan-1' })
      ).rejects.toThrow('--blocking-plan-id is required for dependency create');
      await expect(executeCommand('convention', 'append', {})).rejects.toThrow(
        'Unknown convention action: append. Use list, show, or download.'
      );
      await expect(executeCommand('sync', 'list', {})).rejects.toThrow(
        'Unknown sync action: list. Use download.'
      );
    });

    it('CLI definitions: should include new options and remove legacy options', () => {
      const cliIndex = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf-8');

      expect(cliIndex).toContain("--task <text>");
      expect(cliIndex).toContain("--issues <csv>");
      expect(cliIndex).toContain("--remaining <csv>");
      expect(cliIndex).toContain("--type <type>");
      expect(cliIndex).toContain("--blocking-plan-id <id>");
      expect(cliIndex).toContain(".command('sync')");
      expect(cliIndex).not.toContain("Action to perform (download)");

      expect(cliIndex).not.toContain("--metadata <json>");
      expect(cliIndex).not.toContain("--author-id <id>");
      expect(cliIndex).not.toContain("--depends-on <id>");
      expect(cliIndex).toContain("IN_PROGRESS, DONE, BLOCKED");
    });

    it('should throw for unknown resource command', async () => {
      await expect(executeCommand('unknown', 'list', {})).rejects.toThrow(
        'Unknown resource: unknown'
      );
    });
  });

  describe('Output Formatting', () => {
    it('should output JSON by default', () => {
      const data = { id: 1, name: 'test' };
      const output = formatOutput(data, 'json');

      expect(output).toBe(JSON.stringify(data, null, 2));
    });

    it('should output human-friendly text with --format text', () => {
      const data = {
        data: [
          { id: 1, agentName: 'agent1', status: 'IN_PROGRESS' },
          { id: 2, agentName: 'agent2', status: 'DONE' },
        ],
      };

      const output = formatOutput(data, 'text');

      expect(output).toContain('agent1');
      expect(output).toContain('IN_PROGRESS');
      expect(output).toContain('agent2');
      expect(output).toContain('DONE');
    });
  });

  describe('Error Handling', () => {
    it('401: should display "Invalid API key" message', () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
        isAxiosError: true,
        message: 'Request failed with status code 401',
      } as AxiosError;

      const errorMessage = handleError(error);
      expect(errorMessage).toContain('Invalid API key');
    });

    it('403: should display "Cross-project access denied" message', () => {
      const error = {
        response: {
          status: 403,
          data: { message: 'Forbidden' },
        },
        isAxiosError: true,
        message: 'Request failed with status code 403',
      } as AxiosError;

      const errorMessage = handleError(error);
      expect(errorMessage).toContain('Cross-project access denied');
    });

    it('Network error: should display "Cannot connect" message', () => {
      const error = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
        isAxiosError: true,
      } as AxiosError;

      const errorMessage = handleError(error);
      expect(errorMessage).toContain('Cannot connect to server');
    });

    it('404: should display resource not found message', () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Not Found' },
        },
        isAxiosError: true,
        message: 'Request failed with status code 404',
      } as AxiosError;

      const errorMessage = handleError(error);
      expect(errorMessage).toContain('Resource not found');
    });

    it('500: should display server error message', () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' },
        },
        isAxiosError: true,
        message: 'Request failed with status code 500',
      } as AxiosError;

      const errorMessage = handleError(error);
      expect(errorMessage).toContain('Server error');
    });
  });
});
