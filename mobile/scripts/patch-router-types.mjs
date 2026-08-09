/**
 * Regenerate .expo/types/router.d.ts without booting Metro, so `tsc --noEmit`
 * sees routes added since the dev server last ran. Expo writes the same file on
 * dev-server start, so running this is only a convenience for offline typechecking.
 *
 * Usage: node scripts/patch-router-types.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const routerDirectory = path.join(projectRoot, "src/app");
const typesDirectory = path.join(projectRoot, ".expo/types");

process.env.EXPO_ROUTER_APP_ROOT = routerDirectory;
mkdirSync(typesDirectory, { recursive: true });

const typedRoutes = require("@expo/router-server/build/typed-routes");
typedRoutes.regenerateDeclarations(typesDirectory);

console.log(`[patch-router-types] wrote ${path.join(typesDirectory, "router.d.ts")}`);
