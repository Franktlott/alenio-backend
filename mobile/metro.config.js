// metro.config.js
// NOTE TO AI: Do note change this file unless you are 110% sure you know what you are doing. It will likely break the app.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { withVibecodeMetro } = require("@vibecodeapp/sdk/metro");
const path = require("path");
const fs = require("fs");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Only configure shared folder if it exists (may not exist during Docker build)
const sharedFolder = path.resolve(__dirname, "../shared");
const sharedFolderExists = fs.existsSync(sharedFolder);

// DEBUG: Log metro.config.js version and shared folder status at startup
console.log("[Metro Config] Version: 2025-02-03-v3-fix-dynamic-imports (source: workspace-mobile)");
console.log(`[Metro Config] Shared folder: ${sharedFolder}`);
console.log(`[Metro Config] Shared folder exists: ${sharedFolderExists}`);

if (sharedFolderExists) {
  config.watchFolders = [sharedFolder];
}

// Disable Watchman. macOS recursive watches on this repo drop nested src/
// events, so Metro never invalidates its in-memory graph (simulator reload
// still shows old code). Poll src/ and feed Metro the same change events
// Fast Refresh expects.
config.resolver.useWatchman = false;

// Expo CLI watches via @expo/metro-file-map, not metro-file-map.
const expoFileMapDir = path.dirname(
  require.resolve("@expo/metro-file-map/package.json"),
);
const { Watcher } = require(path.join(expoFileMapDir, "build/Watcher.js"));

function listFiles(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

function startSrcPoller(projectRoot, onChange) {
  const watchedDirs = ["src", "assets"]
    .map((folder) => path.join(projectRoot, folder))
    .filter((dir) => fs.existsSync(dir));
  const mtimes = new Map();
  let hydrated = false;

  const tick = () => {
    for (const dir of watchedDirs) {
      for (const full of listFiles(dir)) {
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        const relativePath = path.relative(projectRoot, full);
        const prev = mtimes.get(relativePath);
        mtimes.set(relativePath, stat.mtimeMs);
        // First tick records existing files. After that, a new path is a create
        // and must be emitted so Metro can resolve newly added modules.
        if (prev == null) {
          if (hydrated) {
            console.log("[Metro Config] src add", relativePath);
            onChange({
              event: "touch",
              relativePath,
              root: projectRoot,
              metadata: {
                type: "f",
                modifiedTime: stat.mtimeMs,
                size: stat.size,
              },
            });
          }
          continue;
        }
        if (prev === stat.mtimeMs) continue;
        console.log("[Metro Config] src change", relativePath);
        onChange({
          event: "touch",
          relativePath,
          root: projectRoot,
          metadata: {
            type: "f",
            modifiedTime: stat.mtimeMs,
            size: stat.size,
          },
        });
      }
    }
    hydrated = true;
  };

  tick();
  const timer = setInterval(tick, 400);
  timer.unref?.();
  return timer;
}

const originalWatch = Watcher.prototype.watch;
Watcher.prototype.watch = async function watchWithSrcPoller(onChange) {
  if (!this.__alenioPoller) {
    this.__alenioPoller = startSrcPoller(__dirname, onChange);
    console.log("[Metro Config] Fast Refresh poller watching src/ and assets/");
  }
  return originalWatch.call(this, onChange);
};

console.log("[Metro Config] Fast Refresh poller installed from", expoFileMapDir);

// Configure asset and source extensions.
const { assetExts, sourceExts } = config.resolver;

// SVG transformer is configured by withVibecodeMetro
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Configure resolver with SVG support, shared folder resolution, and web platform mocking
config.resolver = {
  ...config.resolver,
  assetExts: assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...sourceExts, "svg"],
  useWatchman: false,
  // Only add shared folder resolution if it exists
  // NOTE: unstable_enablePackageExports moved inside conditional - it breaks dynamic imports
  // like `await import("expo-image")` when enabled globally
  ...(sharedFolderExists && {
    unstable_enablePackageExports: true,
    extraNodeModules: {
      ...config.resolver.extraNodeModules,
      "@/shared": sharedFolder,
    },
    nodeModulesPaths: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(__dirname, "../backend/node_modules"),
    ],
  }),
  resolveRequest: (context, moduleName, platform) => {
    // Handle @/shared/* imports explicitly
    // This is needed because:
    // 1. extraNodeModules alone doesn't handle subpath resolution
    // 2. Babel alias would transform to relative path which fails for nested files
    if (sharedFolderExists && moduleName.startsWith("@/shared/")) {
      const subpath = moduleName.slice("@/shared/".length);
      const resolvedPath = path.join(sharedFolder, subpath);
      console.log(`[Metro Resolve] @/shared alias: ${moduleName} -> ${resolvedPath}`);
      return context.resolveRequest(context, resolvedPath, platform);
    }

    // Also handle exact @/shared import (without subpath)
    if (sharedFolderExists && moduleName === "@/shared") {
      console.log(`[Metro Resolve] @/shared exact: ${moduleName} -> ${sharedFolder}`);
      return context.resolveRequest(context, sharedFolder, platform);
    }

    // Handle relative ../shared/* imports (fallback for unmigrated legacy code)
    // These imports are incorrect (resolve to wrong location) but we redirect them
    // to the actual shared folder for backwards compatibility
    // IMPORTANT: Only apply to user code, NOT node_modules with their own internals
    if (sharedFolderExists && !context.originModulePath?.includes("node_modules")) {
      const relativeSharedMatch = moduleName.match(/^(?:\.\.\/)+shared\/(.+)$/);
      if (relativeSharedMatch) {
        const subpath = relativeSharedMatch[1];
        const resolvedPath = path.join(sharedFolder, subpath);
        console.log(`[Metro Resolve] RELATIVE SHARED: ${moduleName} -> ${resolvedPath}`);
        return context.resolveRequest(context, resolvedPath, platform);
      }
    }

    // Mock native-only modules on web
    if (platform === "web") {
      const nativeOnlyModules = [
        "react-native-pager-view",
        "reanimated-tab-view",
        "@bottom-tabs/react-navigation",
      ];

      if (nativeOnlyModules.some((mod) => moduleName.includes(mod))) {
        return {
          type: "empty",
        };
      }
    }

    // Fallback to default resolution
    return context.resolveRequest(context, moduleName, platform);
  },
};

// Integrate NativeWind with the Metro configuration.
const exportedConfig = withNativeWind(withVibecodeMetro(config), {
  input: "./global.css",
});
exportedConfig.resolver = {
  ...exportedConfig.resolver,
  useWatchman: false,
};
module.exports = exportedConfig;
