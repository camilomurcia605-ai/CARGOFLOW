import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Driver local. Para producción, implementar la misma interfaz con S3/GCS/Azure Blob.
const root = () => path.resolve(process.env.STORAGE_DIR || "./storage/uploads");

export async function saveFile(prefix: string, fileName: string, data: Buffer) {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-120);
  const rel = path.join(prefix, `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${safe}`);
  const abs = path.join(root(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}

export async function readFile(rel: string) {
  const abs = path.join(root(), rel);
  if (!abs.startsWith(root())) throw new Error("Ruta inválida");
  return fs.readFile(abs);
}
