import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession(["ADMIN", "COMERCIAL", "DESPACHO", "FACTURACION"]);
  const t = db.query.tenants.findFirst({ where: eq(schema.tenants.id, s.tenantId) }).sync();
  return <Shell session={s} tenantName={t?.name ?? ""}>{children}</Shell>;
}
