import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listOrders, orderEvents } from "@/lib/queries";
import { endOfDay, EVENT_LABEL, fmtDate, type EventType } from "@/lib/domain";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";

const STALE_HOURS = 6;

export default async function Monitoring() {
  const s = await requireSession(["ADMIN", "DESPACHO", "COMERCIAL"]);
  const now = Date.now();
  const rows = [...listOrders(s, { status: "EN_RUTA" }), ...listOrders(s, { status: "ASIGNADA" })].map((o) => {
    const last = orderEvents(o.id, false).find((e) => !["DOCUMENTO"].includes(e.type));
    const hours = last ? (now - last.createdAt.getTime()) / 3600000 : null;
    const late = o.deliveryDate && endOfDay(o.deliveryDate).getTime() < now && !o.arrivedAt;
    return { o, last, hours, stale: o.status === "EN_RUTA" && hours != null && hours > STALE_HOURS, late };
  });
  rows.sort((a, b) => Number(b.o.hasIncident) - Number(a.o.hasIncident) || Number(!!b.late) - Number(!!a.late) || Number(b.stale) - Number(a.stale));

  return (
    <>
      <PageHeader title="Monitoreo en ruta" subtitle={`Torre de control: vehículos asignados y en ruta. Alerta si no hay reporte en ${STALE_HOURS} h o la entrega está vencida.`} />
      {!rows.length ? <Empty>No hay vehículos en operación.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ o, last, hours, stale, late }) => (
            <Link key={o.id} href={`/ordenes/${o.id}`} className={`card block p-4 transition hover:border-brand-400 ${o.hasIncident ? "border-rose-300 bg-rose-50/40" : late || stale ? "border-amber-300" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{o.code}</span>
                <StatusBadge status={o.status} incident={o.hasIncident} />
              </div>
              <div className="mt-1 text-sm">{o.originCity} → {o.destinationCity}</div>
              <div className="text-xs text-slate-500">{o.client.name}</div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span>🚛 <b>{o.vehicle?.plate}</b> · {o.driver?.name}</span>
                <span className="text-slate-500">{o.driver?.phone}</span>
              </div>
              <div className="mt-3 text-xs">
                <span className="text-slate-500">Último reporte: </span>
                {last ? <><b>{EVENT_LABEL[last.type as EventType]}</b> · {last.location ?? ""} · hace {hours! < 1 ? `${Math.round(hours! * 60)} min` : `${hours!.toFixed(1)} h`}</> : "—"}
              </div>
              <div className="mt-1 text-xs text-slate-500">Entrega compromiso: {fmtDate(o.deliveryDate)} {o.deliveryWindow}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {late && <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Entrega vencida</span>}
                {stale && <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Sin reporte &gt; {STALE_HOURS} h</span>}
                {o.arrivedAt && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">En destino — pendiente cumplido</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
