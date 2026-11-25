import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { notificationScope } from "@/lib/notifications";
import { fmtDate } from "@/lib/domain";
import { PageHeader, Section, Empty } from "@/components/ui";

export default async function Activity() {
  const s = await requireSession(["ADMIN", "DESPACHO"]);
  const notes = db.select().from(schema.notifications).where(notificationScope(s)).orderBy(desc(schema.notifications.createdAt)).limit(60).all();
  const out = db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.tenantId, s.tenantId)).orderBy(desc(schema.outboundMessages.createdAt)).limit(60).all();
  return (
    <>
      <PageHeader title="Notificaciones y envíos" subtitle="Bandeja interna de despacho y registro de mensajes salientes a clientes (correo, WhatsApp, webhook)" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Notificaciones internas">
          {!notes.length ? <Empty>Sin notificaciones.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="py-2">
                  <div className="text-sm font-medium">{n.orderId ? <Link className="hover:underline" href={`/ordenes/${n.orderId}`}>{n.title}</Link> : n.title}</div>
                  <div className="text-xs text-slate-500">{n.body}</div>
                  <div className="text-[11px] text-slate-400">{n.audience} · {fmtDate(n.createdAt, true)}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Bandeja de salida (clientes)">
          <p className="mb-3 text-xs text-slate-500">“SIMULADO” = canal sin credenciales configuradas (ver .env). Al configurar RESEND_API_KEY / WHATSAPP_TOKEN se envían de verdad.</p>
          {!out.length ? <Empty>Aún no hay envíos. Registra un evento en una orden para verlos aquí.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {out.map((m) => (
                <li key={m.id} className="py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-slate-100 px-1.5 text-[11px] font-semibold">{m.channel}</span>
                    <span className="truncate">{m.to}</span>
                    <span className={`ml-auto rounded px-1.5 text-[11px] ${m.status === "ENVIADO" ? "bg-emerald-50 text-emerald-700" : m.status === "ERROR" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{m.status}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{m.subject ?? m.payload}</div>
                  <div className="text-[11px] text-slate-400">{fmtDate(m.createdAt, true)}{m.error ? ` · ${m.error.slice(0, 80)}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
