import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const files = walk(src);
if (files.length === 0) {
  console.error("No test files found under src/");
  process.exit(1);
}

const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const result = spawnSync(process.execPath, [tsxCli, "--test", ...files], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
