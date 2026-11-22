# Deployment

## Current build evidence

`app.json` configures an Android package and also declares iOS support. The `package.json` script `build:apk` invokes `android/gradlew.bat assembleRelease` and copies an output APK, but the current tracked `main` tree does **not** contain `android/` or `android/gradlew.bat`. The script therefore cannot run from a clean clone as checked in. The local `android/` directory visible in some workspaces may be ignored/generated state and is not repository build evidence.

No EAS configuration or checked-in release workflow is present in `main`. The active APK publishing path, signing setup, and current GitHub Release state need maintainer confirmation. iOS configuration alone does not establish an iOS build or store release.

## Decision required before a repeatable release

Choose and document how the Android native project is produced and signed:

1. Commit the required native Android project/wrapper, or
2. Add a documented, reproducible Expo prebuild/build pipeline and verify it from a clean checkout.

Then verify the signing credentials are safely provided, build output path, package/version metadata, and the approved GitHub Release publishing process. Never commit signing keys or credentials.

## Release checklist after the build path is established

1. Confirm owner-approved release branch and commit, package/version, signing config, and release destination.
2. Install the documented Android/Java toolchain and run checks from [TESTING.md](TESTING.md).
3. Build from a clean checkout using the approved build path. Confirm success and inspect APK metadata/signature.
4. Install and smoke-test on a supported Android device/emulator using non-production test accounts.
5. Publish the reviewed APK through the approved GitHub Release process; confirm release tag, asset, and download URL before sharing.
6. Record artifact version, source commit, and verification; coordinate backend/API compatibility changes.

Do not deploy, publish, overwrite a release asset, or modify production services as part of documentation work. Never commit signing keys, credentials, `.env`, or user data. Check `.gitignore` and release workflow before staging generated APKs.\n