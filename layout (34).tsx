import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession(["CLIENTE"]);
  const c = s.clientId ? db.query.clients.findFirst({ where: eq(schema.clients.id, s.clientId) }).sync() : null;
  return <Shell session={s} tenantName={c ? `${c.name} · NIT ${c.nit}` : ""}>{children}</Shell>;
}
