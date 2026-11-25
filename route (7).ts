import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiSession, assertOrderAccess } from "@/lib/auth";
import { handler } from "@/lib/http";
import { getOrderFull, toSnapshot } from "@/lib/orders";
import { detectAnomalies } from "@/lib/domain";
import { auditDocumentsWithAI } from "@/lib/ai";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Auditoría de coherencia documental: reglas + IA sobre OC, remesa, cumplido y factura */
export const POST = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "FACTURACION", "DESPACHO"]);
  assertOrderAccess(s, params.id);
  const o = getOrderFull(params.id);
  const rules = detectAnomalies(toSnapshot(o));
  const docs = db.query.documents.findMany({ where: eq(schema.documents.orderId, o.id) }).sync()
    .filter((d) => ["ORDEN_COMPRA", "REMESA", "CUMPLIDO", "ACTA_ENTREGA", "FACTURA", "MANIFIESTO"].includes(d.type));
  const loaded = await Promise.all(docs.map(async (d) => ({ type: d.type, name: d.fileName, mimeType: d.mimeType, data: await readFile(d.storagePath) })));
  const ai = await auditDocumentsWithAI(
    {
      codigo: o.code, cliente: o.client.name, nit: o.client.nit, origen: o.originCity, destino: o.destinationCity, peso_kg: o.weightKg,
      unidades: o.packages, flete: o.rate, oc: o.purchaseOrderNumber, pedido: o.customerOrderNumber, remesa: o.remesaNumber,
      manifiesto: o.manifiestoNumber, factura: o.invoice,
    },
    loaded,
  );
  return NextResponse.json({ rules, ai });
});
