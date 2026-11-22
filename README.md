# ActivKlass Mobile

The Expo and React Native app for ActivKlass students and parents/guardians. Teachers and administrators primarily use the web client. Related repositories: [activklass-web](https://github.com/danadepz/activklass-web) and [activklass-backend](https://github.com/danadepz/activklass-backend).

## Stack and architecture

- Expo SDK 57, React Native 0.86, TypeScript, and Expo Router.
- Firebase Authentication handles identity, Cloud Firestore is the primary application database, and AsyncStorage holds local app state. Backend trusted Firebase operations use Firebase Admin SDK.
- Firebase rules in the backend repository govern direct client data access.
- Current source also calls selected Flask APIs; `EXPO_PUBLIC_API_URL` configures transport. See [INTEGRATION.md](INTEGRATION.md).
- Android APK is the evidenced distribution format. `app.json` also declares iOS support, which does not establish an iOS release.

## Local setup

Requirements: Node.js/npm, Android Studio with a configured Android SDK for local Android builds, and Java compatible with the checked-in Gradle/Expo toolchain. Clone and install:

```sh
git clone https://github.com/danadepz/activklass-mobile.git
cd activklass-mobile
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell), then set the Firebase `EXPO_PUBLIC_FIREBASE_*` values and `EXPO_PUBLIC_API_URL`. Use `http://10.0.2.2:5000` for a standard Android emulator reaching Flask on the host machine; use a reachable LAN address for a physical device. Do not put private keys in `EXPO_PUBLIC_*` variables.

Start Expo with `npm start`. See [docs/android-studio.md](docs/android-studio.md) for Android Studio-specific steps.

## Commands

```sh
npm start
npm run android
npm test
npm run test:logic
npm run test:screens
npm run lint
npx tsc --noEmit
```

See [TESTING.md](TESTING.md) for suite scopes and prerequisites.

## Distribution

The repository uses Expo Prebuild to generate its ignored Android project from tracked Expo config. Run `npx expo prebuild --platform android` before the Windows `npm run build:apk` script. Signing and publication details still require maintainer confirmation; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Collaboration

Work from a feature branch based on current `main`; open focused pull requests to `main` with affected client repositories and verification noted. Preserve uncommitted work, stage explicit paths, and never commit credentials, `.env`, generated user data, or private signing material. See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
