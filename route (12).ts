import { NextResponse } from "next/server";
import { apiSession, assertOrderAccess, HttpError } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { handler } from "@/lib/http";
import { saveFile } from "@/lib/storage";
import { DOC_LABEL, DOC_TYPES, type DocType } from "@/lib/domain";
import { getOrderFull } from "@/lib/orders";

export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024;
const CLIENT_ALLOWED: DocType[] = ["ORDEN_COMPRA", "OTRO"];

/** POST multipart: type=<DocType>, file=<archivo> (admite múltiples "file") */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession();
  assertOrderAccess(s, params.id);
  const form = await req.formData();
  const type = String(form.get("type") || "") as DocType;
  if (!DOC_TYPES.includes(type)) throw new HttpError(422, "Tipo de documento inválido");
  if (s.role === "CLIENTE" && !CLIENT_ALLOWED.includes(type)) throw new HttpError(403, "Como cliente solo puedes adjuntar orden de compra u otros soportes");
  const order = getOrderFull(params.id);
  const files = form.getAll("file").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  if (!files.length) throw new HttpError(422, "Adjunta al menos un archivo");
  const created = [];
  for (const f of files) {
    if (f.size > MAX) throw new HttpError(413, `${f.name} supera 15 MB`);
    const path = await saveFile(`${order.tenantId}/${order.id}`, f.name, Buffer.from(await f.arrayBuffer()));
    created.push(
      db.insert(schema.documents).values({ orderId: order.id, type, fileName: f.name, mimeType: f.type || "application/octet-stream", size: f.size, storagePath: path, uploadedById: s.userId }).returning().get(),
    );
  }
  db.insert(schema.trackingEvents).values({ orderId: order.id, type: "DOCUMENTO", description: `${DOC_LABEL[type]} cargado (${files.length})`, createdById: s.userId, visibleToClient: type !== "OTRO" }).run();
  if (["CUMPLIDO", "ACTA_ENTREGA", "FOTO_DESCARGUE"].includes(type))
    db.insert(schema.notifications).values({ tenantId: order.tenantId, audience: "CLIENTE", clientId: order.clientId, orderId: order.id, title: `${order.code} · ${DOC_LABEL[type]} disponible`, body: "Ya puedes descargarlo desde el portal." }).run();
  if (s.role === "CLIENTE")
    db.insert(schema.notifications).values({ tenantId: order.tenantId, audience: "DESPACHO", orderId: order.id, title: `${order.code} · Cliente adjuntó ${DOC_LABEL[type]}`, body: files.map((f) => f.name).join(", ") }).run();
  return NextResponse.json(created, { status: 201 });
});
