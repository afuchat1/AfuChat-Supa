const { withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Keep verification/internal APKs small by avoiding a universal APK.
 * Production uses an Android App Bundle, where Play already serves the
 * appropriate native architecture to each device.
 */
module.exports = function withAndroidAbiSplits(config) {
  return withProjectBuildGradle(config, (projectConfig) => {
    if (projectConfig.modResults.language !== "groovy") return projectConfig;
    const marker = "// AfuChat ABI splits";
    if (projectConfig.modResults.contents.includes(marker)) return projectConfig;

    const abiBlock = `
    ${marker}
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a"
            universalApk false
        }
    }
`;
    projectConfig.modResults.contents = projectConfig.modResults.contents.replace(
      /android\s*\{/,
      (match) => `${match}${abiBlock}`,
    );
    return projectConfig;
  });
};