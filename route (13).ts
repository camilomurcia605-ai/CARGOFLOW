import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError, type Session } from "@/lib/auth";
import { handler } from "@/lib/http";
import { addTrackingEvent } from "@/lib/orders";

export const dynamic = "force-dynamic";

/**
 * Webhook de entrada para anclar eventos desde GPS, app del conductor, n8n, etc.
 * Header:  X-Api-Key: <INBOUND_API_KEY>
 * Body:    { tenantNit, orderCode, type, description?, location?, lat?, lng? }
 */
export const POST = handler(async (req: Request) => {
  const key = process.env.INBOUND_API_KEY;
  if (!key || req.headers.get("x-api-key") !== key) throw new HttpError(401, "API key inválida");
  const body = z.object({ tenantNit: z.string(), orderCode: z.string() }).passthrough().parse(await req.json());
  const tenant = db.query.tenants.findFirst({ where: eq(schema.tenants.nit, body.tenantNit) }).sync();
  if (!tenant) throw new HttpError(404, "Empresa no encontrada");
  const order = db.query.serviceOrders.findFirst({ where: and(eq(schema.serviceOrders.tenantId, tenant.id), eq(schema.serviceOrders.code, body.orderCode)) }).sync();
  if (!order) throw new HttpError(404, "Orden no encontrada");
  const system: Session = { userId: "", tenantId: tenant.id, role: "DESPACHO", clientId: null, name: "Integración", email: "integracion@sistema" };
  return NextResponse.json(await addTrackingEvent(system, order.id, body), { status: 201 });
});
