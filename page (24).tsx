import { requireSession } from "@/lib/auth";
import { tenantMasters } from "@/lib/queries";
import { aiEnabled } from "@/lib/ai";
import { PageHeader } from "@/components/ui";
import { OrderAssistant } from "@/components/OrderAssistant";

export default async function NewOrder() {
  const s = await requireSession(["ADMIN", "COMERCIAL", "DESPACHO"]);
  const { clients } = tenantMasters(s.tenantId);
  return (
    <>
      <PageHeader title="Nueva orden de servicio" subtitle={`Crea órdenes a nombre del cliente desde texto, correo, WhatsApp o documentos · IA ${aiEnabled() ? "activa (Claude)" : "en modo local — configura ANTHROPIC_API_KEY para leer PDF e imágenes"}`} />
      <OrderAssistant clients={clients.map((c) => ({ id: c.id, name: c.name, nit: c.nit }))} base="/ordenes" />
    </>
  );
}
