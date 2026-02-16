import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import axios from 'axios';
import { executeCommand } from '../src/commands/index.js';
import { formatOutput } from '../src/utils/formatter.js';
import { handleError } from '../src/utils/errors.js';
import { AxiosError } from 'axios';

describe('CLI Integration Tests', () => {
  const originalEnv = process.env;
  let axiosGetSpy: jest.SpiedFunction<typeof axios.get>;
  let axiosPostSpy: jest.SpiedFunction<typeof axios.post>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AGENTTEAMS_API_KEY: 'key_test123',
      AGENTTEAMS_API_URL: 'http://localhost:3001',
    };

    axiosGetSpy = jest.spyOn(axios, 'get');
    axiosPostSpy = jest.spyOn(axios, 'post');
  });

  afterAll(() => {
    process.env = originalEnv;
    axiosGetSpy?.mockRestore();
    axiosPostSpy?.mockRestore();
  });

  describe('Commands', () => {
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

    it('convention list: should GET /conventions', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 1, name: 'Convention 1' },
            { id: 2, name: 'Convention 2' },
          ],
        },
      };

      axiosGetSpy.mockResolvedValue(mockResponse as any);

      const result = await executeCommand('convention', 'list', {});

      expect(axiosGetSpy).toHaveBeenCalledWith(
        'http://localhost:3001/conventions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key_test123',
          }),
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('config whoami: should display current API key info', async () => {
      const result = await executeCommand('config', 'whoami', {});

      expect(result).toEqual({
        apiKey: 'key_test123',
        apiUrl: 'http://localhost:3001',
      });
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
