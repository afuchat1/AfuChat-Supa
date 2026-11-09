module.exports = function (api) {
  // The plugin list changes between dev and production. Cache by environment
  // so a long-lived Metro process cannot reuse the wrong transform settings.
  api.cache.using(() => process.env.NODE_ENV || process.env.BABEL_ENV || "development");
  const isProd = process.env.NODE_ENV === "production" || process.env.BABEL_ENV === "production";
  // Reanimated 4 uses Worklets as its Babel transform. The Reanimated
  // compatibility re-export still exists, but using the canonical plugin
  // avoids mixing the legacy plugin entry point with the Worklets runtime.
  const plugins = [
    "./babel-plugin-localized-text",
    "react-native-worklets/plugin",
  ];
  if (isProd) {
    plugins.push(["transform-remove-console", { exclude: ["error"] }]);
  }
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins,
  };
};
