import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(frontendRoot, "..");

export default defineConfig({
  root: frontendRoot,
  envDir: repoRoot,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000"
    }
  }
});
