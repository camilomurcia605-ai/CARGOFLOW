import Link from "next/link";
import type { ListedOrder } from "@/lib/queries";
import { fmtDate, STATUS_LABEL, type Status } from "@/lib/domain";
import { StatusBadge, Empty } from "./ui";

export function OrdersTable({ orders, base, showClient = true }: { orders: ListedOrder[]; base: string; showClient?: boolean }) {
  if (!orders.length) return <Empty>No hay órdenes con estos filtros.</Empty>;
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Orden</th>
            {showClient && <th className="th">Cliente</th>}
            <th className="th">Ruta</th>
            <th className="th">Cargue</th>
            <th className="th">Entrega</th>
            <th className="th">Vehículo</th>
            <th className="th">Estado</th>
            <th className="th">Soportes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((o) => {
            const errs = o.anomalies.filter((a) => a.severity === "error").length;
            return (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`${base}/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.code}</Link>
                  <div className="text-xs text-slate-400">{o.purchaseOrderNumber ? `OC ${o.purchaseOrderNumber}` : o.source === "IA" ? "Creada con IA" : o.source === "PORTAL_CLIENTE" ? "Portal cliente" : ""}</div>
                </td>
                {showClient && <td className="td max-w-[200px] truncate">{o.client.name}</td>}
                <td className="td whitespace-nowrap">{o.originCity} → {o.destinationCity}<div className="text-xs text-slate-400">{o.weightKg ? `${o.weightKg.toLocaleString("es-CO")} kg` : ""} {o.vehicleType ?? ""}</div></td>
                <td className="td whitespace-nowrap">{fmtDate(o.loadDate)}<div className="text-xs text-slate-400">{o.loadWindow}</div></td>
                <td className="td whitespace-nowrap">{fmtDate(o.deliveryDate)}</td>
                <td className="td whitespace-nowrap">{o.vehicle ? <>{o.vehicle.plate}<div className="text-xs text-slate-400">{o.driver?.name}</div></> : <span className="text-slate-400">Sin asignar</span>}</td>
                <td className="td"><StatusBadge status={o.status} incident={o.hasIncident} /></td>
                <td className="td whitespace-nowrap text-xs">
                  {o.documents.length} doc.
                  {errs > 0 && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700">{errs} alerta(s)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const BOARD: Status[] = ["PREALERTADA", "EN_CONSECUCION", "ASIGNADA", "EN_RUTA", "CUMPLIDA"];

export function OrdersBoard({ orders, base }: { orders: ListedOrder[]; base: string }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {BOARD.map((st) => {
        const col = orders.filter((o) => o.status === st);
        return (
          <div key={st} className="min-w-[200px] flex-1 rounded-xl bg-slate-100/70 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">{STATUS_LABEL[st]}</span>
              <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-600">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((o) => (
                <Link key={o.id} href={`${base}/${o.id}`} className={`block rounded-lg border bg-white p-3 shadow-sm transition hover:border-brand-400 ${o.hasIncident ? "border-rose-300" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">{o.code}</span>
                    {o.hasIncident && <span className="rounded bg-rose-600 px-1.5 text-[10px] font-bold text-white">NOVEDAD</span>}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">{o.client.name}</div>
                  <div className="mt-2 text-sm">{o.originCity} → {o.destinationCity}</div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>{fmtDate(o.loadDate)}</span>
                    <span>{o.vehicle?.plate ?? o.vehicleType ?? ""}</span>
                  </div>
                  {o.anomalies.some((a) => a.severity === "error") && <div className="mt-2 text-[11px] text-rose-600">● {o.anomalies.find((a) => a.severity === "error")!.message}</div>}
                </Link>
              ))}
              {!col.length && <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">Vacío</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
