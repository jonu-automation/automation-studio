import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, LOCAL_MODE: "true", VITE_LOCAL_MODE: "true", NODE_ENV: "development", LOCAL_DATA_DIR: path.join(root, ".local/data"), MIGRATIONS_DIR: path.join(root, "lib/db/migrations") };
const children = [];
let stopping = false;
for (const port of [3000, 8080]) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is occupied. Stop the existing app before starting another copy.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
function run(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: "inherit" });
  children.push(child);
  child.on("exit", code => { if (!stopping) { stop(); process.exitCode = code ?? 1; } });
  return child;
}
function stop() { stopping = true; for (const child of children) child.kill(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
run(["--import", "tsx", "artifacts/api-server/src/index.ts"], { PORT: "8080" });
run(["artifacts/n8n-automation/node_modules/vite/bin/vite.js", "--config", "artifacts/n8n-automation/vite.config.ts"], { PORT: "3000" });
console.log("Starting Automation Studio: http://127.0.0.1:3000 — data persists in .local/data. Press Ctrl+C to stop.");
