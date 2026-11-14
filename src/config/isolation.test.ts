import { describe, expect, it } from 'vitest';
import { isolatedEmulatorHost } from './isolation';

const SAFE = {
  emulatorHost: '10.0.2.2',
  projectId: 'demo-activklass-t267',
  apiUrl: 'http://10.0.2.2:5000',
  isDev: true,
};
const PROD = {
  projectId: 'activklass1',
  apiUrl: 'https://activklass-backend-59267706068.asia-southeast1.run.app',
  isDev: false,
};

describe('isolatedEmulatorHost (T-267 isolated test mode)', () => {
  it('is off for the production configuration, in release and dev', () => {
    expect(isolatedEmulatorHost(PROD)).toBeNull();
    expect(isolatedEmulatorHost({ ...PROD, isDev: true })).toBeNull();
  });

  it('returns the host for a fully isolated dev configuration', () => {
    expect(isolatedEmulatorHost(SAFE)).toBe('10.0.2.2');
  });

  it('refuses emulator mode in a release build', () => {
    expect(() => isolatedEmulatorHost({ ...SAFE, isDev: false })).toThrow(/development builds only/);
  });

  it('refuses emulator Auth against the real project', () => {
    expect(() => isolatedEmulatorHost({ ...SAFE, projectId: 'activklass1' })).toThrow(/demo-\*/);
  });

  it('refuses emulator Firebase with the production API', () => {
    expect(() => isolatedEmulatorHost({ ...SAFE, apiUrl: PROD.apiUrl })).toThrow(/local API/);
  });

  it('refuses a demo project without the emulators', () => {
    expect(() => isolatedEmulatorHost({ ...PROD, projectId: 'demo-activklass-t267' })).toThrow(/emulators/);
  });

  it('refuses an emulator host that is not this machine', () => {
    expect(() => isolatedEmulatorHost({ ...SAFE, emulatorHost: 'firebase.example.com' })).toThrow(/not this machine/);
  });
});
