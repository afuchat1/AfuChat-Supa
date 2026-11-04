/**
 * Keeps the generated Android project on the compatible release toolchain.
 *
 * Expo uses Continuous Native Generation, so this must be a config plugin
 * instead of an edit to the generated android/ directory.
 */
const {
  withProjectBuildGradle,
  withSettingsGradle,
  withGradleProperties,
  withAppBuildGradle,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const AGP_VERSION = "9.2.0";
const KOTLIN_VERSION = "2.2.10";
// AGP 9.2 requires Gradle 9.4.1.
const GRADLE_VERSION = "9.4.1";
const AGP_MARKER = "// AfuChat Android Gradle Plugin 9.2 optimization";

function updateAgpDeclaration(contents) {
  if (contents.includes(AGP_MARKER)) return contents;

  let updated = contents;
  let changed = false;

  updated = updated.replace(
    /(com\.android\.tools\.build:gradle:)[\w.+-]+/g,
    `$1${AGP_VERSION}`,
  );
  changed ||= updated !== contents;

  updated = updated.replace(
    /(id\(["']com\.android\.(?:application|library)["']\)\s+version\s+["'])[^"']+(["'])/g,
    `$1${AGP_VERSION}$2`,
  );
  changed ||= updated !== contents;

  // Some Expo templates keep the version in pluginManagement and use a
  // versionless buildscript coordinate in the project build file.
  if (!changed && /com\.android\.tools\.build:gradle['"]/.test(updated)) {
    updated = updated.replace(
      /com\.android\.tools\.build:gradle(?=['"])/,
      `com.android.tools.build:gradle:${AGP_VERSION}`,
    );
    changed = updated !== contents;
  }

  if (!changed) return contents;
  return `${AGP_MARKER}\n${updated}`;
}

function updateVersionCatalog(contents) {
  let inVersionsSection = false;

  return contents
    .split("\n")
    .map((line) => {
      const section = line.match(/^\s*\[([^\]]+)\]/);
      if (section) {
        inVersionsSection = section[1] === "versions";
        return line;
      }

      if (!inVersionsSection) return line;

      const version = line.match(
        /^(\s*)(agp|androidGradlePlugin|kotlin)(\s*=\s*)(["'])([^"']*)(["'])(\s*(?:#.*)?)$/,
      );
      if (!version) return line;

      const value = version[2] === "kotlin" ? KOTLIN_VERSION : AGP_VERSION;
      return `${version[1]}${version[2]}${version[3]}${version[4]}${value}${version[6]}${version[7]}`;
    })
    .join("\n");
}

function withAgp(config) {
  config = withProjectBuildGradle(config, (config) => {
    config.modResults.contents = updateAgpDeclaration(config.modResults.contents);
    return config;
  });
  config = withSettingsGradle(config, (config) => {
    config.modResults.contents = updateAgpDeclaration(config.modResults.contents);
    return config;
  });
  return withDangerousMod(config, [
    "android",
    (config) => {
      const catalogPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle",
        "libs.versions.toml",
      );
      if (!fs.existsSync(catalogPath)) return config;

      const contents = fs.readFileSync(catalogPath, "utf8");
      const updated = updateVersionCatalog(contents);
      if (updated !== contents) fs.writeFileSync(catalogPath, updated);
      return config;
    },
  ]);
}

function withGradleWrapper(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const wrapperPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties",
      );
      if (!fs.existsSync(wrapperPath)) return config;

      const contents = fs.readFileSync(wrapperPath, "utf8");
      const updated = contents.replace(
        /distributionUrl=.*gradle-[\d.]+-(?:bin|all)\.zip/,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
      );
      if (updated !== contents) fs.writeFileSync(wrapperPath, updated);
      return config;
    },
  ]);
}

/**
 * expo-build-properties normally writes these values into the generated
 * release build type. Keep the Gradle properties explicit as a fallback:
 * Expo templates have changed the generated build.gradle shape across SDK
 * releases, while these properties remain stable and are consumed by the
 * React Native/Expo release template.
 */
function withReleaseOptimizations(config) {
  return withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const ensureProperty = (key, value) => {
      const existing = properties.find(
        (property) => property.type === "property" && property.key === key,
      );
      if (existing) {
        existing.value = value;
      } else {
        properties.push({ type: "property", key, value });
      }
    };

    // Enable R8 for release DEX optimization, shrinking, and obfuscation to
    // meet the upcoming Google Play optimization threshold. Keep resource
    // shrinking off separately; it is not required for DEX optimization.
    ensureProperty("android.enableMinifyInReleaseBuilds", "true");
    ensureProperty("android.enableShrinkResourcesInReleaseBuilds", "false");
    return config;
  });
}

/**
 * Use the optimized ProGuard template whenever R8 minification is enabled.
 * Expo's release template can emit the legacy filename, so normalize it after
 * expo-build-properties has generated the app build file. This runs on every
 * CNG/EAS prebuild.
 */
function withOptimizedProguardTemplate(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const updated = contents.replace(
      /getDefaultProguardFile\(\s*(['"])proguard-android\.txt\1\s*\)/g,
      "getDefaultProguardFile('proguard-android-optimize.txt')",
    );

    if (updated !== contents) {
      console.log(
        "[withAndroidBuildOptimization] Replaced legacy proguard-android.txt with proguard-android-optimize.txt",
      );
      config.modResults.contents = updated;
    }

    if (/getDefaultProguardFile\(\s*(['"])proguard-android\.txt\1\s*\)/.test(
      config.modResults.contents,
    )) {
      throw new Error(
        "[withAndroidBuildOptimization] Legacy proguard-android.txt reference remains in android/app/build.gradle.",
      );
    }

    return config;
  });
}

module.exports = (config) =>
  withOptimizedProguardTemplate(
    withReleaseOptimizations(withGradleWrapper(withAgp(config))),
  );