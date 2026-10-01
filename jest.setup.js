/**
 * Shared mocks for the screen tests.
 *
 * The question these tests answer is narrow and worth stating, because it
 * decides what belongs in here: DOES THIS SCREEN MOUNT WITHOUT THROWING?
 *
 * Not "does it show the right grade" -- that is what the vitest suites over
 * src/lib are for, and they are faster at it. The failure mode being hunted is
 * the one neither `tsc` nor a logic test can see: a screen that white-screens
 * on a student's phone because something was undefined at render time, an
 * import was wrong, or a hook ran conditionally.
 *
 * So everything below is stubbed at the boundary rather than simulated. No
 * Firestore, no network, no real auth. A screen that needs live data to mount
 * at all is itself the bug.
 */


// --- Firebase -------------------------------------------------------------
// Stubbed at our own config module, not at the SDK: the screens import `auth`
// and `db` from here, so this is the narrowest place that works and it does
// not require knowing which SDK functions each screen happens to call.
jest.mock('./src/config/firebase', () => ({
  auth: { currentUser: { uid: 'test-student', email: 'student@test.dev' } },
  db: {},
}))

// Auth functions stubbed so screens calling updatePassword/signOut mount cleanly
jest.mock('firebase/auth', () => ({
  updatePassword: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  signInWithEmailAndPassword: jest.fn(async () => ({ user: { uid: 'test-user' } })),
  createUserWithEmailAndPassword: jest.fn(async () => ({ user: { uid: 'new-user' } })),
  onAuthStateChanged: jest.fn((auth, cb) => {
    cb({ uid: 'test-student', email: 'student@test.dev' })
    return () => {}
  }),
  EmailAuthProvider: {
    credential: jest.fn(() => ({})),
  },
  reauthenticateWithCredential: jest.fn(async () => {}),
}))

// Firestore reads resolve empty rather than hanging. onSnapshot returns an
// unsubscribe so cleanup does not throw on unmount.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  collectionGroup: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDoc: jest.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: jest.fn(async () => ({ empty: true, docs: [], forEach: () => {} })),
  onSnapshot: jest.fn(() => () => {}),
  updateDoc: jest.fn(async () => {}),
  setDoc: jest.fn(async () => {}),
  addDoc: jest.fn(async () => ({ id: 'new-doc' })),
  deleteDoc: jest.fn(async () => {}),
  serverTimestamp: jest.fn(() => null),
  arrayUnion: jest.fn((...v) => v),
  arrayRemove: jest.fn((...v) => v),
  increment: jest.fn((n) => n),
  documentId: jest.fn(() => '__name__'),
  Timestamp: { now: () => ({ toMillis: () => 0 }), fromMillis: (m) => ({ toMillis: () => m }) },
}))

// --- expo-router ----------------------------------------------------------
// useFocusEffect must actually invoke its callback: several screens do their
// first load there, and a stub that ignores it would report "mounts fine" on a
// screen whose only render path never runs.
globalThis.__searchParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  const routerStub = {
    push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(),
  }
  return {
    useRouter: () => routerStub,
    useLocalSearchParams: () => globalThis.__searchParams ?? {},
    useSegments: () => [],
    usePathname: () => '/',
    useFocusEffect: (cb) => React.useEffect(() => cb(), []),
    Link: ({ children }) => children,
    Stack: Object.assign(({ children }) => children, { Screen: () => null }),
    Tabs: Object.assign(({ children }) => children, { Screen: () => null }),
    Redirect: () => null,
  }
})

// React 19 wants this set before any render, or every state update from an
// effect logs "not configured to support act(...)". The updates are real and
// correct -- ThemeContext reads the stored preference asynchronously -- so the
// warning is noise about the environment, not about the code.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// --- our own auth context -------------------------------------------------
// A signed-in student by default. Read through globalThis so a test can swap
// roles before rendering: a jest.mock factory may not close over module scope,
// but globals are permitted, and this is the whole reason.
globalThis.__authState = {
  user: { uid: 'test-student', email: 'student@test.dev' },
  profile: {
    id: 'test-student', role: 'student',
    first_name: 'Test', last_name: 'Student', email: 'student@test.dev',
  },
  loading: false,
  logout: () => {},
}

/** Sign the next render in as someone else. Call before renderScreen(). */
globalThis.signedInAs = (profile) => {
  globalThis.__authState = {
    user: { uid: profile.id, email: profile.email },
    profile,
    loading: false,
    logout: () => {},
  }
}

jest.mock('./src/context/AuthContext', () => ({
  useAuth: () => globalThis.__authState,
  AuthProvider: ({ children }) => children,
}))

jest.mock('./src/hooks/useRequireAuth', () => ({ useRequireAuth: () => {} }))

// --- native modules with no JS fallback -----------------------------------
// AsyncStorage is a native module and is null under jest. The package ships
// its own mock for exactly this. Reached indirectly: ThemeContext persists the
// theme choice and config/firebase uses it for auth persistence, so almost
// every screen pulls it in without naming it.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))

// Returns children directly rather than wrapping them in a View. NativeWind's
// babel plugin rewrites JSX and createElement inside a jest.mock factory into
// a reference to its own runtime, which jest then rejects as an out-of-scope
// variable -- so these mocks must not construct React Native elements at all.
jest.mock('react-native-safe-area-context', () => {
  function SafeAreaProvider(props) { return props ? props.children : null }
  function SafeAreaView(props) { return props ? props.children : null }
  return {
    SafeAreaProvider,
    SafeAreaView,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  Feather: () => null,
  FontAwesome: () => null,
}))

// Silence the act() and animation warnings that RN/React 19 emits under test and
// that nobody is going to action. Real errors still surface: only these two
// specific strings are dropped.
const realWarn = console.warn
console.warn = (...args) => {
  const first = String(args[0] ?? '')
  if (first.includes('useNativeDriver') || first.includes('not wrapped in act')) return
  realWarn(...args)
}

const realError = console.error
console.error = (...args) => {
  const first = String(args[0] ?? '')
  if (
    first.includes('not configured to support act') ||
    first.includes('not wrapped in act') ||
    first.includes('overlapping act() calls')
  ) return
  realError(...args)
}
