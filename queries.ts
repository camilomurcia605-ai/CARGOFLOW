import { and, asc, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import { db, schema } from "./db";
import { orderScope, type Session } from "./auth";
import { orderWith, toSnapshot } from "./orders";
import { detectAnomalies, isStatus } from "./domain";

export type OrderFilters = { status?: string; q?: string; incident?: string; clientId?: string; from?: Date; to?: Date };

/** Consulta de órdenes para vistas de servidor (respeta tenant y cliente) */
export function listOrders(s: Session, f: OrderFilters = {}, order: "loadAsc" | "loadDesc" = "loadDesc") {
  const O = schema.serviceOrders;
  const c: SQL[] = [orderScope(s)];
  if (f.status && isStatus(f.status)) c.push(eq(O.status, f.status));
  if (f.incident === "1") c.push(eq(O.hasIncident, true));
  if (f.clientId && s.role !== "CLIENTE") c.push(eq(O.clientId, f.clientId));
  if (f.from) c.push(gte(O.loadDate, f.from));
  if (f.to) c.push(lte(O.loadDate, f.to));
  if (f.q) {
    const q = `%${f.q}%`;
    c.push(or(like(O.code, q), like(O.originCity, q), like(O.destinationCity, q), like(O.purchaseOrderNumber, q), like(O.remesaNumber, q), like(O.cargoDescription, q))!);
  }
  return db.query.serviceOrders
    .findMany({ where: and(...c), with: orderWith, orderBy: order === "loadAsc" ? asc(O.loadDate) : desc(O.loadDate), limit: 500 })
    .sync()
    .map((o) => ({ ...o, anomalies: detectAnomalies(toSnapshot(o)) }));
}
export type ListedOrder = ReturnType<typeof listOrders>[number];

export function statusCounts(s: Session) {
  const rows = listOrders(s);
  const counts: Record<string, number> = { ALL: rows.length, INCIDENT: rows.filter((r) => r.hasIncident && !["CUMPLIDA", "FACTURADA", "CANCELADA"].includes(r.status)).length };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export function tenantMasters(tenantId: string) {
  return {
    clients: db.select().from(schema.clients).where(eq(schema.clients.tenantId, tenantId)).orderBy(asc(schema.clients.name)).all(),
    vehicles: db.select().from(schema.vehicles).where(eq(schema.vehicles.tenantId, tenantId)).orderBy(asc(schema.vehicles.plate)).all(),
    drivers: db.select().from(schema.drivers).where(eq(schema.drivers.tenantId, tenantId)).orderBy(asc(schema.drivers.name)).all(),
  };
}

export function orderEvents(orderId: string, clientView: boolean) {
  const E = schema.trackingEvents;
  const rows = db.query.trackingEvents.findMany({ where: eq(E.orderId, orderId), orderBy: desc(E.createdAt), with: { createdBy: { columns: { name: true } } } }).sync();
  return clientView ? rows.filter((e) => e.visibleToClient) : rows;
}
