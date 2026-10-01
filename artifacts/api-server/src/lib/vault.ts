import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

let keyPromise: Promise<Buffer> | undefined;
function key(): Promise<Buffer> {
  return keyPromise ??= (async () => {
    if (process.env.CREDENTIAL_ENCRYPTION_KEY) {
      const supplied = process.env.CREDENTIAL_ENCRYPTION_KEY;
      if (!/^[0-9a-f]{64}$/i.test(supplied)) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 64 hexadecimal characters.");
      return Buffer.from(supplied, "hex");
    }
    if (process.env.LOCAL_MODE !== "true") throw new Error("Set CREDENTIAL_ENCRYPTION_KEY before storing credentials.");
    const directory = path.resolve(process.env.LOCAL_DATA_DIR ?? ".local/data", "..");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, "credential.key");
    try { await writeFile(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return Buffer.from((await readFile(file, "utf8")).trim(), "hex");
  })();
}
export async function sealCredential(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return { version: 1, ciphertext: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export async function openCredential(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (data.version !== 1 || typeof data.ciphertext !== "string") throw new Error("Legacy plaintext credential: recreate it through the Credentials page.");
  const decipher = createDecipheriv("aes-256-gcm", await key(), Buffer.from(String(data.iv), "base64"));
  decipher.setAuthTag(Buffer.from(String(data.tag), "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
