import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { computeKpis } from "@/lib/kpis";
import { fmtCOP, STATUS_LABEL, STATUSES, type Status } from "@/lib/domain";
import { Kpi, PageHeader, Section, StatusBadge, Empty } from "@/components/ui";

const BAR: Record<string, string> = {
  PREALERTADA: "bg-slate-400", EN_CONSECUCION: "bg-amber-400", ASIGNADA: "bg-indigo-500", EN_RUTA: "bg-sky-500", CUMPLIDA: "bg-emerald-500", FACTURADA: "bg-violet-500", CANCELADA: "bg-rose-400",
};

export default async function Dashboard() {
  const s = await requireSession();
  const k = computeKpis(s.tenantId);
  const total = Object.values(k.byStatus).reduce((a, b) => a + b, 0) || 1;
  const maxSeries = Math.max(1, ...k.series.map((x) => x.count));
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <>
      <PageHeader title={`Hola, ${s.name.split(" ")[0]}`} subtitle="Resumen operativo y financiero en tiempo real" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Órdenes activas" value={k.active} hint={`${k.prealertadas} prealertadas · ${k.enConsecucion} en consecución`} href="/ordenes" />
        <Kpi label="En ruta" value={k.enRuta} href="/monitoreo" />
        <Kpi label="Con novedad" value={k.incidents} tone={k.incidents ? "bad" : "good"} href="/ordenes?incident=1" />
        <Kpi label="Cumplimiento a tiempo" value={pct(k.onTimeRate)} tone={k.onTimeRate != null && k.onTimeRate < 0.9 ? "warn" : "good"} hint={`${k.deliveredCount} servicios entregados`} />
        <Kpi label="Pendientes por facturar" value={k.pendingInvoiceCount} hint={fmtCOP(k.pendingInvoiceValue)} tone={k.pendingInvoiceCount ? "warn" : "default"} href="/facturacion" />
        <Kpi label="Sin soportes completos" value={k.pendingDocsCount} hint="Cumplidas que no se pueden facturar" tone={k.pendingDocsCount ? "bad" : "good"} href="/facturacion" />
        <Kpi label="Facturado este mes" value={fmtCOP(k.invoicedMonth)} hint={`${k.invoicedMonthCount} facturas`} />
        <Kpi label="Cartera abierta" value={fmtCOP(k.receivables)} hint={`${k.receivablesCount} facturas · ${k.overdueCount} vencidas`} tone={k.overdueCount ? "warn" : "default"} />
        <Kpi label="Días cumplido → factura" value={k.avgDaysToInvoice == null ? "—" : k.avgDaysToInvoice.toFixed(1)} hint="Promedio; meta ≤ 2 días" tone={k.avgDaysToInvoice != null && k.avgDaysToInvoice > 2 ? "warn" : "good"} />
        {k.subscription && (
          <div className="card col-span-2 p-4 lg:col-span-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Suscripción · Plan {k.subscription.plan}</div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{k.subscription.status}</span>
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {k.subscription.used} de {k.subscription.limit} órdenes este mes · {k.subscription.users} usuarios
              {k.subscription.association && <> · Canal gremial: <b>{k.subscription.association}</b></>}
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.min(100, (k.subscription.used / k.subscription.limit) * 100)}%` }} /></div>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Distribución por estado" className="lg:col-span-2">
          <div className="flex h-4 overflow-hidden rounded-full">
            {STATUSES.filter((st) => k.byStatus[st]).map((st) => (
              <div key={st} className={BAR[st]} style={{ width: `${(k.byStatus[st] / total) * 100}%` }} title={`${STATUS_LABEL[st]}: ${k.byStatus[st]}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {STATUSES.map((st) => (
              <Link key={st} href={`/ordenes?status=${st}`} className="flex items-center gap-2 hover:underline">
                <span className={`h-2.5 w-2.5 rounded-full ${BAR[st]}`} /> {STATUS_LABEL[st as Status]} <b className="tabular-nums">{k.byStatus[st] ?? 0}</b>
              </Link>
            ))}
          </div>
          <div className="mt-6">
            <div className="label">Cargues por día (últimos 14 días)</div>
            <div className="mt-2 flex h-32 items-end gap-1.5">
              {k.series.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t bg-brand-500/80" style={{ height: `${(d.count / maxSeries) * 100}%`, minHeight: d.count ? 4 : 1 }} title={`${d.day}: ${d.count}`} />
                  <div className="text-[10px] text-slate-400">{d.day.slice(8)}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title={`Alertas y anomalías (${k.anomalyOrders.length})`}>
          {k.anomalyOrders.length === 0 ? (
            <Empty>Todo en orden. No hay inconsistencias detectadas.</Empty>
          ) : (
            <ul className="max-h-[420px] space-y-3 overflow-y-auto">
              {k.anomalyOrders.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/ordenes/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.code}</Link>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-xs text-slate-500">{a.client}</div>
                  <ul className="mt-2 space-y-1">
                    {a.anomalies.map((x) => (
                      <li key={x.code} className={`text-xs ${x.severity === "error" ? "text-rose-700" : "text-amber-700"}`}>{x.severity === "error" ? "●" : "▲"} {x.message}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
