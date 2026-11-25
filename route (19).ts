import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiSession, assertOrderAccess, HttpError } from "@/lib/auth";
import { handler } from "@/lib/http";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Descarga/visualización de un documento con control de acceso por tenant y cliente */
export const GET = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession();
  const d = db.query.documents.findFirst({ where: eq(schema.documents.id, params.id) }).sync();
  if (!d) throw new HttpError(404, "Documento no encontrado");
  assertOrderAccess(s, d.orderId);
  const data = await readFile(d.storagePath);
  const inline = new URL(req.url).searchParams.get("download") !== "1";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": d.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(d.fileName)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
