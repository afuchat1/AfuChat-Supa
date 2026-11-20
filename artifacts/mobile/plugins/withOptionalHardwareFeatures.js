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
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    const features = manifest["uses-feature"] ?? (manifest["uses-feature"] = []);

    for (const name of OPTIONAL_FEATURES) {
      const existing = features.filter(
        (feature) => feature.$?.["android:name"] === name,
      );

      if (existing.length) {
        for (const feature of existing) {
          feature.$["android:required"] = "false";
          feature.$["tools:replace"] = "android:required";
        }
      } else {
        features.push({
          $: {
            "android:name": name,
            "android:required": "false",
            "tools:replace": "android:required",
          },
        });
      }
    }

    return config;
  });
};
