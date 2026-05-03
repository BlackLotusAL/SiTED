/* global process */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(frontendDir, "..");

export default async function globalSetup() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd run db:seed --workspace backend"]
      : ["run", "db:seed", "--workspace", "backend"];

  execFileSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://sited:sited_dev_password@127.0.0.1:5432/sited?schema=public"
    },
    stdio: "inherit"
  });
}
