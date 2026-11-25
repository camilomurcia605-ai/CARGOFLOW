import { requireSession } from "@/lib/auth";
import { tenantMasters } from "@/lib/queries";
import { DOC_LABEL, type DocType } from "@/lib/domain";
import { PageHeader, Section } from "@/components/ui";
import { ClientForm, DriverForm, VehicleForm } from "@/components/MasterForms";

export default async function Masters() {
  const s = await requireSession(["ADMIN", "COMERCIAL", "DESPACHO"]);
  const { clients, vehicles, drivers } = tenantMasters(s.tenantId);
  return (
    <>
      <PageHeader title="Clientes y flota" subtitle="Generadores de carga, requisitos documentales por cliente, vehículos y conductores" />
      <div className="space-y-6">
        <Section title={`Clientes (${clients.length})`}>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="overflow-x-auto lg:col-span-2">
              <table className="min-w-full divide-y divide-slate-100">
                <thead><tr><th className="th">Cliente</th><th className="th">NIT</th><th className="th">Contacto</th><th className="th">Requisitos para facturar</th><th className="th">Plazo</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td className="td font-medium">{c.name}<div className="text-xs text-slate-400">{c.city}</div></td>
                      <td className="td">{c.nit}</td>
                      <td className="td text-xs">{c.email}<br />{c.whatsapp}</td>
                      <td className="td text-xs">{[c.requiresPO && "OC en factura", ...(c.requiredDocs ?? []).map((d) => DOC_LABEL[d as DocType])].filter(Boolean).join(", ") || "Estándar"}</td>
                      <td className="td">{c.paymentTermsDays} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {["ADMIN", "COMERCIAL"].includes(s.role) && <div className="rounded-lg bg-slate-50 p-4"><div className="label mb-2">Nuevo cliente</div><ClientForm /></div>}
          </div>
        </Section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={`Vehículos (${vehicles.length})`}>
            <table className="mb-4 min-w-full divide-y divide-slate-100">
              <thead><tr><th className="th">Placa</th><th className="th">Tipo</th><th className="th">Capacidad</th><th className="th">Tenedor</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{vehicles.map((v) => <tr key={v.id}><td className="td font-medium">{v.plate}</td><td className="td">{v.type}</td><td className="td">{v.capacityKg.toLocaleString("es-CO")} kg</td><td className="td text-xs">{v.ownerName}</td></tr>)}</tbody>
            </table>
            {["ADMIN", "DESPACHO"].includes(s.role) && <VehicleForm />}
          </Section>
          <Section title={`Conductores (${drivers.length})`}>
            <table className="mb-4 min-w-full divide-y divide-slate-100">
              <thead><tr><th className="th">Nombre</th><th className="th">Cédula</th><th className="th">Celular</th><th className="th">Lic.</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{drivers.map((d) => <tr key={d.id}><td className="td font-medium">{d.name}</td><td className="td">{d.docNumber}</td><td className="td">{d.phone}</td><td className="td">{d.license}</td></tr>)}</tbody>
            </table>
            {["ADMIN", "DESPACHO"].includes(s.role) && <DriverForm />}
          </Section>
        </div>
      </div>
    </>
  );
}
