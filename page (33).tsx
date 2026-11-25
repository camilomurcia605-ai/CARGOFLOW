import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listOrders } from "@/lib/queries";
import { computeKpis } from "@/lib/kpis";
import { fmtCOP } from "@/lib/domain";
import { Kpi, PageHeader } from "@/components/ui";
import { OrdersTable } from "@/components/OrdersViews";

export default async function Portal({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const s = await requireSession(["CLIENTE"]);
  const k = computeKpis(s.tenantId, s.clientId);
  const orders = listOrders(s, searchParams);
  return (
    <>
      <PageHeader title="Mis envíos" subtitle="Estado en tiempo real, evidencias de cargue y descargue, cumplidos y facturas" actions={<Link href="/portal/nueva" className="btn-primary">+ Solicitar servicio</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Activos" value={k.active} href="/portal" />
        <Kpi label="En ruta" value={k.enRuta} href="/portal?status=EN_RUTA" />
        <Kpi label="Con novedad" value={k.incidents} tone={k.incidents ? "bad" : "good"} />
        <Kpi label="Entregas a tiempo" value={k.onTimeRate == null ? "—" : `${Math.round(k.onTimeRate * 100)}%`} tone="good" />
        <Kpi label="Facturas por pagar" value={fmtCOP(k.receivables)} hint={`${k.receivablesCount} facturas`} />
      </div>
      <form className="mb-4 flex gap-2" action="/portal">
        <input name="q" defaultValue={searchParams.q} className="input max-w-sm" placeholder="Buscar por código, ciudad u OC…" />
        <button className="btn-secondary">Buscar</button>
      </form>
      <OrdersTable orders={orders.map((o) => ({ ...o, anomalies: [] }))} base="/portal/ordenes" showClient={false} />
    </>
  );
}
