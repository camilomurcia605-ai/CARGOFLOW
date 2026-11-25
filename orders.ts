import { z } from "zod";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { HttpError, type Session } from "./auth";
import {
  canTransition,
  checklistFor,
  detectAnomalies,
  STATUS_LABEL,
  EVENT_LABEL,
  TRANSITIONS,
  type EventType,
  type OrderSnapshot,
  type Status,
} from "./domain";
import { notifyOrderEvent } from "./notify";

const O = schema.serviceOrders;

/** Relaciones que se cargan con una orden "completa" */
export const orderWith = {
  client: true,
  vehicle: true,
  driver: true,
  invoice: true,
  documents: { columns: { id: true, type: true, fileName: true, mimeType: true, size: true, createdAt: true } },
} as const;

export function getOrderFull(id: string) {
  const o = db.query.serviceOrders.findFirst({ where: eq(O.id, id), with: orderWith }).sync();
  if (!o) throw new HttpError(404, "Orden no encontrada");
  return o;
}
export type OrderFull = ReturnType<typeof getOrderFull>;

export function toSnapshot(o: OrderFull): OrderSnapshot {
  return {
    status: o.status,
    clientNit: o.client.nit,
    originCity: o.originCity,
    destinationCity: o.destinationCity,
    loadDate: o.loadDate,
    deliveryDate: o.deliveryDate,
    weightKg: o.weightKg,
    vehicleId: o.vehicleId,
    driverId: o.driverId,
    vehicleCapacityKg: o.vehicle?.capacityKg ?? null,
    remesaNumber: o.remesaNumber,
    manifiestoNumber: o.manifiestoNumber,
    purchaseOrderNumber: o.purchaseOrderNumber,
    rate: o.rate,
    docTypes: o.documents.map((d) => d.type),
    clientRequiredDocs: o.client.requiredDocs ?? [],
    clientRequiresPO: o.client.requiresPO,
    invoice: o.invoice
      ? { number: o.invoice.number, subtotal: o.invoice.subtotal, total: o.invoice.total, purchaseOrderRef: o.invoice.purchaseOrderRef, remesaRef: o.invoice.remesaRef }
      : null,
  };
}

const FLOW: Status[] = ["PREALERTADA", "EN_CONSECUCION", "ASIGNADA", "EN_RUTA", "CUMPLIDA", "FACTURADA"];

/** Orden + anomalías + checklist de los siguientes pasos */
export function enrich(o: OrderFull) {
  const snap = toSnapshot(o);
  const cur = FLOW.indexOf(o.status as Status);
  const next = (TRANSITIONS[o.status as Status] ?? []).filter((s) => FLOW.indexOf(s) > cur);
  return { ...o, anomalies: detectAnomalies(snap), nextChecklists: next.map((s) => ({ status: s, items: checklistFor(s, snap) })) };
}

// ---------------------------------------------------------------------------
// Validación de entrada (compartida por formulario, portal e IA)
// ---------------------------------------------------------------------------
const optStr = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const optNum = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v == null ? null : Number(v)))
  .refine((v) => v == null || !Number.isNaN(v), "Número inválido");
const optDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v == null || !Number.isNaN(v.getTime()), "Fecha inválida");

export const orderInputSchema = z.object({
  clientId: z.string().min(1, "Cliente requerido"),
  originCity: z.string().trim().min(2, "Origen requerido"),
  originAddress: optStr,
  destinationCity: z.string().trim().min(2, "Destino requerido"),
  destinationAddress: optStr,
  loadDate: z.coerce.date({ message: "Fecha de cargue requerida" }),
  loadWindow: optStr,
  deliveryDate: optDate,
  deliveryWindow: optStr,
  cargoType: optStr,
  cargoDescription: optStr,
  weightKg: optNum,
  volumeM3: optNum,
  packages: optNum,
  declaredValue: optNum,
  vehicleType: optStr,
  requirements: optStr,
  contactName: optStr,
  contactPhone: optStr,
  notes: optStr,
  rate: optNum,
  purchaseOrderNumber: optStr,
  customerOrderNumber: optStr,
});
export type OrderInput = z.infer<typeof orderInputSchema>;

/** "2026-11-27" se interpreta como mediodía local para evitar corrimientos de zona horaria */
function fixDateOnly(raw: unknown, key: string) {
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) (raw as Record<string, unknown>)[key] = `${v}T12:00:00-05:00`;
  }
}

