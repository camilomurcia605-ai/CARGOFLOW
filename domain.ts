// Reglas de negocio puras (sin dependencias de BD) — fácilmente testeables.

export const ROLES = ["ADMIN", "COMERCIAL", "DESPACHO", "FACTURACION", "CLIENTE"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = [
  "PREALERTADA",
  "EN_CONSECUCION",
  "ASIGNADA",
  "EN_RUTA",
  "CUMPLIDA",
  "FACTURADA",
  "CANCELADA",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  PREALERTADA: "Prealertada",
  EN_CONSECUCION: "En consecución",
  ASIGNADA: "Asignada",
  EN_RUTA: "En ruta",
  CUMPLIDA: "Cumplida",
  FACTURADA: "Facturada",
  CANCELADA: "Cancelada",
};

export const STATUS_COLOR: Record<Status, string> = {
  PREALERTADA: "bg-slate-100 text-slate-700 ring-slate-300",
  EN_CONSECUCION: "bg-amber-50 text-amber-800 ring-amber-300",
  ASIGNADA: "bg-indigo-50 text-indigo-700 ring-indigo-300",
  EN_RUTA: "bg-sky-50 text-sky-700 ring-sky-300",
  CUMPLIDA: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  FACTURADA: "bg-violet-50 text-violet-700 ring-violet-300",
  CANCELADA: "bg-rose-50 text-rose-700 ring-rose-300",
};

export const ACTIVE_STATUSES: Status[] = ["PREALERTADA", "EN_CONSECUCION", "ASIGNADA", "EN_RUTA"];

export const DOC_TYPES = [
  "FOTO_CARGUE",
  "FOTO_DESCARGUE",
  "CUMPLIDO",
  "REMESA",
  "ACTA_ENTREGA",
  "MANIFIESTO",
  "ORDEN_COMPRA",
  "FACTURA",
  "EVIDENCIA",
  "OTRO",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_LABEL: Record<DocType, string> = {
  FOTO_CARGUE: "Foto de cargue",
  FOTO_DESCARGUE: "Foto de descargue",
  CUMPLIDO: "Cumplido firmado",
  REMESA: "Remesa",
  ACTA_ENTREGA: "Acta de entrega",
  MANIFIESTO: "Manifiesto de carga",
  ORDEN_COMPRA: "Orden de compra",
  FACTURA: "Factura",
  EVIDENCIA: "Evidencia / novedad",
  OTRO: "Otro",
};

export const EVENT_TYPES = [
  "CREADA",
  "CAMBIO_ESTADO",
  "ASIGNACION",
  "SALIDA_ORIGEN",
  "PUNTO_CONTROL",
  "NOVEDAD",
  "RETRASO",
  "LLEGADA_DESTINO",
  "CUMPLIDO",
  "FACTURADA",
  "DOCUMENTO",
  "CANCELADA",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABEL: Record<EventType, string> = {
  CREADA: "Orden creada",
  CAMBIO_ESTADO: "Cambio de estado",
  ASIGNACION: "Vehículo asignado",
  SALIDA_ORIGEN: "Salida de origen",
  PUNTO_CONTROL: "Punto de control",
  NOVEDAD: "Novedad",
  RETRASO: "Retraso",
  LLEGADA_DESTINO: "Llegada a destino",
  CUMPLIDO: "Servicio cumplido",
  FACTURADA: "Factura emitida",
  DOCUMENTO: "Documento cargado",
  CANCELADA: "Cancelada",
};

/** Eventos que el área de despacho registra manualmente desde monitoreo */
export const MANUAL_EVENTS: EventType[] = ["SALIDA_ORIGEN", "PUNTO_CONTROL", "NOVEDAD", "RETRASO", "LLEGADA_DESTINO"];

export const VEHICLE_TYPES = ["TURBO", "SENCILLO", "DOBLETROQUE", "TRACTOMULA", "FURGON", "REFRIGERADO", "CAMA_BAJA"] as const;
export const CARGO_TYPES = ["GENERAL", "REFRIGERADA", "PELIGROSA", "GRANEL", "CONTENEDOR", "EXTRADIMENSIONADA"] as const;

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------
export const TRANSITIONS: Record<Status, Status[]> = {
  PREALERTADA: ["EN_CONSECUCION", "CANCELADA"],
  EN_CONSECUCION: ["ASIGNADA", "PREALERTADA", "CANCELADA"],
  ASIGNADA: ["EN_RUTA", "EN_CONSECUCION", "CANCELADA"],
  EN_RUTA: ["CUMPLIDA"],
  CUMPLIDA: ["FACTURADA"],
  FACTURADA: [],
  CANCELADA: [],
};

/** Quién puede mover a cada estado destino */
export const TRANSITION_ROLES: Record<Status, Role[]> = {
  PREALERTADA: ["ADMIN", "COMERCIAL", "DESPACHO"],
  EN_CONSECUCION: ["ADMIN", "DESPACHO", "COMERCIAL"],
  ASIGNADA: ["ADMIN", "DESPACHO"],
  EN_RUTA: ["ADMIN", "DESPACHO"],
  CUMPLIDA: ["ADMIN", "DESPACHO"],
  FACTURADA: ["ADMIN", "FACTURACION"],
  CANCELADA: ["ADMIN", "COMERCIAL", "DESPACHO"],
};

// ---------------------------------------------------------------------------
// Checklist documental por etapa (gates)
// ---------------------------------------------------------------------------
export type ChecklistItem = {
  key: string;
  label: string;
  level: "required" | "recommended";
  ok: boolean;
};

export type OrderSnapshot = {
  status: string;
  clientNit?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  loadDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  weightKg?: number | null;
  vehicleId?: string | null;
  driverId?: string | null;
  vehicleCapacityKg?: number | null;
  remesaNumber?: string | null;
  manifiestoNumber?: string | null;
  purchaseOrderNumber?: string | null;
  rate?: number | null;
  docTypes: string[];
  clientRequiredDocs?: string[];
  clientRequiresPO?: boolean;
  invoice?: { number: string; subtotal: number; total: number; purchaseOrderRef?: string | null; remesaRef?: string | null } | null;
};

const has = (o: OrderSnapshot, t: DocType) => o.docTypes.includes(t);

/** Lista de requisitos para poder pasar AL estado `target`. */
export function checklistFor(target: Status, o: OrderSnapshot): ChecklistItem[] {
  switch (target) {
    case "EN_CONSECUCION":
      return [
        { key: "origen", label: "Origen y destino definidos", level: "required", ok: !!o.originCity && !!o.destinationCity },
        { key: "fecha", label: "Fecha de cargue definida", level: "required", ok: !!o.loadDate },
      ];
    case "ASIGNADA":
      return [
        { key: "vehiculo", label: "Vehículo asignado", level: "required", ok: !!o.vehicleId },
        { key: "conductor", label: "Conductor asignado", level: "required", ok: !!o.driverId },
        {
          key: "capacidad",
          label: "Peso dentro de la capacidad del vehículo",
          level: "required",
          ok: !o.weightKg || !o.vehicleCapacityKg || o.weightKg <= o.vehicleCapacityKg,
        },
      ];
    case "EN_RUTA":
      return [
        { key: "remesa_n", label: "Número de remesa registrado", level: "required", ok: !!o.remesaNumber },
        { key: "manifiesto_n", label: "Número de manifiesto (RNDC) registrado", level: "recommended", ok: !!o.manifiestoNumber },
        { key: "foto_cargue", label: "Foto de cargue", level: "recommended", ok: has(o, "FOTO_CARGUE") },
      ];
    case "CUMPLIDA":
      return [
        {
          key: "cumplido",
          label: "Cumplido firmado o acta de entrega",
          level: "required",
          ok: has(o, "CUMPLIDO") || has(o, "ACTA_ENTREGA"),
        },
        { key: "remesa", label: "Remesa (documento)", level: "required", ok: has(o, "REMESA") },
        { key: "foto_descargue", label: "Foto de descargue", level: "recommended", ok: has(o, "FOTO_DESCARGUE") },
      ];
    case "FACTURADA": {
      const items: ChecklistItem[] = [
        { key: "cumplido", label: "Cumplido / acta de entrega adjunto", level: "required", ok: has(o, "CUMPLIDO") || has(o, "ACTA_ENTREGA") },
        { key: "remesa", label: "Remesa adjunta", level: "required", ok: has(o, "REMESA") },
        { key: "factura_reg", label: "Factura registrada (número y valores)", level: "required", ok: !!o.invoice },
        { key: "factura_doc", label: "Archivo de factura adjunto", level: "required", ok: has(o, "FACTURA") },
      ];
      for (const d of o.clientRequiredDocs ?? []) {
        if (d === "CUMPLIDO" || d === "REMESA" || d === "FACTURA") continue;
        items.push({
          key: `cli_${d}`,
          label: `${DOC_LABEL[d as DocType] ?? d} (exigido por el cliente)`,
          level: "required",
          ok: has(o, d as DocType),
        });
      }
      if (o.clientRequiresPO) {
        items.push({ key: "po", label: "N° de orden de compra / pedido (exigido por el cliente)", level: "required", ok: !!o.purchaseOrderNumber });
      }
      return items;
    }
    default:
      return [];
  }
}

export type TransitionCheck = { allowed: boolean; reasons: string[]; checklist: ChecklistItem[] };

export function canTransition(from: Status, to: Status, role: Role, o: OrderSnapshot): TransitionCheck {
  const reasons: string[] = [];
  if (!TRANSITIONS[from]?.includes(to)) reasons.push(`No se permite pasar de ${STATUS_LABEL[from]} a ${STATUS_LABEL[to]}.`);
  if (!TRANSITION_ROLES[to].includes(role)) reasons.push(`Tu rol (${role}) no puede mover órdenes a ${STATUS_LABEL[to]}.`);
  const checklist = checklistFor(to, o);
  for (const c of checklist) if (c.level === "required" && !c.ok) reasons.push(`Falta: ${c.label}`);
  if (to === "FACTURADA") {
    const blocking = detectAnomalies(o).filter((a) => a.severity === "error");
    for (const a of blocking) reasons.push(`Inconsistencia: ${a.message}`);
  }
  return { allowed: reasons.length === 0, reasons, checklist };
}

// ---------------------------------------------------------------------------
// Detección de anomalías por reglas (la IA complementa con auditoría documental)
// ---------------------------------------------------------------------------
export type Anomaly = { code: string; severity: "error" | "warning"; message: string };

const norm = (s?: string | null) => (s ?? "").toString().replace(/[\s\-_.]/g, "").toUpperCase();

export function detectAnomalies(o: OrderSnapshot, now: Date = new Date()): Anomaly[] {
  const out: Anomaly[] = [];
  const load = o.loadDate ? new Date(o.loadDate) : null;
  const delivery = o.deliveryDate ? new Date(o.deliveryDate) : null;
  const closed = ["CUMPLIDA", "FACTURADA", "CANCELADA"].includes(o.status);

  if (!o.clientNit) out.push({ code: "SIN_NIT", severity: "error", message: "El cliente no tiene NIT registrado." });
  if (!o.originCity || !o.destinationCity) out.push({ code: "SIN_RUTA", severity: "error", message: "Falta origen o destino." });
  if (!load) out.push({ code: "SIN_FECHA", severity: "error", message: "Falta fecha de cargue." });
  if (!o.weightKg) out.push({ code: "SIN_PESO", severity: "warning", message: "No se registró peso de la carga." });
  if (load && delivery && delivery < startOfDay(load))
    out.push({ code: "FECHAS_INVERTIDAS", severity: "error", message: "La fecha de entrega es anterior a la de cargue." });
  if (load && ["PREALERTADA", "EN_CONSECUCION"].includes(o.status) && endOfDay(load) < now)
    out.push({ code: "CARGUE_VENCIDO", severity: "warning", message: "La fecha de cargue ya pasó y la orden aún no tiene vehículo." });
  if (o.weightKg && o.vehicleCapacityKg && o.weightKg > o.vehicleCapacityKg)
    out.push({ code: "SOBREPESO", severity: "error", message: `Peso (${o.weightKg} kg) supera la capacidad del vehículo (${o.vehicleCapacityKg} kg).` });
  if (o.status === "EN_RUTA" && delivery && endOfDay(delivery) < now)
    out.push({ code: "ENTREGA_VENCIDA", severity: "warning", message: "La fecha de entrega comprometida ya venció y la orden sigue en ruta." });
  if (o.status === "CUMPLIDA" && !(o.docTypes.includes("CUMPLIDO") || o.docTypes.includes("ACTA_ENTREGA")))
    out.push({ code: "CUMPLIDA_SIN_SOPORTE", severity: "error", message: "Orden cumplida sin cumplido/acta de entrega." });

  if (o.invoice) {
    const inv = o.invoice;
    if (o.purchaseOrderNumber && inv.purchaseOrderRef && norm(o.purchaseOrderNumber) !== norm(inv.purchaseOrderRef))
      out.push({
        code: "OC_NO_COINCIDE",
        severity: "error",
        message: `La OC de la factura (${inv.purchaseOrderRef}) no coincide con la OC de la orden (${o.purchaseOrderNumber}).`,
      });
    if (o.clientRequiresPO && !inv.purchaseOrderRef)
      out.push({ code: "FACTURA_SIN_OC", severity: "error", message: "El cliente exige OC en la factura y no fue referenciada." });
    if (o.remesaNumber && inv.remesaRef && norm(o.remesaNumber) !== norm(inv.remesaRef))
      out.push({
        code: "REMESA_NO_COINCIDE",
        severity: "error",
        message: `La remesa de la factura (${inv.remesaRef}) no coincide con la de la orden (${o.remesaNumber}).`,
      });
    if (o.rate && Math.abs(inv.subtotal - o.rate) / o.rate > 0.01)
      out.push({
        code: "VALOR_DIFERENTE",
        severity: "warning",
        message: `El subtotal facturado (${fmtCOP(inv.subtotal)}) difiere del flete pactado (${fmtCOP(o.rate)}).`,
      });
  } else if (closed && o.status !== "CANCELADA" && !o.rate) {
    out.push({ code: "SIN_TARIFA", severity: "warning", message: "La orden no tiene flete pactado registrado." });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function fmtCOP(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
export function fmtDate(d?: Date | string | null, withTime = false) {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Bogota",
  });
}
export function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}
