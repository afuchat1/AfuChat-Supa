const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Explicitly pin projectRoot to artifacts/mobile so Metro doesn't pick up the
// pnpm workspace root as the project root in a monorepo layout.
config.projectRoot = __dirname;

// ─── Web-platform shims ────────────────────────────────────────────────────────
// Packages that import react-native internals (codegenNativeCommands, ReactFabric,
// etc.) are unsupported on web. resolveRequest intercepts them at bundle time and
// swaps in a lightweight web-safe stub so Metro can produce a valid web bundle.
const WEB_SHIMS = {
  "react-native-pager-view": path.resolve(__dirname, "lib/pager-view-web-shim.js"),
  "@shopify/flash-list":     path.resolve(__dirname, "lib/flash-list-web-shim.js"),
  "expo-share-intent":       path.resolve(__dirname, "lib/share-intent-web-shim.js"),
};
// Keep Metro focused on the mobile app and away from generated sandbox files.
config.resolver = {
  ...(config.resolver || {}),
  // Allow native dependencies that package static wasm assets to resolve.
  assetExts: [...(config.resolver?.assetExts ?? []), "wasm"],
  // Pin React & react-native-web to the single copy in artifacts/mobile/node_modules
  // so pnpm's hoisting never produces two React instances (causes ReactCurrentDispatcher crash).
  extraNodeModules: {
    "react":            path.resolve(__dirname, "node_modules/react"),
    "react-dom":        path.resolve(__dirname, "node_modules/react-dom"),
    "react-native-web": path.resolve(__dirname, "node_modules/react-native-web"),
  },
  resolveRequest: (context, moduleName, platform) => {
    // Metro may omit the platform while walking a CommonJS require from the
    // web entrypoint. Match that case too.
    const shim = WEB_SHIMS[moduleName] ??
      undefined;
    if ((platform === "web" || platform == null) && shim) {
      return { filePath: shim, type: "sourceFile" };
    }
    // Fall through to default Metro resolution for all other cases.
    return context.resolveRequest(context, moduleName, platform);
  },
  blockList: [
    /node_modules[\\/]\.pnpm[\\/].*_tmp_\d+/,
    // typedoc's inner node_modules symlink doesn't exist in pnpm's virtual store
    /node_modules[\\/]\.pnpm[\\/]typedoc[^/]*[\\/]node_modules[\\/]typedoc[\\/]node_modules.*/,
    // require-main-filename pnpm entry is a broken symlink — exclude to prevent ENOENT watcher crash
    /node_modules[\\/]\.pnpm[\\/]require-main-filename[^/]*[\\/]node_modules[\\/]require-main-filename.*/,
    // sucrase dist/esm is missing in pnpm virtual store — exclude to prevent ENOENT watcher crash
    /node_modules[\\/]\.pnpm[\\/]sucrase[^/]*[\\/]node_modules[\\/]sucrase[\\/]dist[\\/]esm.*/,
    // react-native-mmkv cpp/ios/src dirs missing in pnpm virtual store
    /node_modules[\\/]\.pnpm[\\/]react-native-mmkv[^/]*[\\/]node_modules[\\/]react-native-mmkv[\\/](cpp|ios|src).*/,
    // recharts umd dir missing in pnpm virtual store
    /node_modules[\\/]\.pnpm[\\/]recharts[^/]*[\\/]node_modules[\\/]recharts[\\/]umd.*/,
    // date-fns _lib dir missing in pnpm virtual store — exclude to prevent ENOENT watcher crash
    /node_modules[\\/]\.pnpm[\\/]date-fns[^/]*[\\/]node_modules[\\/]date-fns[\\/]_lib.*/,
  ],
  // Explicit node_modules search paths: mobile-local first, then workspace root.
  // This ensures packages hoisted by pnpm to the workspace root are found.
  nodeModulesPaths: [
    path.resolve(__dirname, "node_modules"),
    path.resolve(__dirname, "../../node_modules"),
  ],
};

/**
 * Expo Go uses the normal Metro response mode. Keeping lazy bundling enabled is
 * important for this large Expo Router app because the complete web/server
 * route graph can exceed Node's default heap during startup.
 *
 * Additional hardening here:
 *  - Increased socket timeout to handle proxy latency
 *  - Fewer transformer workers to avoid OOM pressure during first bundle
 */

// Limit worker threads — large projects + Replit's 2 GB RAM limit = OOM risk
config.maxWorkers = 2;

// Transformer: use fewer inline requires to reduce bundle complexity
config.transformer = {
  ...(config.transformer || {}),
  minifierConfig: {
    ...(config.transformer?.minifierConfig || {}),
  },
  // Keep evaluation order deterministic in production. This app has a large
  // provider/storage/navigation graph with intentional side effects; global
  // inlineRequires changes cycle timing and can surface Hermes-only TDZ crashes
  // that Expo Go does not reproduce.
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: false,
    },
  }),
};

const originalEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware, server) => {
    const wrapped = originalEnhance
      ? originalEnhance(middleware, server)
      : middleware;
    return (req, res, next) => {
      // Extend socket timeout for all requests — Replit proxy adds latency and
      // the default 30 s timeout kills large bundle transfers on slow connections.
      req.socket?.setTimeout?.(120_000);
      res.setTimeout?.(120_000);
      return wrapped(req, res, next);
    };
  },
};

module.exports = config;
