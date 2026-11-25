"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type N = { id: string; title: string; body: string; read: boolean; createdAt: string; orderId: string | null };

export function NotificationBell({ orderBase }: { orderBase: string }) {
  const [data, setData] = useState<{ unread: number; items: N[] }>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await fetch("/api/notifications", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // polling; en producción: SSE/WebSocket
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => { clearInterval(t); document.removeEventListener("click", close); };
  }, []);

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", body: "{}" });
    load();
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notificaciones">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        {data.unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notificaciones</span>
            <button onClick={markAll} className="text-xs text-brand-600 hover:underline">Marcar todas como leídas</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <p className="p-4 text-sm text-slate-500">Sin notificaciones.</p>}
            {data.items.map((n) => (
              <Link key={n.id} href={n.orderId ? `${orderBase}/${n.orderId}` : "#"} onClick={() => setOpen(false)} className={`block border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50 ${n.read ? "" : "bg-brand-50/60"}`}>
                <div className="text-sm font-medium text-slate-800">{n.title}</div>
                <div className="text-xs text-slate-500">{n.body}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("es-CO")}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
