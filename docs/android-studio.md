# Running on the Android emulator

## The project path must not contain spaces

This is the one thing that will stop you before anything else, and the error
does not mention paths at all:

```
> Task :react-native-reanimated:buildCMakeDebug[arm64-v8a] FAILED
  ninja: error: manifest 'build.ninja' still dirty after 100 tries
```

`react-native-reanimated` and `react-native-worklets` compile C++ through
CMake and ninja. Ninja re-runs CMake, CMake regenerates a `build.ninja` that
ninja considers stale again, and after a hundred rounds it gives up. A path
containing a space is what starts that loop.

Verified rather than assumed: the same commit failed at
`...\1st sem 26-27\CAPSTONE\activklass-mobile` and built through the same C++
targets at a space-free path. Nothing else differed. The semester folder was
renamed to `1st-sem-26-27` on 2026-08-19 for exactly this reason — **do not put
a space back into any folder above this project.**

A directory junction does **not** help — Gradle resolves it back to the real
path before CMake ever sees it. The folder itself has to move or be renamed.

If the project is ever moved again, delete `android/` and re-run prebuild: the
generated CMake caches record absolute paths and will keep pointing at the old
location.

Everything else in the toolchain is already correct:

| Component | Needed | Installed |
|---|---|---|
| JDK | 17+ | Temurin 21.0.11 |
| compileSdk | 36 | android-36 |
| NDK | 27.1.12297006 | 27.1.12297006 |
| CMake | 3.22.1 | 3.22.1 |

## First run

The `android/` folder is generated, not committed (`.gitignore` excludes it).
Regenerate it whenever you clone fresh or change `app.json`:

```bash
npx expo prebuild --platform android
```

Then point Gradle at the SDK. `android/local.properties` is machine-specific
and not committed:

```
sdk.dir=C:/Users/danad/AppData/Local/Android/Sdk
```

Use forward slashes. This is a Java properties file, so `C:\Users\danad\...`
is read with `\U` as an escape and silently becomes `C:UsersdanadAppData...`,
which fails as:

```
> java.io.IOException: The filename, directory name, or volume label syntax is incorrect
      at com.android.build.gradle.internal.SdkLocator$SdkLocationSource.validateSdkPath
```

## Two ways to run it

**Android Studio.** Open the `android` folder — not the repository root. Then
start Metro yourself in a terminal at the repository root, because the Studio
run button only installs the APK:

```bash
npx expo start --dev-client
```

**Command line**, which does both:

```bash
npx expo run:android
```

## Reaching the Flask API from the emulator

Inside the emulator, `localhost` is the emulator, not your PC. `10.0.2.2` is
the host. `.env` therefore reads:

```
EXPO_PUBLIC_API_URL=http://10.0.2.2:5000
```

Only the per-class grade and attendance screens need this. The guardian code,
the linking, the dashboard and both logins read Firestore and work with no
server running at all — see `docs/guardian-linking.md`.

## Checks worth running before a build

```bash
npx tsc --noEmit                  # types
npx expo export --platform android  # the bundle actually builds
npx expo-doctor                   # dependency versions vs the SDK
```

The export is the useful one: it catches a bad import or a route that does not
resolve in seconds, where the native build would take minutes to reach the
same failure.
