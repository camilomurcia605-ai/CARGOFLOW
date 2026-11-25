"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOC_LABEL, VEHICLE_TYPES, type DocType } from "@/lib/domain";

type Field = { k: string; label: string; type?: string; options?: readonly string[]; placeholder?: string };

function MiniForm({ url, fields, submit, extra }: { url: string; fields: Field[]; submit: string; extra?: (v: Record<string, unknown>) => Record<string, unknown> }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra ? extra(v) : v) });
        const j = await r.json();
        setBusy(false);
        if (!r.ok) return setErr(j.details?.fieldErrors ? Object.entries(j.details.fieldErrors).map(([k, m]) => `${k}: ${m}`).join(" · ") : j.error);
        setV({});
        router.refresh();
      }}
    >
      {fields.map((f) =>
        f.options ? (
          <select key={f.k} className="input" value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} required>
            <option value="">{f.label}</option>
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : f.type === "checkbox" ? (
          <label key={f.k} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={v[f.k] === "1"} onChange={(e) => setV({ ...v, [f.k]: e.target.checked ? "1" : "" })} /> {f.label}</label>
        ) : (
          <input key={f.k} className="input" type={f.type ?? "text"} placeholder={f.placeholder ?? f.label} value={v[f.k] ?? ""} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
        ),
      )}
      <button className="btn-primary sm:col-span-2" disabled={busy}>{submit}</button>
      {err && <p className="text-sm text-rose-600 sm:col-span-2">{err}</p>}
    </form>
  );
}

const EXTRA_DOCS: DocType[] = ["ORDEN_COMPRA", "MANIFIESTO", "FOTO_DESCARGUE", "ACTA_ENTREGA"];

export function ClientForm() {
  return (
    <MiniForm
      url="/api/clients"
      submit="Crear cliente"
      fields={[
        { k: "name", label: "Razón social" },
        { k: "nit", label: "NIT (900123456-7)" },
        { k: "email", label: "Correo notificaciones", type: "email" },
        { k: "whatsapp", label: "WhatsApp (+57…)" },
        { k: "city", label: "Ciudad" },
        { k: "paymentTermsDays", label: "Plazo pago (días)", type: "number" },
        { k: "webhookUrl", label: "Webhook (opcional)", placeholder: "https://…" },
        { k: "requiresPO", label: "Exige OC en la factura", type: "checkbox" },
        ...EXTRA_DOCS.map((d) => ({ k: `doc_${d}`, label: `Exige ${DOC_LABEL[d]} para facturar`, type: "checkbox" })),
      ]}
      extra={(v) => ({
        name: v.name, nit: v.nit, email: v.email, whatsapp: v.whatsapp, city: v.city, webhookUrl: v.webhookUrl,
        paymentTermsDays: v.paymentTermsDays || 30, requiresPO: v.requiresPO === "1",
        requiredDocs: EXTRA_DOCS.filter((d) => v[`doc_${d}`] === "1"),
      })}
    />
  );
}
export function VehicleForm() {
  return <MiniForm url="/api/vehicles" submit="Agregar vehículo" fields={[{ k: "plate", label: "Placa (ABC-123)" }, { k: "type", label: "Tipo de vehículo", options: VEHICLE_TYPES }, { k: "capacityKg", label: "Capacidad (kg)", type: "number" }, { k: "ownerName", label: "Propietario / tenedor" }]} />;
}
export function DriverForm() {
  return <MiniForm url="/api/drivers" submit="Agregar conductor" fields={[{ k: "name", label: "Nombre completo" }, { k: "docNumber", label: "Cédula" }, { k: "phone", label: "Celular" }, { k: "license", label: "Categoría licencia (C2, C3)" }]} />;
}
