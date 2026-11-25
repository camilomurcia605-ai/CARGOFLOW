import { DOC_LABEL, EVENT_LABEL, fmtCOP, fmtDate, STATUS_LABEL, type DocType, type EventType, type Status } from "@/lib/domain";
import type { OrderFull } from "@/lib/orders";
import type { orderEvents } from "@/lib/queries";

const FLOW: Status[] = ["PREALERTADA", "EN_CONSECUCION", "ASIGNADA", "EN_RUTA", "CUMPLIDA", "FACTURADA"];

export function Stepper({ status }: { status: string }) {
  const idx = FLOW.indexOf(status as Status);
  if (status === "CANCELADA") return <div className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">Orden cancelada</div>;
  return (
    <ol className="flex w-full items-center">
      {FLOW.map((s, i) => (
        <li key={s} className={`flex items-center ${i < FLOW.length - 1 ? "flex-1" : ""}`}>
          <div className="flex flex-col items-center gap-1">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${i < idx ? "bg-emerald-500 text-white" : i === idx ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-slate-200 text-slate-500"}`}>{i < idx ? "✓" : i + 1}</span>
            <span className={`whitespace-nowrap text-[11px] ${i === idx ? "font-semibold text-brand-700" : "text-slate-500"}`}>{STATUS_LABEL[s]}</span>
          </div>
          {i < FLOW.length - 1 && <div className={`mx-1 mb-5 h-0.5 flex-1 ${i < idx ? "bg-emerald-400" : "bg-slate-200"}`} />}
        </li>
      ))}
    </ol>
  );
}

export function OrderInfo({ o, showRate = true, compact = false }: { o: OrderFull; showRate?: boolean; compact?: boolean }) {
  const row = (label: string, value: React.ReactNode) => (
    <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm font-medium text-slate-800">{value || "—"}</dd></div>
  );
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
      {row("Origen", <>{o.originCity}<div className="text-xs font-normal text-slate-500">{o.originAddress}</div></>)}
      {row("Destino", <>{o.destinationCity}<div className="text-xs font-normal text-slate-500">{o.destinationAddress}</div></>)}
      {row("Cargue", <>{fmtDate(o.loadDate)} <span className="text-xs font-normal text-slate-500">{o.loadWindow}</span></>)}
      {row("Entrega compromiso", <>{fmtDate(o.deliveryDate)} <span className="text-xs font-normal text-slate-500">{o.deliveryWindow}</span></>)}
      {row("Tipo de carga", o.cargoType)}
      {row("Mercancía", o.cargoDescription)}
      {row("Peso / volumen", [o.weightKg && `${o.weightKg.toLocaleString("es-CO")} kg`, o.volumeM3 && `${o.volumeM3} m³`, o.packages && `${o.packages} und.`].filter(Boolean).join(" · "))}
      {row("Vehículo requerido", o.vehicleType)}
      {row("Contacto", <>{o.contactName} <span className="text-xs font-normal text-slate-500">{o.contactPhone}</span></>)}
      {row("OC / Pedido", [o.purchaseOrderNumber, o.customerOrderNumber].filter(Boolean).join(" · "))}
      {row("Remesa / Manifiesto", [o.remesaNumber, o.manifiestoNumber].filter(Boolean).join(" · "))}
      {showRate ? row("Flete pactado", fmtCOP(o.rate)) : row("Valor declarado", fmtCOP(o.declaredValue))}
      {o.requirements && <div className="col-span-full">{row("Requisitos de cargue / descargue", o.requirements)}</div>}
      {o.notes && <div className="col-span-full">{row("Observaciones", o.notes)}</div>}
    </dl>
  );
}

const EV_COLOR: Partial<Record<EventType, string>> = {
  NOVEDAD: "bg-rose-500", RETRASO: "bg-rose-400", SALIDA_ORIGEN: "bg-sky-500", LLEGADA_DESTINO: "bg-emerald-500", CUMPLIDO: "bg-emerald-600", FACTURADA: "bg-violet-500", ASIGNACION: "bg-indigo-500", DOCUMENTO: "bg-slate-400",
};

export function Timeline({ events }: { events: ReturnType<typeof orderEvents> }) {
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {events.map((e) => (
        <li key={e.id} className="mb-4 ml-5">
          <span className={`absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-white ${EV_COLOR[e.type as EventType] ?? "bg-slate-300"}`} />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{EVENT_LABEL[e.type as EventType] ?? e.type}</span>
            <span className="text-xs text-slate-400">{fmtDate(e.createdAt, true)}</span>
            {!e.visibleToClient && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">interno</span>}
          </div>
          <p className="text-sm text-slate-600">{e.description}</p>
          {(e.location || e.createdBy) && <p className="text-xs text-slate-400">{[e.location && `📍 ${e.location}`, e.createdBy?.name].filter(Boolean).join(" · ")}</p>}
        </li>
      ))}
    </ol>
  );
}

export function DocsGallery({ docs }: { docs: OrderFull["documents"] }) {
  if (!docs.length) return <p className="text-sm text-slate-500">Aún no hay documentos.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {docs.map((d) => (
        <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" className="group overflow-hidden rounded-lg border border-slate-200 bg-white hover:border-brand-400">
          {d.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/documents/${d.id}`} alt={d.fileName} className="h-28 w-full bg-slate-50 object-cover" />
          ) : (
            <div className="flex h-28 items-center justify-center bg-slate-50 text-3xl">📄</div>
          )}
          <div className="p-2">
            <div className="text-xs font-semibold text-slate-700">{DOC_LABEL[d.type as DocType] ?? d.type}</div>
            <div className="truncate text-[11px] text-slate-400">{d.fileName}</div>
          </div>
        </a>
      ))}
    </div>
  );
}
