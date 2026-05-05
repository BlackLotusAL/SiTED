import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(frontendDir, "..");
const npmRun = process.platform === "win32" ? "npm.cmd run" : "npm run";
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: `${npmRun} dev:backend`,
      cwd: repoRoot,
      env: {
        DATABASE_URL: "postgresql://sited:sited_dev_password@127.0.0.1:5432/sited?schema=public",
        ALLOWED_CIDR: "10.0.0.0/8,127.0.0.1/32",
        TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
        SYSTEM_ADMIN_IPS: "127.0.0.1,10.42.18.36",
        UPLOAD_ROOT: resolve(repoRoot, "backend", "uploads"),
        EXAM_CONFIG_PATH: resolve(repoRoot, "backend", "config", "exam-paper-config.yaml"),
        PORT: "3000"
      },
      url: "http://127.0.0.1:3000/api/me",
      reuseExistingServer,
      timeout: 120000
    },
    {
      command: `${npmRun} dev:frontend -- --host 127.0.0.1 --port 5174`,
      cwd: repoRoot,
      url: "http://127.0.0.1:5174",
      reuseExistingServer,
      timeout: 120000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
