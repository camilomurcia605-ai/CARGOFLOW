import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listOrders, statusCounts, tenantMasters } from "@/lib/queries";
import { STATUS_LABEL, STATUSES } from "@/lib/domain";
import { PageHeader } from "@/components/ui";
import { OrdersBoard, OrdersTable } from "@/components/OrdersViews";

type SP = { status?: string; q?: string; incident?: string; clientId?: string; view?: string };

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const s = await requireSession();
  const view = searchParams.view === "tabla" || searchParams.status ? "tabla" : searchParams.view ?? "tablero";
  const orders = listOrders(s, searchParams);
  const counts = statusCounts(s);
  const { clients } = tenantMasters(s.tenantId);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...searchParams, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/ordenes?${p.toString()}`;
  };
  const tab = (active: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`;

  return (
    <>
      <PageHeader
        title="Órdenes de servicio"
        subtitle="Tablero general de despacho con estados operativos y alertas"
        actions={
          <>
            <div className="flex rounded-lg bg-white p-1 ring-1 ring-slate-200">
              <Link href={qs({ view: "tablero", status: undefined })} className={`rounded-md px-3 py-1 text-sm ${view === "tablero" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Tablero</Link>
              <Link href={qs({ view: "tabla" })} className={`rounded-md px-3 py-1 text-sm ${view === "tabla" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Tabla</Link>
            </div>
            <Link href="/ordenes/nueva" className="btn-primary">+ Nueva orden</Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/ordenes?view=tabla" className={tab(!searchParams.status && !searchParams.incident)}>Todas · {counts.ALL ?? 0}</Link>
        {STATUSES.map((st) => (
          <Link key={st} href={qs({ status: st, incident: undefined, view: "tabla" })} className={tab(searchParams.status === st)}>
            {STATUS_LABEL[st]} · {counts[st] ?? 0}
          </Link>
        ))}
        <Link href={qs({ incident: "1", status: undefined, view: "tabla" })} className={`${tab(searchParams.incident === "1")} ${searchParams.incident === "1" ? "" : "!text-rose-700"}`}>Con novedad · {counts.INCIDENT}</Link>
      </div>
      <form className="mb-5 flex flex-wrap gap-2" action="/ordenes">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={searchParams.q} placeholder="Buscar código, ciudad, OC, remesa, mercancía…" className="input max-w-sm" />
        <select name="clientId" defaultValue={searchParams.clientId ?? ""} className="input max-w-xs">
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-secondary">Filtrar</button>
        {(searchParams.q || searchParams.clientId) && <Link href="/ordenes" className="btn-ghost">Limpiar</Link>}
      </form>
      {view === "tablero" ? <OrdersBoard orders={orders} base="/ordenes" /> : <OrdersTable orders={orders} base="/ordenes" />}
    </>
  );
}