export async function createOrder(s: Session, raw: unknown, source: "PORTAL_CLIENTE" | "COMERCIAL" | "IA") {
  fixDateOnly(raw, "loadDate");
  fixDateOnly(raw, "deliveryDate");
  const input = orderInputSchema.parse(raw);
  if (s.role === "CLIENTE" && input.clientId !== s.clientId) throw new HttpError(403, "Solo puedes crear órdenes para tu empresa");
  if (s.role === "CLIENTE") input.rate = null;
  const client = db.query.clients.findFirst({ where: and(eq(schema.clients.id, input.clientId), eq(schema.clients.tenantId, s.tenantId)) }).sync();
  if (!client) throw new HttpError(404, "Cliente no existe");

  // Control del plan de suscripción
  const tenant = db.query.tenants.findFirst({ where: eq(schema.tenants.id, s.tenantId) }).sync()!;
  if (tenant.subscriptionStatus === "SUSPENDIDA") throw new HttpError(402, "Suscripción suspendida");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const used = db.select({ n: sql<number>`count(*)` }).from(O).where(and(eq(O.tenantId, s.tenantId), gte(O.createdAt, monthStart))).get()!.n;
  if (used >= tenant.monthlyOrderLimit) throw new HttpError(402, `Límite mensual del plan ${tenant.plan} alcanzado (${tenant.monthlyOrderLimit} órdenes)`);

  const order = db.transaction((tx) => {
    const t = tx.update(schema.tenants).set({ orderSeq: sql`${schema.tenants.orderSeq} + 1` }).where(eq(schema.tenants.id, s.tenantId)).returning().get();
    const code = `OS-${String(t.orderSeq).padStart(6, "0")}`;
    const o = tx
      .insert(O)
      .values({
        ...input,
        packages: input.packages == null ? null : Math.round(input.packages),
        tenantId: s.tenantId,
        code,
        source,
        createdById: s.userId || null,
        status: "PREALERTADA",
      })
      .returning()
      .get();
    const via = source === "PORTAL_CLIENTE" ? "portal cliente" : source === "IA" ? "asistente IA" : "comercial/operaciones";
    tx.insert(schema.trackingEvents).values({ orderId: o.id, type: "CREADA", description: `Orden creada (${via}) por ${s.name}`, createdById: s.userId || null }).run();
    return o;
  });
  await notifyOrderEvent(order.id, "CREADA");
  return order;
}

export function updateOrder(s: Session, id: string, raw: Record<string, unknown>) {
  const o = getOrderFull(id);
  if (o.tenantId !== s.tenantId || (s.role === "CLIENTE" && o.clientId !== s.clientId)) throw new HttpError(404, "Orden no encontrada");
  if (s.role === "CLIENTE" && o.status !== "PREALERTADA") throw new HttpError(409, "Solo puedes editar órdenes prealertadas; contacta a despacho.");
  if (["FACTURADA", "CANCELADA"].includes(o.status)) throw new HttpError(409, "La orden está cerrada");
  fixDateOnly(raw, "loadDate");
  fixDateOnly(raw, "deliveryDate");
  const data = orderInputSchema.partial().extend({ remesaNumber: optStr, manifiestoNumber: optStr }).parse(raw);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (k in raw) clean[k] = v; // solo campos enviados
  delete clean.clientId;
  if (s.role === "CLIENTE") for (const k of ["rate", "remesaNumber", "manifiestoNumber"]) delete clean[k];
  if (typeof clean.packages === "number") clean.packages = Math.round(clean.packages);
  if (!Object.keys(clean).length) return o;
  return db.update(O).set(clean).where(eq(O.id, id)).returning().get();
}

// ---------------------------------------------------------------------------
// Transiciones de estado
// ---------------------------------------------------------------------------
const STATUS_EVENT: Partial<Record<Status, EventType>> = { EN_RUTA: "SALIDA_ORIGEN", CUMPLIDA: "CUMPLIDO", FACTURADA: "FACTURADA", CANCELADA: "CANCELADA" };

export async function transitionOrder(s: Session, id: string, to: Status, note?: string, location?: string) {
  const o = getOrderFull(id);
  if (o.tenantId !== s.tenantId) throw new HttpError(404, "Orden no encontrada");
  const check = canTransition(o.status as Status, to, s.role, toSnapshot(o));
  if (!check.allowed) throw new HttpError(409, "No se puede cambiar el estado", { reasons: check.reasons, checklist: check.checklist });

  const now = new Date();
  const stamp: Partial<typeof O.$inferInsert> = { status: to };
  if (to === "ASIGNADA") stamp.assignedAt = now;
  if (to === "EN_RUTA") stamp.departedAt = now;
  if (to === "CUMPLIDA") {
    stamp.completedAt = now;
    stamp.hasIncident = false; // la novedad queda en el historial; el servicio cerró
    if (!o.arrivedAt) stamp.arrivedAt = now;
  }
  if (to === "FACTURADA") stamp.invoicedAt = now;
  const evType = STATUS_EVENT[to] ?? "CAMBIO_ESTADO";

  db.transaction((tx) => {
    tx.update(O).set(stamp).where(eq(O.id, id)).run();
    tx.insert(schema.trackingEvents)
      .values({
        orderId: id,
        type: evType,
        description: note?.trim() || `${STATUS_LABEL[o.status as Status]} → ${STATUS_LABEL[to]}`,
        location: location ?? null,
        createdById: s.userId || null,
        visibleToClient: to !== "EN_CONSECUCION",
      })
      .run();
  });
  if (STATUS_EVENT[to]) await notifyOrderEvent(id, evType, note);
  return { ok: true, checklist: check.checklist };
}

