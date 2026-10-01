import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Check failed with exit code ${code}.`)));
  });
}
try {
  await run(["node_modules/typescript/bin/tsc", "--build"]);
  for (const directory of ["artifacts/api-server", "artifacts/n8n-automation", "artifacts/mockup-sandbox", "scripts"]) {
    const config = `${directory}/tsconfig.json`;
    try { await access(path.join(root, config)); } catch { continue; }
    await run(["node_modules/typescript/bin/tsc", "-p", config, "--noEmit"]);
  }
  if (process.argv.includes("--build")) {
    await run(["artifacts/api-server/build.mjs"]);
    await run(["artifacts/n8n-automation/node_modules/vite/bin/vite.js", "build", "--config", "artifacts/n8n-automation/vite.config.ts"]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
