import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { enrich, getOrderFull } from "@/lib/orders";
import { orderEvents, tenantMasters } from "@/lib/queries";
import { DOC_TYPES, fmtCOP, fmtDate, type Status } from "@/lib/domain";
import { Section, StatusBadge } from "@/components/ui";
import { DocsGallery, OrderInfo, Stepper, Timeline } from "@/components/OrderView";
import { AssignForm, AuditButton, DocUpload, EventForm, InvoiceForm, NextStep, RefsForm } from "@/components/OrderPanels";

export default async function OrderDetail({ params }: { params: { id: string } }) {
  const s = await requireSession();
  let o;
  try {
    o = enrich(getOrderFull(params.id));
  } catch {
    notFound();
  }
  if (o.tenantId !== s.tenantId) notFound();
  const events = orderEvents(o.id, false);
  const { vehicles, drivers } = tenantMasters(s.tenantId);
  const status = o.status as Status;
  const canDispatch = ["ADMIN", "DESPACHO"].includes(s.role);
  const canBill = ["ADMIN", "FACTURACION"].includes(s.role);

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/ordenes" className="text-slate-500 hover:underline">← Órdenes</Link></div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{o.code}</h1>
            <StatusBadge status={o.status} incident={o.hasIncident} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {o.client.name} · NIT {o.client.nit} · {o.originCity} → {o.destinationCity} · creada {fmtDate(o.createdAt, true)} vía {o.source === "IA" ? "asistente IA" : o.source === "PORTAL_CLIENTE" ? "portal cliente" : "comercial"}
          </p>
        </div>
        {o.vehicle && (
          <div className="card px-4 py-2 text-sm">
            🚛 <b>{o.vehicle.plate}</b> · {o.vehicle.type} · {o.driver?.name} <span className="text-slate-400">{o.driver?.phone}</span>
          </div>
        )}
      </div>

      <div className="card mb-6 p-5"><Stepper status={o.status} /></div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Datos del servicio"><OrderInfo o={o} /></Section>

          <Section title="Monitoreo y trazabilidad">
            {canDispatch && <div className="mb-5 rounded-lg bg-slate-50 p-4"><EventForm orderId={o.id} status={status} hasIncident={o.hasIncident} /></div>}
            <Timeline events={events} />
          </Section>

          <Section title={`Documentos y evidencias (${o.documents.length})`}>
            <div className="mb-4"><DocUpload orderId={o.id} types={[...DOC_TYPES]} defaultType={status === "EN_RUTA" ? "CUMPLIDO" : status === "ASIGNADA" ? "FOTO_CARGUE" : status === "CUMPLIDA" ? "FACTURA" : "ORDEN_COMPRA"} /></div>
            <DocsGallery docs={o.documents} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Siguiente paso · checklist documental">
            <NextStep orderId={o.id} status={status} next={o.nextChecklists} role={s.role} />
          </Section>

          <Section title={`Alertas (${o.anomalies.length})`}>
            {o.anomalies.length === 0 ? (
              <p className="mb-3 text-sm text-emerald-700">✓ Sin inconsistencias por reglas.</p>
            ) : (
              <ul className="mb-3 space-y-1.5">
                {o.anomalies.map((a) => (
                  <li key={a.code} className={`rounded-lg px-3 py-2 text-xs ${a.severity === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>{a.message}</li>
                ))}
              </ul>
            )}
            <AuditButton orderId={o.id} />
          </Section>

          {["PREALERTADA", "EN_CONSECUCION", "ASIGNADA"].includes(status) && canDispatch && (
            <Section title="Asignación (consecución)">
              <AssignForm orderId={o.id} vehicles={vehicles.filter((v) => v.active)} drivers={drivers.filter((d) => d.active)} current={{ vehicleId: o.vehicleId, driverId: o.driverId }} requiredType={o.vehicleType} weightKg={o.weightKg} />
            </Section>
          )}

          {!["FACTURADA", "CANCELADA"].includes(status) && s.role !== "FACTURACION" && (
            <Section title="Referencias (remesa, manifiesto, OC, flete)">
              <RefsForm orderId={o.id} remesa={o.remesaNumber} manifiesto={o.manifiestoNumber} rate={o.rate} po={o.purchaseOrderNumber} />
            </Section>
          )}

          <Section title="Facturación">
            {o.invoice && (
              <div className="mb-3 rounded-lg bg-violet-50 p-3 text-sm">
                Factura <b>{o.invoice.number}</b> · {fmtCOP(o.invoice.total)} · vence {fmtDate(o.invoice.dueDate)}
              </div>
            )}
            {canBill ? (
              <InvoiceForm
                orderId={o.id}
                status={status}
                invoice={o.invoice ? { ...o.invoice, issueDate: o.invoice.issueDate.toISOString() } : null}
                defaults={{ subtotal: o.rate, po: o.purchaseOrderNumber, remesa: o.remesaNumber }}
              />
            ) : (
              <p className="text-sm text-slate-500">{o.invoice ? "" : "Pendiente de facturación (rol Facturación)."}</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