export async function assignResources(s: Session, id: string, vehicleId: string, driverId: string) {
  const o = getOrderFull(id);
  if (o.tenantId !== s.tenantId) throw new HttpError(404, "Orden no encontrada");
  if (!["PREALERTADA", "EN_CONSECUCION", "ASIGNADA"].includes(o.status)) throw new HttpError(409, "Solo se puede asignar antes de que el vehículo salga a ruta");
  const v = db.query.vehicles.findFirst({ where: and(eq(schema.vehicles.id, vehicleId), eq(schema.vehicles.tenantId, s.tenantId), eq(schema.vehicles.active, true)) }).sync();
  const d = db.query.drivers.findFirst({ where: and(eq(schema.drivers.id, driverId), eq(schema.drivers.tenantId, s.tenantId), eq(schema.drivers.active, true)) }).sync();
  if (!v || !d) throw new HttpError(404, "Vehículo o conductor no encontrado");

  // Asignar equivale a cerrar la consecución: se valida el gate de ASIGNADA
  const check = canTransition("EN_CONSECUCION", "ASIGNADA", s.role, { ...toSnapshot(o), vehicleId, driverId, vehicleCapacityKg: v.capacityKg });
  if (!check.allowed) throw new HttpError(409, "No se puede asignar", { reasons: check.reasons });

  const clash = db
    .select({ code: O.code })
    .from(O)
    .where(and(eq(O.tenantId, s.tenantId), eq(O.vehicleId, vehicleId), ne(O.id, id), inArray(O.status, ["ASIGNADA", "EN_RUTA"])))
    .get();

  db.transaction((tx) => {
    tx.update(O).set({ vehicleId, driverId, status: "ASIGNADA", assignedAt: new Date() }).where(eq(O.id, id)).run();
    tx.insert(schema.trackingEvents).values({ orderId: id, type: "ASIGNACION", description: `Vehículo ${v.plate} (${v.type}) · Conductor ${d.name}`, createdById: s.userId || null }).run();
  });
  await notifyOrderEvent(id, "ASIGNACION");
  return { ok: true, warning: clash ? `Atención: el vehículo ${v.plate} también está activo en ${clash.code}` : null };
}

// ---------------------------------------------------------------------------
// Eventos de monitoreo
// ---------------------------------------------------------------------------
export const eventInputSchema = z.object({
  type: z.enum(["SALIDA_ORIGEN", "PUNTO_CONTROL", "NOVEDAD", "RETRASO", "LLEGADA_DESTINO"]),
  description: z.string().trim().optional().default(""),
  location: z.string().trim().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  visibleToClient: z.boolean().optional().default(true),
});

export async function addTrackingEvent(s: Session, id: string, raw: unknown) {
  const ev = eventInputSchema.parse(raw);
  const o = getOrderFull(id);
  if (o.tenantId !== s.tenantId) throw new HttpError(404, "Orden no encontrada");

  // La salida de origen mueve automáticamente la orden a EN_RUTA (respetando el checklist)
  if (ev.type === "SALIDA_ORIGEN") return transitionOrder(s, id, "EN_RUTA", ev.description || "Salida de origen confirmada", ev.location ?? undefined);

  const incidentOk = ["NOVEDAD", "RETRASO"].includes(ev.type) && o.status === "ASIGNADA";
  if (o.status !== "EN_RUTA" && !incidentOk) throw new HttpError(409, "Este evento solo aplica a órdenes en ruta");

  const patch: Partial<typeof O.$inferInsert> = {};
  if (ev.type === "NOVEDAD" || ev.type === "RETRASO") patch.hasIncident = true;
  if (ev.type === "LLEGADA_DESTINO") patch.arrivedAt = new Date();

  db.transaction((tx) => {
    if (Object.keys(patch).length) tx.update(O).set(patch).where(eq(O.id, id)).run();
    tx.insert(schema.trackingEvents)
      .values({
        orderId: id,
        type: ev.type,
        description: ev.description || EVENT_LABEL[ev.type],
        location: ev.location ?? null,
        lat: ev.lat ?? null,
        lng: ev.lng ?? null,
        visibleToClient: ev.visibleToClient,
        createdById: s.userId || null,
      })
      .run();
  });
  if (ev.visibleToClient || ev.type !== "PUNTO_CONTROL") await notifyOrderEvent(id, ev.type, [ev.description, ev.location].filter(Boolean).join(" · "));
  return { ok: true };
}

export function resolveIncident(s: Session, id: string, note?: string) {
  const o = getOrderFull(id);
  if (o.tenantId !== s.tenantId) throw new HttpError(404, "Orden no encontrada");
  db.transaction((tx) => {
    tx.update(O).set({ hasIncident: false }).where(eq(O.id, id)).run();
    tx.insert(schema.trackingEvents).values({ orderId: id, type: "PUNTO_CONTROL", description: `Novedad resuelta${note ? `: ${note}` : ""}`, createdById: s.userId || null }).run();
  });
  return { ok: true };
}
