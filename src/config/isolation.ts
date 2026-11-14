/**
 * T-267 isolated test mode: the dev client talks to the Firebase emulators and a
 * local Flask instead of activklass1 and Cloud Run. Opt-in through one variable,
 * EXPO_PUBLIC_FIREBASE_EMULATOR_HOST (on an Android emulator, 10.0.2.2 is the
 * host machine). Unset — every release and every normal dev run — this returns
 * null and nothing changes.
 *
 * Refuses (throws at startup, before any request) every half-isolated mix:
 * emulator Auth with a real project, a demo project with real Auth, emulator
 * Firebase with the production API, or any of it in a release build.
 */
export type IsolationEnv = {
  emulatorHost?: string;
  projectId?: string;
  apiUrl?: string;
  isDev: boolean;
};

const LOCAL_HOSTS = ['10.0.2.2', 'localhost', '127.0.0.1'];
const PRODUCTION_MARKERS = ['activklass1', 'run.app', '59267706068'];

function hostOf(url: string): string {
  const match = /^https?:\/\/([^/:]+)/.exec(url);
  return match ? match[1] : '';
}

export function isolatedEmulatorHost(env: IsolationEnv): string | null {
  const host = (env.emulatorHost || '').trim();
  const project = env.projectId || '';
  const api = env.apiUrl || '';

  if (!host) {
    if (project.startsWith('demo-')) {
      throw new Error(`Project ${project} exists only in the emulators; set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST.`);
    }
    return null;
  }
  if (!env.isDev) {
    throw new Error('Emulator mode is for development builds only; remove EXPO_PUBLIC_FIREBASE_EMULATOR_HOST.');
  }
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(`Emulator host ${host} is not this machine (${LOCAL_HOSTS.join(', ')}).`);
  }
  if (!project.startsWith('demo-')) {
    throw new Error(`Emulator mode needs a demo-* project id, not ${project || '(unset)'}.`);
  }
  if (!LOCAL_HOSTS.includes(hostOf(api)) || PRODUCTION_MARKERS.some((m) => api.includes(m))) {
    throw new Error(`Emulator mode needs a local API (http://10.0.2.2:5000), not ${api || '(unset)'}.`);
  }
  return host;
}
