import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getOrderFull } from "@/lib/orders";
import { orderEvents } from "@/lib/queries";
import { DOC_LABEL, fmtCOP, fmtDate, type DocType } from "@/lib/domain";
import { Section, StatusBadge } from "@/components/ui";
import { DocsGallery, OrderInfo, Stepper, Timeline } from "@/components/OrderView";
import { DocUpload } from "@/components/OrderPanels";

export default async function PortalOrder({ params }: { params: { id: string } }) {
  const s = await requireSession(["CLIENTE"]);
  let o;
  try { o = getOrderFull(params.id); } catch { notFound(); }
  if (o.tenantId !== s.tenantId || o.clientId !== s.clientId) notFound();
  const events = orderEvents(o.id, true);
  const invoiceDoc = o.documents.find((d) => d.type === "FACTURA");
  const missingClientDocs = (o.client.requiredDocs ?? []).filter((d) => !o.documents.some((x) => x.type === d)) as DocType[];

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/portal" className="text-slate-500 hover:underline">← Mis envíos</Link></div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{o.code}</h1>
        <StatusBadge status={o.status} incident={o.hasIncident} />
        <span className="text-sm text-slate-500">{o.originCity} → {o.destinationCity}</span>
      </div>
      <div className="card mb-6 p-5"><Stepper status={o.status} /></div>
      {missingClientDocs.length > 0 && o.status !== "FACTURADA" && (
        <div className="card mb-6 border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Para poder facturar este servicio necesitamos: {missingClientDocs.map((d) => DOC_LABEL[d]).join(", ")}</p>
          <div className="mt-3"><DocUpload orderId={o.id} types={["ORDEN_COMPRA", "OTRO"]} /></div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Seguimiento"><Timeline events={events} /></Section>
          <Section title="Fotos, cumplidos y documentos"><DocsGallery docs={o.documents} /></Section>
        </div>
        <div className="space-y-6">
          {o.vehicle && (
            <Section title="Vehículo asignado">
              <p className="text-sm">🚛 <b>{o.vehicle.plate}</b> · {o.vehicle.type}</p>
              <p className="text-sm text-slate-600">Conductor: {o.driver?.name}</p>
              {o.status === "EN_RUTA" && <p className="mt-2 text-xs text-slate-500">Salió de origen {fmtDate(o.departedAt, true)}</p>}
            </Section>
          )}
          <Section title="Factura">
            {o.invoice ? (
              <div className="text-sm">
                <p>N° <b>{o.invoice.number}</b> · {fmtCOP(o.invoice.total)}</p>
                <p className="text-slate-500">Emitida {fmtDate(o.invoice.issueDate)} · vence {fmtDate(o.invoice.dueDate)} · {o.invoice.status}</p>
                {invoiceDoc && <a className="btn-secondary mt-3" href={`/api/documents/${invoiceDoc.id}?download=1`}>Descargar factura</a>}
              </div>
            ) : <p className="text-sm text-slate-500">Se emitirá cuando el servicio esté cumplido y con soportes completos.</p>}
          </Section>
          <Section title="Datos de la solicitud"><OrderInfo o={o} showRate={false} compact /></Section>
        </div>
      </div>
    </>
  );
}
