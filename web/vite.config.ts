import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveBackendUrl } from "./src/lib/env-config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  /** Same as the URL you type on iPad (e.g. http://192.168.1.42:5173). Fixes blank page when using a LAN IP. */
  const devOrigin = env.VITE_DEV_SERVER_ORIGIN?.trim();
  const resolvedBackend = resolveBackendUrl(env, mode === "production");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || resolvedBackend || "http://127.0.0.1:3000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Listen on all interfaces so iPad/phone on the same Wi‑Fi can open http://<your-mac-ip>:5173
      host: true,
      cors: true,
      ...(devOrigin ? { origin: devOrigin } : {}),
      // iPad only needs this port; /api is forwarded to the active backend (dev or prod per VITE_API_TARGET).
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/web": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
