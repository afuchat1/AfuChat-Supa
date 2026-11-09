# AfuChat — R8/ProGuard Configuration

## Status

| Setting | Value |
|---|---|
| R8 enabled | **No** (disabled for startup-compatible release builds) |
| Resource shrinking | **No** (`enableShrinkResourcesInReleaseBuilds: false`) |
| JS minification | **No** (`enableMinifyInReleaseBuilds: false`) |
| Android Gradle Plugin | **8.10.1** (forced by the CNG config plugin) |
| Mapping file | Generated automatically on every release build |
| Config mechanism | Expo config plugin (`plugins/withProguardRules.js`) |

---

## Release shrinker status

R8 is intentionally disabled via `expo-build-properties` in `app.json`
while Android startup stability is being diagnosed:

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", {
        "android": {
          "enableMinifyInReleaseBuilds": false,
          "enableShrinkResourcesInReleaseBuilds": false
        }
      }]
    ]
  }
}
```

These flags instruct Expo's prebuild step to keep `minifyEnabled false` and
`shrinkResources false` in the `release` buildType inside
`android/app/build.gradle`.

This avoids release-only class/resource removal while native startup is being
isolated. The custom rules remain available for a later controlled re-enable.

---

## Where the mapping file is generated

After a release build the R8 mapping file appears at:

```
android/app/build/outputs/mapping/release/mapping.txt
```

The `withProguardRules` config plugin also copies it to a version-stamped
filename immediately after R8 finishes:

```
android/app/build/outputs/mapping/release/mapping-<versionName>-<versionCode>.txt
```

Example for v2.2.5 (versionCode 226):

```
android/app/build/outputs/mapping/release/mapping-2.2.5-226.txt
```

The stamped filename is printed to the Gradle build log:

```
===========================================================
 R8 mapping archived:
   /path/to/android/app/build/outputs/mapping/release/mapping-2.2.5-226.txt
 Upload this file to Google Play Console for deobfuscation.
===========================================================
```

---

## How to retrieve the mapping file for a specific EAS release

EAS Build does not expose the mapping file as a separate downloadable
artifact.  Use one of the following methods:

### Method 1 — Google Play Console (recommended for production AABs)

When you submit an AAB to Google Play via `eas submit`, the mapping file is
automatically included in the AAB's metadata.  Google Play Console uses it
automatically for crash deobfuscation in **Android vitals → ANRs and crashes**.

No manual upload is needed when using `eas submit`.

### Method 2 — Download from the EAS build log

1. Open the EAS build on [expo.dev](https://expo.dev).
2. Go to **Logs**.
3. Search for `mapping archived` — the log line prints the full path.
4. The mapping file is present on the EAS worker for the duration of the build.
   Unfortunately EAS does not let you `scp` from the worker after the build
   completes.

### Method 3 — Local prebuild + Gradle (recommended for preview APKs)

```bash
cd artifacts/mobile

# 1. Generate the android/ folder
npx expo prebuild --platform android --clean

# 2. Build the release APK
cd android
./gradlew assembleRelease

