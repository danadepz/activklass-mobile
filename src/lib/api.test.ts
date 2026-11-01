import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

import { normalizeApiPath, requireBaseUrl, ApiError, errorMessage } from './api';

describe('normalizeApiPath', () => {
  it('throws on empty or invalid input', () => {
    expect(() => normalizeApiPath('')).toThrow(TypeError);
    expect(() => normalizeApiPath('   ')).toThrow(TypeError);
    expect(() => normalizeApiPath(null as any)).toThrow(TypeError);
  });

  it('keeps paths already prefixed with /api', () => {
    expect(normalizeApiPath('/api/auth/initial-password')).toBe('/api/auth/initial-password');
    expect(normalizeApiPath('/api/health')).toBe('/api/health');
    expect(normalizeApiPath('/api')).toBe('/api');
  });

  it('adds leading slash to paths prefixed with api without slash', () => {
    expect(normalizeApiPath('api/auth/initial-password')).toBe('/api/auth/initial-password');
    expect(normalizeApiPath('api/health')).toBe('/api/health');
  });

  it('prefixes relative paths with /api', () => {
    expect(normalizeApiPath('/auth/initial-password')).toBe('/api/auth/initial-password');
    expect(normalizeApiPath('auth/initial-password')).toBe('/api/auth/initial-password');
    expect(normalizeApiPath('/quiz_attempts/123/submit')).toBe('/api/quiz_attempts/123/submit');
    expect(normalizeApiPath('quiz_attempts/123/submit')).toBe('/api/quiz_attempts/123/submit');
  });

  it('preserves absolute external URLs', () => {
    expect(normalizeApiPath('https://example.com/api/test')).toBe('https://example.com/api/test');
    expect(normalizeApiPath('http://localhost:5000/api/test')).toBe('http://localhost:5000/api/test');
    expect(normalizeApiPath('//cdn.example.com/asset')).toBe('//cdn.example.com/asset');
  });
});

describe('requireBaseUrl', () => {
  it('throws ApiError if base URL is missing', () => {
    expect(() => requireBaseUrl('')).toThrow(ApiError);
  });

  it('strips trailing slashes', () => {
    expect(requireBaseUrl('https://backend.example.com/')).toBe('https://backend.example.com');
    expect(requireBaseUrl('https://backend.example.com///')).toBe('https://backend.example.com');
  });

  it('strips trailing /api to prevent duplication', () => {
    expect(requireBaseUrl('https://backend.example.com/api')).toBe('https://backend.example.com');
    expect(requireBaseUrl('https://backend.example.com/api/')).toBe('https://backend.example.com');
  });
});

describe('errorMessage and ApiError', () => {
  it('extracts error message from ApiError', () => {
    const err = new ApiError('Custom error message', 'unauthorized', 401);
    expect(errorMessage(err)).toBe('Custom error message');
    expect(err.status).toBe(401);
    expect(err.code).toBe('unauthorized');
  });

  it('extracts message from standard Error', () => {
    expect(errorMessage(new Error('Standard error'))).toBe('Standard error');
  });

  it('returns fallback for unknown types', () => {
    expect(errorMessage(null, 'Fallback')).toBe('Fallback');
    expect(errorMessage(undefined, 'Fallback')).toBe('Fallback');
  });
});
