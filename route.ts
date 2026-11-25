import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/http";
import { extractOrders, type DraftOrder, type InputFile } from "@/lib/ai";

export const dynamic = "force-dynamic";

const MAX_FILE = 10 * 1024 * 1024;

/**
 * POST multipart:
 *  - text: mensaje libre / correo / WhatsApp pegado (opcional)
 *  - draft: JSON con el borrador actual (para conversación iterativa)
 *  - files: archivos (PDF, imágenes, CSV/TXT)
 * Devuelve borradores normalizados + campos faltantes + preguntas. NO crea órdenes (requiere confirmación).
 */
export const POST = handler(async (req: Request) => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "CLIENTE"]);
  const form = await req.formData();
  const text = String(form.get("text") || "").slice(0, 20000);
  let draft: DraftOrder[] | null = null;
  try {
    draft = form.get("draft") ? JSON.parse(String(form.get("draft"))) : null;
  } catch {}
  const files: InputFile[] = [];
  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    if (f.size > MAX_FILE) throw new HttpError(413, `${f.name} supera 10 MB`);
    files.push({ name: f.name, mimeType: f.type || guessMime(f.name), data: Buffer.from(await f.arrayBuffer()) });
  }
  if (!text.trim() && !files.length && !draft) throw new HttpError(422, "Escribe un mensaje o adjunta un archivo");

  const clients = db.query.clients.findMany({ where: eq(schema.clients.tenantId, s.tenantId) }).sync();
  const own = s.role === "CLIENTE" ? clients.find((c) => c.id === s.clientId) : null;
  const result = await extractOrders({ text, files, draft, clientHint: own ? `${own.name} (NIT ${own.nit})` : null });

  // Emparejar cliente por NIT o nombre
  const norm = (x?: string | null) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const matched = result.orders.map((o) => {
    if (own) return own.id;
    const byNit = o.clientNit && clients.find((c) => norm(c.nit).startsWith(norm(o.clientNit).slice(0, 9)));
    if (byNit) return byNit.id;
    const byName = o.clientName && clients.find((c) => norm(c.name).includes(norm(o.clientName).slice(0, 10)) || norm(o.clientName).includes(norm(c.name).slice(0, 10)));
    return byName ? byName.id : null;
  });

  const log = db
    .insert(schema.aiExtractions)
    .values({ tenantId: s.tenantId, userId: s.userId, provider: result.provider, inputText: text, fileNames: files.map((f) => f.name), result })
    .returning({ id: schema.aiExtractions.id })
    .get();

  return NextResponse.json({ ...result, clientIds: matched, extractionId: log.id });
});

function guessMime(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", csv: "text/csv", txt: "text/plain", tsv: "text/tab-separated-values" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}
