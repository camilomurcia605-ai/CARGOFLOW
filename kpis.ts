import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { ACTIVE_STATUSES, checklistFor, detectAnomalies, endOfDay } from "./domain";
import { orderWith, toSnapshot } from "./orders";

/** KPIs operativos, de facturación y de suscripción. Si se pasa clientId, se limita a ese cliente (portal). */
export function computeKpis(tenantId: string, clientId?: string | null) {
  const O = schema.serviceOrders;
  const where = clientId ? and(eq(O.tenantId, tenantId), eq(O.clientId, clientId)) : eq(O.tenantId, tenantId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Para el volumen de un MVP es eficiente traer las órdenes y calcular en memoria;
  // a escala se reemplaza por vistas materializadas / consultas agregadas.
  const orders = db.query.serviceOrders.findMany({ where, with: orderWith }).sync();

  const byStatus: Record<string, number> = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  const active = orders.filter((o) => (ACTIVE_STATUSES as string[]).includes(o.status));
  const delivered = orders.filter((o) => ["CUMPLIDA", "FACTURADA"].includes(o.status) && o.completedAt);
  const withPromise = delivered.filter((o) => o.deliveryDate && o.arrivedAt);
  const onTime = withPromise.filter((o) => o.arrivedAt! <= endOfDay(o.deliveryDate!)).length;
  const lags = delivered.filter((o) => o.invoicedAt && o.completedAt).map((o) => (o.invoicedAt!.getTime() - o.completedAt!.getTime()) / 86400000);
  const pendingInvoice = orders.filter((o) => o.status === "CUMPLIDA");
  const pendingDocs = pendingInvoice.filter((o) =>
    checklistFor("FACTURADA", toSnapshot(o)).some((c) => c.level === "required" && !c.ok && !["factura_reg", "factura_doc"].includes(c.key)),
  );
  const invoices = orders.map((o) => o.invoice).filter((i): i is NonNullable<typeof i> => !!i && i.status !== "ANULADA");
  const invMonth = invoices.filter((i) => i.issueDate >= monthStart);
  const open = invoices.filter((i) => i.status === "EMITIDA" || i.status === "ENVIADA");
  const overdue = open.filter((i) => i.dueDate < now);

  const anomalyOrders = [...active, ...pendingInvoice]
    .map((o) => ({ id: o.id, code: o.code, client: o.client.name, status: o.status, anomalies: detectAnomalies(toSnapshot(o), now) }))
    .filter((x) => x.anomalies.length)
    .sort((a, b) => b.anomalies.filter((x) => x.severity === "error").length - a.anomalies.filter((x) => x.severity === "error").length);

  const tenant = db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }).sync();
  const usedMonth = db.select({ n: sql<number>`count(*)` }).from(O).where(and(eq(O.tenantId, tenantId), gte(O.createdAt, monthStart))).get()!.n;
  const usersN = db.select({ n: sql<number>`count(*)` }).from(schema.users).where(eq(schema.users.tenantId, tenantId)).get()!.n;

  // Serie de los últimos 14 días: órdenes por fecha de cargue
  const series: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ day: key, count: orders.filter((o) => o.loadDate.toISOString().slice(0, 10) === key).length });
  }

  return {
    byStatus,
    active: active.length,
    enRuta: byStatus.EN_RUTA ?? 0,
    prealertadas: byStatus.PREALERTADA ?? 0,
    enConsecucion: byStatus.EN_CONSECUCION ?? 0,
    incidents: active.filter((o) => o.hasIncident).length,
    onTimeRate: withPromise.length ? onTime / withPromise.length : null,
    deliveredCount: delivered.length,
    pendingInvoiceCount: pendingInvoice.length,
    pendingInvoiceValue: pendingInvoice.reduce((a, o) => a + (o.rate ?? 0), 0),
    pendingDocsCount: pendingDocs.length,
    invoicedMonth: invMonth.reduce((a, i) => a + i.total, 0),
    invoicedMonthCount: invMonth.length,
    receivables: open.reduce((a, i) => a + i.total, 0),
    receivablesCount: open.length,
    overdueCount: overdue.length,
    avgDaysToInvoice: lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : null,
    anomalyOrders,
    series,
    subscription: tenant
      ? { plan: tenant.plan, status: tenant.subscriptionStatus, limit: tenant.monthlyOrderLimit, used: usedMonth, users: usersN, association: tenant.association, name: tenant.name }
      : null,
  };
}
export type Kpis = ReturnType<typeof computeKpis>;
