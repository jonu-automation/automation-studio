import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Evaluate in a separate, time-limited process with no inherited credentials.
// This is a development safeguard, not a production multi-tenant sandbox.
const evaluator = `
const vm = require('node:vm');
let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
    const code = 'const input = JSON.parse(' + JSON.stringify(JSON.stringify(payload.input)) + '); const data = input; ' +
      (payload.condition ? 'JSON.stringify({ result: Boolean(' + payload.code + ') });' :
       'JSON.stringify((() => { ' + payload.code + '; return typeof output !== "undefined" ? output : data; })());');
    const result = vm.runInContext(code, context, { timeout: 500 });
    process.stdout.write(result ?? '{}');
  } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
});`;

export async function evaluate(code: string, input: Record<string, unknown>, condition = false): Promise<Record<string, unknown>> {
  const directory = await mkdtemp(path.join(tmpdir(), "automation-eval-"));
  const inputFile = path.join(directory, "input.json");
  const outputFile = path.join(directory, "output.json");
  const errorFile = path.join(directory, "error.txt");
  await writeFile(inputFile, JSON.stringify({ code, input, condition }), { mode: 0o600 });
  const handles = await Promise.all([open(inputFile, "r"), open(outputFile, "w", 0o600), open(errorFile, "w", 0o600)]);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--permission", "--disable-proto=throw", "--max-old-space-size=64", "-e", evaluator], {
        env: {}, stdio: handles.map(handle => handle.fd), windowsHide: true,
      });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 10000);
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("close", async status => {
        clearTimeout(timer);
        if (timedOut) { reject(new Error("Code execution timed out.")); return; }
        if (status !== 0) {
          const message = (await readFile(errorFile, "utf8")).slice(0, 4000);
          reject(new Error("Code execution failed: " + message));
          return;
        }
        resolve();
      });
    });
    const output = await readFile(outputFile, "utf8");
    if (output.length > 1_000_000) throw new Error("Code output exceeds 1 MB.");
    const result = JSON.parse(output);
    return result && typeof result === "object" ? result : { result };
  } finally {
    await Promise.all(handles.map(handle => handle.close()));
    await Promise.all([inputFile, outputFile, errorFile].map(file => unlink(file)));
    await rmdir(directory);
  }
}
