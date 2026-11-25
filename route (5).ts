import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiSession, assertOrderAccess, HttpError } from "@/lib/auth";
import { handler } from "@/lib/http";
import { getOrderFull } from "@/lib/orders";

export const dynamic = "force-dynamic";

const invoiceSchema = z.object({
  number: z.string().trim().min(1, "Número de factura requerido"),
  issueDate: z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00-05:00` : v), z.coerce.date()),
  subtotal: z.coerce.number().positive(),
  tax: z.coerce.number().min(0).default(0),
  purchaseOrderRef: z.string().trim().optional().nullable(),
  remesaRef: z.string().trim().optional().nullable(),
});

/** POST: registra (o actualiza) la factura emitida de una orden cumplida */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "FACTURACION"]);
  assertOrderAccess(s, params.id);
  const o = getOrderFull(params.id);
  if (!["CUMPLIDA", "FACTURADA"].includes(o.status)) throw new HttpError(409, "Solo se factura una orden cumplida");
  const inv = invoiceSchema.parse(await req.json());
  const dueDate = new Date(inv.issueDate.getTime() + o.client.paymentTermsDays * 86400000);
  const values = {
    ...inv,
    purchaseOrderRef: inv.purchaseOrderRef || null,
    remesaRef: inv.remesaRef || null,
    total: inv.subtotal + inv.tax,
    dueDate,
  };
  const row = o.invoice
    ? db.update(schema.invoices).set(values).where(eq(schema.invoices.id, o.invoice.id)).returning().get()
    : db.insert(schema.invoices).values({ ...values, orderId: o.id }).returning().get();
  return NextResponse.json(row, { status: o.invoice ? 200 : 201 });
});

/** PATCH { status: ENVIADA | PAGADA | ANULADA } — seguimiento de cartera */
export const PATCH = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "FACTURACION"]);
  assertOrderAccess(s, params.id);
  const { status } = z.object({ status: z.enum(["EMITIDA", "ENVIADA", "PAGADA", "ANULADA"]) }).parse(await req.json());
  const o = getOrderFull(params.id);
  if (!o.invoice) throw new HttpError(404, "La orden no tiene factura");
  const row = db.update(schema.invoices).set({ status, paidAt: status === "PAGADA" ? new Date() : null }).where(eq(schema.invoices.id, o.invoice.id)).returning().get();
  return NextResponse.json(row);
});
