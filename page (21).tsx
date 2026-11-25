import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listOrders } from "@/lib/queries";
import { startOfDay, STATUS_LABEL, type Status } from "@/lib/domain";
import { PageHeader, Empty } from "@/components/ui";

const BAR: Record<string, string> = {
  PREALERTADA: "bg-slate-400", EN_CONSECUCION: "bg-amber-400", ASIGNADA: "bg-indigo-500", EN_RUTA: "bg-sky-500", CUMPLIDA: "bg-emerald-500", FACTURADA: "bg-violet-500", CANCELADA: "bg-rose-300",
};
const DAYS = 14;

export default async function Calendar({ searchParams }: { searchParams: { start?: string; vista?: string } }) {
  const s = await requireSession();
  const start = startOfDay(searchParams.start ? new Date(searchParams.start + "T12:00:00") : new Date(Date.now() - 3 * 86400000));
  const end = new Date(start.getTime() + DAYS * 86400000);
  const orders = listOrders(s, { from: new Date(start.getTime() - 7 * 86400000), to: end }, "loadAsc").filter(
    (o) => o.status !== "CANCELADA" && (o.deliveryDate ?? o.loadDate) >= start,
  );
  const days = Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * 86400000));
  const today = startOfDay(new Date()).getTime();
  const shift = (n: number) => new Date(start.getTime() + n * 86400000).toISOString().slice(0, 10);
  const col = (d: Date) => Math.max(0, Math.min(DAYS - 1, Math.floor((startOfDay(d).getTime() - start.getTime()) / 86400000)));

  return (
    <>
      <PageHeader
        title="Calendario de despachos"
        subtitle="Línea de tiempo cargue → entrega por orden"
        actions={
          <>
            <Link className="btn-secondary" href={`/calendario?start=${shift(-7)}`}>← Semana anterior</Link>
            <Link className="btn-secondary" href="/calendario">Hoy</Link>
            <Link className="btn-secondary" href={`/calendario?start=${shift(7)}`}>Semana siguiente →</Link>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        {Object.entries(BAR).filter(([k]) => k !== "CANCELADA").map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-5 rounded ${c}`} />{STATUS_LABEL[k as Status]}</span>)}
      </div>
      {!orders.length ? <Empty>No hay despachos en este rango.</Empty> : (
        <div className="card overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid border-b border-slate-200 bg-slate-50 text-xs" style={{ gridTemplateColumns: `260px repeat(${DAYS}, 1fr)` }}>
              <div className="px-3 py-2 font-semibold text-slate-500">Orden</div>
              {days.map((d) => (
                <div key={d.toISOString()} className={`border-l border-slate-200 px-1 py-2 text-center ${d.getTime() === today ? "bg-brand-50 font-bold text-brand-700" : "text-slate-500"} ${[0, 6].includes(d.getDay()) ? "bg-slate-100/70" : ""}`}>
                  {d.toLocaleDateString("es-CO", { weekday: "short" })}<br />{d.getDate()}
                </div>
              ))}
            </div>
            {orders.map((o) => {
              const a = col(o.loadDate);
              const b = col(o.deliveryDate ?? o.loadDate);
              const outOfRange = startOfDay(o.loadDate) < start;
              return (
                <div key={o.id} className="grid items-center border-b border-slate-100 text-sm hover:bg-slate-50" style={{ gridTemplateColumns: `260px repeat(${DAYS}, 1fr)` }}>
                  <div className="truncate px-3 py-2">
                    <Link href={`/ordenes/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.code}</Link>
                    <span className="ml-2 text-xs text-slate-500">{o.originCity} → {o.destinationCity}</span>
                    <div className="truncate text-[11px] text-slate-400">{o.client.name} · {o.vehicle?.plate ?? "sin vehículo"}</div>
                  </div>
                  <div className="relative col-span-full col-start-2 grid h-full" style={{ gridTemplateColumns: `repeat(${DAYS}, 1fr)` }}>
                    {days.map((d) => <div key={d.toISOString()} className={`border-l border-slate-100 ${d.getTime() === today ? "bg-brand-50/60" : ""}`} />)}
                    <Link
                      href={`/ordenes/${o.id}`}
                      title={`${STATUS_LABEL[o.status as Status]} · ${o.loadWindow ?? ""}`}
                      className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-md px-2 text-[11px] font-medium leading-6 text-white shadow-sm ${BAR[o.status]} ${o.hasIncident ? "ring-2 ring-rose-500 ring-offset-1" : ""}`}
                      style={{ left: `calc(${(a / DAYS) * 100}% + 3px)`, width: `calc(${((b - a + 1) / DAYS) * 100}% - 6px)` }}
                    >
                      <span className="truncate">{outOfRange ? "… " : ""}{o.vehicleType ?? ""} {o.weightKg ? `${Math.round(o.weightKg / 1000)} t` : ""}</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
