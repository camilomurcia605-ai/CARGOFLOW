import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { OrderAssistant } from "@/components/OrderAssistant";

export default async function PortalNew() {
  const s = await requireSession(["CLIENTE"]);
  const c = db.query.clients.findFirst({ where: eq(schema.clients.id, s.clientId!) }).sync()!;
  return (
    <>
      <PageHeader title="Solicitar servicio" subtitle="Escribe o pega tu solicitud, o adjunta tu orden de compra / listado de despachos. Te confirmamos antes de programar." />
      <OrderAssistant clients={[]} fixedClient={{ id: c.id, name: c.name, nit: c.nit }} base="/portal/ordenes" />
    </>
  );
}
