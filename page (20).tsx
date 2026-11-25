import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listOrders } from "@/lib/queries";
import { getOrderFull, toSnapshot } from "@/lib/orders";
import { checklistFor, fmtCOP, fmtDate } from "@/lib/domain";
import { computeKpis } from "@/lib/kpis";
import { Kpi, PageHeader, Section, Empty } from "@/components/ui";

export default async function Billing() {
  const s = await requireSession(["ADMIN", "FACTURACION", "COMERCIAL"]);
  const k = computeKpis(s.tenantId);
  const done = listOrders(s, { status: "CUMPLIDA" }, "loadAsc").map((o) => {
    const items = checklistFor("FACTURADA", toSnapshot(getOrderFull(o.id)));
    const missingDocs = items.filter((i) => i.level === "required" && !i.ok && !["factura_reg", "factura_doc"].includes(i.key));
    return { o, missingDocs };
  });
  const ready = done.filter((d) => !d.missingDocs.length);
  const blocked = done.filter((d) => d.missingDocs.length);
  const invoiced = listOrders(s, { status: "FACTURADA" });
  const now = new Date();

  return (
    <>
      <PageHeader title="Facturación y cartera" subtitle="Del cumplido a la factura sin glosas: soportes vinculados y validados" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Listas para facturar" value={ready.length} hint={fmtCOP(ready.reduce((a, d) => a + (d.o.rate ?? 0), 0))} tone="good" />
        <Kpi label="Bloqueadas por soportes" value={blocked.length} tone={blocked.length ? "bad" : "good"} />
        <Kpi label="Cartera abierta" value={fmtCOP(k.receivables)} hint={`${k.overdueCount} vencidas`} tone={k.overdueCount ? "warn" : "default"} />
        <Kpi label="Días cumplido → factura" value={k.avgDaysToInvoice?.toFixed(1) ?? "—"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Listas para facturar (${ready.length})`}>
          {!ready.length ? <Empty>No hay órdenes listas.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {ready.map(({ o }) => (
                <li key={o.id} className="flex items-center justify-between py-2.5">
                  <div><Link href={`/ordenes/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.code}</Link> <span className="text-sm text-slate-500">{o.client.name}</span><div className="text-xs text-slate-400">Cumplida {fmtDate(o.completedAt)} · {o.documents.length} soportes</div></div>
                  <div className="text-right"><div className="font-medium tabular-nums">{fmtCOP(o.rate)}</div><Link href={`/ordenes/${o.id}`} className="text-xs text-brand-600">Facturar →</Link></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Bloqueadas: faltan soportes (${blocked.length})`}>
          {!blocked.length ? <Empty>Sin bloqueos 🎉</Empty> : (
            <ul className="divide-y divide-slate-100">
              {blocked.map(({ o, missingDocs }) => (
                <li key={o.id} className="py-2.5">
                  <div className="flex justify-between"><Link href={`/ordenes/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.code}</Link><span className="text-sm tabular-nums">{fmtCOP(o.rate)}</span></div>
                  <div className="text-xs text-slate-500">{o.client.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{missingDocs.map((m) => <span key={m.key} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">Falta: {m.label}</span>)}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <div className="mt-6">
        <Section title="Facturas emitidas">
          {!invoiced.length ? <Empty>Aún no hay facturas.</Empty> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead><tr><th className="th">Factura</th><th className="th">Orden</th><th className="th">Cliente</th><th className="th">Emisión</th><th className="th">Vence</th><th className="th text-right">Total</th><th className="th">Estado</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {invoiced.filter((o) => o.invoice).map((o) => {
                    const overdue = o.invoice!.status !== "PAGADA" && o.invoice!.dueDate < now;
                    return (
                      <tr key={o.id}>
                        <td className="td font-medium">{o.invoice!.number}</td>
                        <td className="td"><Link href={`/ordenes/${o.id}`} className="text-brand-700 hover:underline">{o.code}</Link></td>
                        <td className="td">{o.client.name}</td>
                        <td className="td">{fmtDate(o.invoice!.issueDate)}</td>
                        <td className={`td ${overdue ? "font-medium text-rose-600" : ""}`}>{fmtDate(o.invoice!.dueDate)}</td>
                        <td className="td text-right tabular-nums">{fmtCOP(o.invoice!.total)}</td>
                        <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.invoice!.status === "PAGADA" ? "bg-emerald-50 text-emerald-700" : overdue ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{overdue ? "VENCIDA" : o.invoice!.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
