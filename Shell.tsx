import Link from "next/link";
import type { Session } from "@/lib/auth";
import { NotificationBell } from "./NotificationBell";
import { NavLink } from "./NavLink";

type Item = { href: string; label: string; icon: string; roles?: string[] };

const STAFF_NAV: Item[] = [
  { href: "/dashboard", label: "Tablero", icon: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" },
  { href: "/ordenes", label: "Órdenes de servicio", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" },
  { href: "/ordenes/nueva", label: "Nueva orden (IA)", icon: "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1", roles: ["ADMIN", "COMERCIAL", "DESPACHO"] },
  { href: "/calendario", label: "Calendario despachos", icon: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" },
  { href: "/monitoreo", label: "Monitoreo en ruta", icon: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", roles: ["ADMIN", "DESPACHO", "COMERCIAL"] },
  { href: "/facturacion", label: "Facturación", icon: "M9 14l2 2 4-4M7 3h10l2 3v15l-3-2-2 2-2-2-2 2-2-2-3 2V6l2-3Z", roles: ["ADMIN", "FACTURACION", "COMERCIAL"] },
  { href: "/maestros", label: "Clientes y flota", icon: "M17 20h5v-2a3 3 0 0 0-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 0 1 5.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 0 1 9.2 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", roles: ["ADMIN", "COMERCIAL", "DESPACHO"] },
  { href: "/actividad", label: "Notificaciones y envíos", icon: "M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z", roles: ["ADMIN", "DESPACHO"] },
];

const CLIENT_NAV: Item[] = [
  { href: "/portal", label: "Mis envíos", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" },
  { href: "/portal/nueva", label: "Solicitar servicio (IA)", icon: "M12 4v16m8-8H4" },
];

const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrador", COMERCIAL: "Comercial", DESPACHO: "Despacho", FACTURACION: "Facturación", CLIENTE: "Cliente" };

export function Shell({ session, tenantName, children }: { session: Session; tenantName: string; children: React.ReactNode }) {
  const isClient = session.role === "CLIENTE";
  const nav = (isClient ? CLIENT_NAV : STAFF_NAV).filter((i) => !i.roles || i.roles.includes(session.role));
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-brand-900 text-brand-100 md:flex">
        <div className="flex items-center gap-2 px-5 py-5 text-lg font-semibold text-white">
          <svg width="28" height="28" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1f6feb"/><path d="M7 20h12V11H7v9Zm12-6h3.5L25 17v3h-6v-6Z" fill="#fff"/></svg>
          CargaFlow
        </div>
        <div className="px-5 pb-4 text-xs text-brand-100/70">{tenantName}</div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((i) => (
            <NavLink key={i.href} href={i.href} exact={i.href === "/portal" || i.href === "/ordenes"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={i.icon} /></svg>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <div className="font-medium text-white">{session.name}</div>
          <div className="text-brand-100/70">{ROLE_LABEL[session.role]} · {session.email}</div>
          <form action="/api/auth/logout" method="post" className="mt-3"><button className="text-brand-100 underline-offset-2 hover:underline">Cerrar sesión</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <div className="text-sm text-slate-500 md:hidden">CargaFlow</div>
          <div className="hidden text-sm text-slate-500 md:block">{isClient ? "Portal de clientes" : "Centro de operaciones"}</div>
          <div className="flex items-center gap-3">
            {!isClient && <Link href="/ordenes/nueva" className="btn-primary hidden sm:inline-flex">+ Nueva orden</Link>}
            <NotificationBell orderBase={isClient ? "/portal/ordenes" : "/ordenes"} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
