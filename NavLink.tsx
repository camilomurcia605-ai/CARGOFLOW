"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const p = usePathname();
  const active = exact ? p === href || (href === "/ordenes" && /^\/ordenes\/(?!nueva)/.test(p)) || (href === "/portal" && p.startsWith("/portal/ordenes")) : p.startsWith(href);
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"}`}>
      {children}
    </Link>
  );
}
