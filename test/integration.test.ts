import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import axios from 'axios';
import { executeCommand } from '../src/commands/index.js';
import { formatOutput } from '../src/utils/formatter.js';
import { handleError } from '../src/utils/errors.js';
import { AxiosError } from 'axios';

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
      AGENTTEAMS_API_URL: 'http://localhost:3001',
      AGENTTEAMS_TEAM_ID: 'team_1',
      AGENTTEAMS_PROJECT_ID: 'project_1',
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
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-init-success-'));
      const closeSpy = jest.fn();
      const callbackPayload = {
        teamId: 'team_1',
        projectId: 'project_1',
        agentName: 'test-agent',
        apiKey: 'key_oauth_123',
        apiUrl: 'http://localhost:3001',
        configId: 7,
        convention: {
          fileName: 'convention.md',
          content: '# team convention\n- follow rules\n',
        },
      };

      const mockStartLocalAuthServer = jest.fn().mockReturnValue({
        server: {
          listening: true,
          close: closeSpy,
        } as any,
        waitForCallback: async () => callbackPayload,
        port: 7779,
      });

      (jest as any).resetModules();
      (jest as any).unstable_mockModule('../src/utils/authServer.js', () => ({
        startLocalAuthServer: mockStartLocalAuthServer,
      }));
      (jest as any).unstable_mockModule('open', () => ({
        default: jest.fn().mockImplementation(async () => undefined),
      }));

      const { executeInitCommand } = await import('../src/commands/init.js');

      const result = await executeInitCommand({ cwd: tempCwd });

      expect(result).toEqual({
        success: true,
        authUrl: 'http://localhost:3000/cli/authorize?port=7779',
        configPath: join(tempCwd, '.agentteams', 'config.json'),
        conventionPath: join(tempCwd, '.agentteams', 'convention.md'),
        teamId: 'team_1',
        projectId: 'project_1',
        agentName: 'test-agent',
      });

      const savedConfig = JSON.parse(readFileSync(result.configPath, 'utf-8'));
      expect(savedConfig).toEqual({
        teamId: 'team_1',
        projectId: 'project_1',
        agentName: 'test-agent',
        apiKey: 'key_oauth_123',
        apiUrl: 'http://localhost:3001',
      });

      const savedConvention = readFileSync(result.conventionPath, 'utf-8');
      expect(savedConvention).toBe('# team convention\n- follow rules\n');

      rmSync(tempCwd, { recursive: true, force: true });
    });

    it('init start: should close mocked OAuth server on callback failure', async () => {
      const tempCwd = mkdtempSync(join(tmpdir(), 'agentteams-init-failure-'));
      const closeSpy = jest.fn();

      const mockStartLocalAuthServer = jest.fn().mockReturnValue({
        server: {
          listening: true,
          close: closeSpy,
        } as any,
        waitForCallback: async () => {
          throw new Error('callback failed');
        },
        port: 7778,
      });

      (jest as any).resetModules();
      (jest as any).unstable_mockModule('../src/utils/authServer.js', () => ({
        startLocalAuthServer: mockStartLocalAuthServer,
      }));
      (jest as any).unstable_mockModule('open', () => ({
        default: jest.fn().mockImplementation(async () => undefined),
      }));

      const { executeInitCommand } = await import('../src/commands/init.js');

      await expect(
        executeInitCommand({ cwd: tempCwd })
      ).rejects.toThrow('Initialization failed: callback failed');

      expect(closeSpy).toHaveBeenCalledTimes(1);
      rmSync(tempCwd, { recursive: true, force: true });
    });

    it('status report: should POST /agent-statuses', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            agentName: 'test-agent',
            status: 'ACTIVE',
          },
        },
      };

      axiosPostSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('status', 'report', {
        agentName: 'test-agent',
        status: 'ACTIVE',
        projectId: 1,
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://localhost:3001/agent-statuses',
        expect.objectContaining({
          agentName: 'test-agent',
          status: 'ACTIVE',
          projectId: 1,
        }),
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('status get: should GET /agent-statuses/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, agentName: 'agent1', status: 'IN_PROGRESS' },
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('status', 'get', { id: '1' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/agent-statuses/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('status update: should PUT /agent-statuses/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, status: 'COMPLETED' },
        },
      };

      axiosPutSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('status', 'update', {
        id: '1',
        agentName: 'test-agent',
        status: 'COMPLETED',
        metadata: { done: true },
      });

      expect(axiosPutSpy).toHaveBeenCalledWith(
        'http://localhost:3001/agent-statuses/1',
        expect.objectContaining({
          agentName: 'test-agent',
          status: 'COMPLETED',
          metadata: { done: true },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('status delete: should DELETE /agent-statuses/:id', async () => {
      const mockResponse = {
        data: { message: 'deleted' },
      };

      axiosDeleteSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('status', 'delete', { id: '1' });

      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        'http://localhost:3001/agent-statuses/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('status list: should GET /agent-statuses', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 1, agentName: 'agent1', status: 'ACTIVE' },
            { id: 2, agentName: 'agent2', status: 'IDLE' },
          ],
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('status', 'list', {});

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/agent-statuses',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('task create: should POST /tasks', async () => {
      const mockResponse = {
        data: {
          data: { id: 3, title: 'Task 3', status: 'PENDING' },
        },
      };

      axiosPostSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('task', 'create', {
        title: 'Task 3',
        description: 'Task description',
        status: 'PENDING',
        priority: 'HIGH',
        planId: 'plan-1',
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks',
        expect.objectContaining({
          title: 'Task 3',
          description: 'Task description',
          status: 'PENDING',
          priority: 'HIGH',
          planId: 'plan-1',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('task update: should PUT /tasks/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, title: 'Task 1 updated', status: 'IN_PROGRESS' },
        },
      };

      axiosPutSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('task', 'update', {
        id: '1',
        title: 'Task 1 updated',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
      });

      expect(axiosPutSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks/1',
        expect.objectContaining({
          title: 'Task 1 updated',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('task delete: should DELETE /tasks/:id', async () => {
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      const result = await executeCommand('task', 'delete', { id: '1' });

      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual({ message: 'Task 1 deleted successfully' });
    });

    it('task assign: should POST /tasks/:id/assign', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, assignedTo: 'agent-1' },
        },
      };

      axiosPostSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('task', 'assign', {
        id: '1',
        agent: 'agent-1',
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks/1/assign',
        { assignedTo: 'agent-1' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('comment list: should GET /tasks/:taskId/comments', async () => {
      const mockResponse = {
        data: {
          data: [{ id: 1, content: 'Hello' }],
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('comment', 'list', { taskId: '1' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks/1/comments',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('comment get: should GET /comments/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, content: 'Hello' },
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('comment', 'get', { id: '1' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/comments/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('task list: should GET /tasks', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 1, title: 'Task 1', status: 'TODO' },
            { id: 2, title: 'Task 2', status: 'IN_PROGRESS' },
          ],
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('task', 'list', {});

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('comment update: should PUT /comments/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, content: 'Updated comment' },
        },
      };

      axiosPutSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('comment', 'update', {
        id: '1',
        content: 'Updated comment',
      });

      expect(axiosPutSpy).toHaveBeenCalledWith(
        'http://localhost:3001/comments/1',
        { content: 'Updated comment' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('comment delete: should DELETE /comments/:id', async () => {
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      const result = await executeCommand('comment', 'delete', { id: '1' });

      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        'http://localhost:3001/comments/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual({ message: 'Comment 1 deleted successfully' });
    });

    it('report list: should GET /completion-reports', async () => {
      const mockResponse = {
        data: {
          data: [{ id: 1, summary: 'report' }],
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('report', 'list', {});

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/completion-reports',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('report get: should GET /completion-reports/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, summary: 'report' },
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('report', 'get', { id: '1' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/completion-reports/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('task get: should GET /tasks/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, title: 'Task 1', status: 'TODO' },
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('task', 'get', { id: '1' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('report update: should PUT /completion-reports/:id', async () => {
      const mockResponse = {
        data: {
          data: { id: 1, summary: 'Updated summary' },
        },
      };

      axiosPutSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('report', 'update', {
        id: '1',
        summary: 'Updated summary',
        details: { done: true },
      });

      expect(axiosPutSpy).toHaveBeenCalledWith(
        'http://localhost:3001/completion-reports/1',
        expect.objectContaining({
          summary: 'Updated summary',
          details: { done: true },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('report delete: should DELETE /completion-reports/:id', async () => {
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      const result = await executeCommand('report', 'delete', { id: '1' });

      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        'http://localhost:3001/completion-reports/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual({ message: 'Report 1 deleted successfully' });
    });

    it('agent-config list: should GET project-scoped agent configs', async () => {
      const mockResponse = {
        data: {
          data: [{ id: 1, name: 'agent-a' }],
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('agent-config', 'list', {});

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/api/projects/project_1/agent-configs',
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('agent-config get: should GET project-scoped agent config by id', async () => {
      const mockResponse = {
        data: {
          data: { id: 3, name: 'agent-b' },
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('agent-config', 'get', { id: '3' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/api/projects/project_1/agent-configs/3',
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('agent-config delete: should DELETE project-scoped agent config by id', async () => {
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      const result = await executeCommand('agent-config', 'delete', { id: '7' });

      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        'http://localhost:3001/api/projects/project_1/agent-configs/7',
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual({ message: 'Agent config 7 deleted successfully.' });
    });

    it('dependency list: should GET /api/tasks/:taskId/dependencies', async () => {
      const mockResponse = {
        data: {
          data: { blocking: [], blockedBy: [] },
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('dependency', 'list', { taskId: '5' });

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/api/tasks/5/dependencies',
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('dependency create: should POST /api/tasks/:taskId/dependencies', async () => {
      const mockResponse = {
        data: {
          data: { id: 11, taskId: 5, dependsOnId: 2 },
        },
      };

      axiosPostSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('dependency', 'create', {
        taskId: '5',
        dependsOn: '2',
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://localhost:3001/api/tasks/5/dependencies',
        { dependsOnId: 2 },
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('dependency delete: should DELETE /api/tasks/:taskId/dependencies/:depId', async () => {
      axiosDeleteSpy.mockResolvedValue({ status: 204 } as any);

      const result = await executeCommand('dependency', 'delete', {
        taskId: '5',
        depId: '11',
      });

      expect(axiosDeleteSpy).toHaveBeenCalledWith(
        'http://localhost:3001/api/tasks/5/dependencies/11',
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual({ message: 'Dependency 11 deleted from task 5.' });
    });

    it('comment create: should POST /tasks/:tid/comments', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            taskId: 1,
            content: 'Test comment',
          },
        },
      };

      axiosPostSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('comment', 'create', {
        taskId: '1',
        content: 'Test comment',
        authorId: 1,
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://localhost:3001/tasks/1/comments',
        expect.objectContaining({
          content: 'Test comment',
          authorId: 1,
        }),
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('report create: should POST /completion-reports', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 1,
            taskId: 1,
            summary: 'Test report',
          },
        },
      };

      axiosPostSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('report', 'create', {
        taskId: 1,
        summary: 'Test report',
        agentId: 1,
      });

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://localhost:3001/completion-reports',
        expect.objectContaining({
          taskId: 1,
          summary: 'Test report',
          agentId: 1,
        }),
        expect.objectContaining({
          headers: {
            'X-API-Key': 'key_test123',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('convention show: should throw when no .agentteams directory exists', async () => {
      await expect(
        executeCommand('convention', 'show', {})
      ).rejects.toThrow('No .agentteams directory found');
    });

    it('config whoami: should display current API key info', async () => {
      const result = await executeCommand('config', 'whoami', {});

      expect(result).toEqual({
        apiKey: 'key_test123',
        apiUrl: 'http://localhost:3001',
      });
    });

    it('should throw for unknown resource command', async () => {
      await expect(executeCommand('unknown', 'list', {})).rejects.toThrow(
        'Unknown resource: unknown'
      );
    });

    it('should validate missing required options for status get', async () => {
      await expect(executeCommand('status', 'get', {})).rejects.toThrow(
        '--id is required for status get'
      );
    });

    it('should validate missing required options for task create', async () => {
      await expect(executeCommand('task', 'create', {})).rejects.toThrow(
        '--title is required for task create'
      );
    });

    it('should validate missing required options for comment create', async () => {
      await expect(executeCommand('comment', 'create', {})).rejects.toThrow(
        '--task-id is required for comment create'
      );
    });

    it('should validate missing required options for report update', async () => {
      await expect(executeCommand('report', 'update', {})).rejects.toThrow(
        '--id is required for report update'
      );
    });

    it('should validate missing required options for dependency create', async () => {
      await expect(
        executeCommand('dependency', 'create', { taskId: '1' })
      ).rejects.toThrow('--depends-on is required for dependency create');
    });

    it('should validate missing required options for agent-config get', async () => {
      await expect(executeCommand('agent-config', 'get', {})).rejects.toThrow(
        '--id is required for agent-config get'
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
          { id: 1, agentName: 'agent1', status: 'ACTIVE' },
          { id: 2, agentName: 'agent2', status: 'IDLE' },
        ],
      };

      const output = formatOutput(data, 'text');

      expect(output).toContain('agent1');
      expect(output).toContain('ACTIVE');
      expect(output).toContain('agent2');
      expect(output).toContain('IDLE');
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
