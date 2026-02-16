import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { validateEnv, normalizeUrl } from '../src/utils/env.js';

describe('Environment Variables', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should error when AGENTTEAMS_API_KEY is not set', () => {
    delete process.env.AGENTTEAMS_API_KEY;
    process.env.AGENTTEAMS_API_URL = 'http://localhost:3001';

    expect(() => validateEnv()).toThrow('AGENTTEAMS_API_KEY environment variable is required');
  });

  it('should error when AGENTTEAMS_API_URL is not set', () => {
    process.env.AGENTTEAMS_API_KEY = 'key_test123';
    delete process.env.AGENTTEAMS_API_URL;

    expect(() => validateEnv()).toThrow('AGENTTEAMS_API_URL environment variable is required');
  });

  it('should pass when both environment variables are set', () => {
    process.env.AGENTTEAMS_API_KEY = 'key_test123';
    process.env.AGENTTEAMS_API_URL = 'http://localhost:3001';

    expect(() => validateEnv()).not.toThrow();
  });

  it('should normalize URL with trailing slash', () => {
    expect(normalizeUrl('http://localhost:3001/')).toBe('http://localhost:3001');
    expect(normalizeUrl('http://localhost:3001')).toBe('http://localhost:3001');
    expect(normalizeUrl('https://api.example.com/')).toBe('https://api.example.com');
  });
});
