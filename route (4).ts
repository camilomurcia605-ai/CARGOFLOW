import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiSession, orderScope } from "@/lib/auth";
import { handler } from "@/lib/http";
import { createOrder } from "@/lib/orders";
import { detectAnomalies, isStatus } from "@/lib/domain";
import { orderWith, toSnapshot } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** GET /api/orders?status=EN_RUTA&clientId=...&q=texto&incident=1 */
export const GET = handler(async (req: NextRequest) => {
  const s = await apiSession();
  const O = schema.serviceOrders;
  const p = req.nextUrl.searchParams;
  const conds: SQL[] = [orderScope(s)];
  const st = p.get("status");
  if (st && isStatus(st)) conds.push(eq(O.status, st));
  if (p.get("clientId") && s.role !== "CLIENTE") conds.push(eq(O.clientId, p.get("clientId")!));
  if (p.get("incident") === "1") conds.push(eq(O.hasIncident, true));
  const q = p.get("q");
  if (q) conds.push(or(like(O.code, `%${q}%`), like(O.originCity, `%${q}%`), like(O.destinationCity, `%${q}%`), like(O.purchaseOrderNumber, `%${q}%`), like(O.remesaNumber, `%${q}%`))!);
  const rows = db.query.serviceOrders.findMany({ where: and(...conds), with: orderWith, orderBy: desc(O.loadDate), limit: 500 }).sync();
  return NextResponse.json(rows.map((o) => ({ ...o, anomalies: detectAnomalies(toSnapshot(o)) })));
});

/** POST /api/orders — crea una orden (comercial/operaciones o cliente desde el portal) */
export const POST = handler(async (req: Request) => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "CLIENTE"]);
  const body = await req.json();
  if (s.role === "CLIENTE") body.clientId = s.clientId;
  const order = await createOrder(s, body, s.role === "CLIENTE" ? "PORTAL_CLIENTE" : "COMERCIAL");
  return NextResponse.json(order, { status: 201 });
});
