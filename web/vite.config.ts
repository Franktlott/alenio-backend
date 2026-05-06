import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  /** Same as the URL you type on iPad (e.g. http://192.168.1.42:5173). Fixes blank page when using a LAN IP. */
  const devOrigin = env.VITE_DEV_SERVER_ORIGIN?.trim();
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || "http://127.0.0.1:3000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Listen on all interfaces so iPad/phone on the same Wi‑Fi can open http://<your-mac-ip>:5173
      host: true,
      cors: true,
      ...(devOrigin ? { origin: devOrigin } : {}),
      // iPad only needs this port; /api is forwarded to the backend on your Mac (no 3000 on the tablet).
      proxy: {
        "/api": {
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
