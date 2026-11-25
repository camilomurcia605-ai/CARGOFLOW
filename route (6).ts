import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiSession, assertOrderAccess } from "@/lib/auth";
import { handler } from "@/lib/http";
import { enrich, getOrderFull, updateOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const s = await apiSession();
  assertOrderAccess(s, params.id);
  const o = enrich(getOrderFull(params.id));
  let events = db.query.trackingEvents.findMany({ where: eq(schema.trackingEvents.orderId, params.id), orderBy: asc(schema.trackingEvents.createdAt) }).sync();
  if (s.role === "CLIENTE") events = events.filter((e) => e.visibleToClient);
  const out = s.role === "CLIENTE" ? { ...o, rate: undefined, anomalies: [] } : o;
  return NextResponse.json({ ...out, events });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "CLIENTE"]);
  assertOrderAccess(s, params.id);
  return NextResponse.json(updateOrder(s, params.id, await req.json()));
});
