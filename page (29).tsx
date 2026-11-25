"use client";
import { useState } from "react";

const DEMO = [
  { email: "admin@demo.co", role: "Administrador" },
  { email: "comercial@demo.co", role: "Comercial" },
  { email: "despacho@demo.co", role: "Despacho / Monitoreo" },
  { email: "facturacion@demo.co", role: "Facturación" },
  { email: "cliente@alimentosdelvalle.co", role: "Cliente (portal)" },
];

export default function Login() {
  const [email, setEmail] = useState("despacho@demo.co");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent, as?: string) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: as ?? email, password }) });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return setError(j.error ?? "Error");
    window.location.href = j.redirect;
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold"><Logo /> CargaFlow</div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">Cada carga, de la solicitud a la factura, en un solo lugar.</h1>
          <p className="mt-4 max-w-md text-brand-100">Órdenes con IA, despacho, monitoreo en ruta, cumplidos digitales y facturación sin glosas — con portal en tiempo real para tus clientes.</p>
        </div>
        <p className="text-xs text-brand-100/70">Plataforma SaaS para empresas de transporte de carga terrestre · Colombia</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Ingresar</h2>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div><label className="label">Correo</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className="label">Contraseña</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Ingresando…" : "Ingresar"}</button>
          </form>
          <div className="mt-8">
            <p className="label">Cuentas de demostración (clave demo1234)</p>
            <div className="mt-2 grid gap-2">
              {DEMO.map((d) => (
                <button key={d.email} onClick={() => submit(undefined, d.email)} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-400">
                  <span className="font-medium">{d.role}</span><span className="text-xs text-slate-500">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#1f6feb"/><path d="M7 20h12V11H7v9Zm12-6h3.5L25 17v3h-6v-6Z" fill="#fff"/><circle cx="11" cy="21.5" r="2" fill="#0b2550" stroke="#fff"/><circle cx="22" cy="21.5" r="2" fill="#0b2550" stroke="#fff"/></svg>
  );
}
