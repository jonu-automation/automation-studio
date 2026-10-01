import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate", "--config", "drizzle.generate.config.ts"], {
  cwd: path.join(root, "lib/db"),
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
