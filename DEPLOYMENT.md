# Deployment

## Reproducible Android build from a clean checkout

This repository uses Expo Continuous Native Generation (CNG): `app.json` and the locked Expo packages define the native project, while `/android` and `/ios` are ignored and are not tracked. Expo Prebuild is the intended way to materialize a native project. The repository has no `eas.json` or checked-in EAS workflow.

On Windows with the Android SDK/Java toolchain installed:

```powershell
npm ci
npx expo prebuild --platform android
npm run build:apk
```

`npx expo prebuild --platform android` generates the ignored `android/` project and Gradle wrapper from the app config. The existing `build:apk` script then runs `android/gradlew.bat assembleRelease` and copies `android/app/build/outputs/apk/release/app-release.apk` to the repository root and parent directory. `npm run build:apk` alone is not a clean-checkout command because the generated Android project is absent until Prebuild runs. Expo's [CNG guide](https://docs.expo.dev/workflow/continuous-native-generation/) describes this generate-then-build flow.

This documents the build path implied by tracked configuration; no native project was generated and no build was run during this documentation review.

## Signing and distribution remain unverified

The tracked config does not establish a production signing key, a secure signing-secret delivery process, or an active release workflow. A locally generated Gradle release artifact is not automatically proof of a production-signed APK. Do not create or commit signing credentials as part of this documentation task. Before publishing, the maintainer must confirm the signing approach and approved GitHub Release destination, then verify the artifact signature, install/upgrade behavior, version metadata, release tag, and download URL.

`app.json` also declares iOS support, but that does not establish an iOS build or store release.

## Release checklist after signing is established

1. Confirm owner-approved release branch and commit, package/version, signing config, and release destination.
2. Install the documented Android/Java toolchain and run checks from [TESTING.md](TESTING.md).
3. Build from a clean checkout with the commands above and inspect APK metadata/signature.
4. Install and smoke-test on a supported Android device/emulator using non-production test accounts.
5. Publish the reviewed APK through the approved GitHub Release process; confirm release tag, asset, and download URL before sharing.
6. Record artifact version, source commit, and verification; coordinate backend/API compatibility changes.

Do not deploy, publish, overwrite a release asset, or modify production services as part of documentation work. Never commit signing keys, credentials, `.env`, or user data.
