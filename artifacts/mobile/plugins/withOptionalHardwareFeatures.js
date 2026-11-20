/**
 * Keep optional device hardware from restricting Google Play availability.
 * AfuChat can run on devices without a portrait-only display capability
 * declaration or Wi-Fi hardware (for example, cellular-only devices).
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const OPTIONAL_FEATURES = [
  "android.hardware.screen.portrait",
  "android.hardware.wifi",
];

module.exports = function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = manifest["uses-feature"] ?? (manifest["uses-feature"] = []);

    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find(
        (feature) => feature.$?.["android:name"] === name,
      );

      if (existing) {
        existing.$["android:required"] = "false";
      } else {
        features.push({
          $: {
            "android:name": name,
            "android:required": "false",
          },
        });
      }
    }

    return config;
  });
};