# 3. Retrieve the mapping file
ls app/build/outputs/mapping/release/
# → mapping.txt
# → mapping-2.2.5-226.txt  (version-stamped copy)
```

### Method 4 — Archive via EAS post-build hook

Add a `scripts/eas-build-post-install.sh` script that uploads the mapping
file to Cloudflare R2 or another object store immediately after Gradle
completes.  This requires that the script runs after the Gradle step, which
EAS does not currently support natively.  A workaround is to use a
**custom EAS build config** with a `gradleCommand` that wraps the build and
then uploads the artefact.

---

## Custom ProGuard rules

All custom rules live in **`artifacts/mobile/proguard-rules.pro`** and are
injected into `android/app/proguard-rules.pro` at prebuild time by the
`withProguardRules` config plugin.

### Why custom rules are needed

Expo SDK 55 and most React Native libraries ship their own
`consumer-rules.pro` / `proguard.txt` files.  The rules below are needed
because:

| Rule group | Reason |
|---|---|
| `SourceFile,LineNumberTable` attributes | Google Play Console crash deobfuscation requires line numbers; without them stack traces show only obfuscated class/method names |
| `renamesourcefileattribute SourceFile` | Hides internal source paths in crash reports while preserving line numbers |
| Hermes JNI (`com.facebook.hermes.*`, `com.facebook.jni.*`) | Called from native C++ during JS engine init; R8 cannot see native call sites |
| `@DoNotStrip` annotated classes | React Native uses this annotation to protect bridge classes; the annotation itself must be kept for the scan to work |
| OkHttp / Okio | Supabase REST client and R2 upload use OkHttp; some internal classes are accessed via reflection |
| WebSocket listener implementations | Supabase Realtime creates WebSocket listeners reflectively |
| Kotlinx serialization | Supabase-kt generates serializer companions at compile time; R8 must not rename them |
| Expo module subclasses | Expo module loader discovers modules by scanning for subclasses of `ExpoModule`; renaming breaks the registry |
| MMKV v3 | JNI lookup by mangled C++ symbol name; renaming breaks storage entirely |
| Reanimated 4 / Gesture Handler | Worklet runtime crosses the JNI boundary; JNI methods are looked up by name |
| WorkManager | `CoroutineWorker` subclasses are instantiated by class name from the task registry |
| Activity / Service / BroadcastReceiver / ContentProvider | Android instantiates these by class name from the manifest; renaming any of them breaks deep links and background tasks |
| `@SerialName` fields | Supabase JSON deserialization maps JSON keys to Kotlin fields by their serialised name |

### Rules intentionally NOT included

- **Gson** — not used; Supabase-kt uses kotlinx.serialization instead.
- **Retrofit** — not used; Supabase-kt ships its own Ktor-based client.
- **Room** — not used; persistence is via expo-sqlite and MMKV.
- **Glide / Picasso** — not used; image loading is via expo-image.

---

## How the config plugin works

`plugins/withProguardRules.js` is an Expo config plugin registered in
`app.json`.  It runs during `expo prebuild` (and therefore at the start of
every EAS build):

1. **Rule injection** — reads `proguard-rules.pro` from the project root,
   appends it to the generated `android/app/proguard-rules.pro` with an
   idempotency marker so repeated prebuilds don't duplicate the rules.

2. **Gradle mapping task** — appends a `tasks.configureEach` hook to
   `android/app/build.gradle` that runs after `minifyReleaseWithR8` and
   copies `mapping.txt` to the version-stamped filename. `configureEach`
   handles both already-created and future Gradle tasks.

The `android/` directory is **gitignored** (CNG project).  The plugin is the
single source of truth for these Android-native customisations.

---

## Verifying R8 is active

### In the EAS / Gradle build log

Look for lines like:

```
> Task :app:minifyReleaseWithR8
```

If you see `minifyRelease` without `WithR8`, R8 was not engaged.

### Inspect the APK

```bash
# Install bundletool or apkanalyzer
apkanalyzer dex packages app-release.apk | grep "com.afuchat" | head -20
# Obfuscated names (a, b, c …) confirm R8 ran
```

### Check mapping.txt exists

```bash
ls -lh android/app/build/outputs/mapping/release/
# mapping.txt and mapping-<version>-<versionCode>.txt should both be present
```

---

## Updating rules for new libraries

When you add a third-party library that uses JNI, reflection, or Android
component subclasses:

1. Check if the library ships its own `consumer-rules.pro`.
   - If yes, no action needed.
2. If not, add keep rules to `artifacts/mobile/proguard-rules.pro` with a
   comment explaining why.
3. Rebuild and test a release APK locally (`./gradlew assembleRelease`) before
   triggering an EAS build.
