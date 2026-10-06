#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerDirectory = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(workerDirectory, "wrangler.toml");
const result = spawnSync(
  "pnpm",
  ["--package=wrangler", "dlx", "wrangler", "deploy", "--config", configPath],
  { cwd: workerDirectory, stdio: "inherit", env: process.env },
);

if (result.error) {
  throw new Error(`Could not start Wrangler: ${result.error.message}`);
}
process.exitCode = result.status ?? 1;
