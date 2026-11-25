"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOC_LABEL, MANUAL_EVENTS, EVENT_LABEL, STATUS_LABEL, type DocType, type Status, type ChecklistItem } from "@/lib/domain";

type ApiError = { error: string; details?: { reasons?: string[] } };

function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  async function call(url: string, init: RequestInit, okMsg?: string) {
    setBusy(true);
    setErr([]);
    setInfo(null);
    try {
      const r = await fetch(url, init);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = j as ApiError;
        setErr(e.details?.reasons?.length ? e.details.reasons : [e.error ?? "Error"]);
        return null;
      }
      if (okMsg || j?.warning) setInfo(j?.warning ?? okMsg);
      router.refresh();
      return j;
    } finally {
      setBusy(false);
    }
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { busy, err, info, call, json, setErr };
}

function Feedback({ err, info }: { err: string[]; info: string | null }) {
  return (
    <>
      {err.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-medium">No se pudo completar:</p>
          <ul className="mt-1 list-inside list-disc">{err.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {info && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
export function NextStep({ orderId, status, next, role }: { orderId: string; status: Status; next: { status: Status; items: ChecklistItem[] }[]; role: string }) {
  const { busy, err, info, call, json } = useApi();
  const [note, setNote] = useState("");
  const canCancel = ["PREALERTADA", "EN_CONSECUCION", "ASIGNADA"].includes(status) && ["ADMIN", "COMERCIAL", "DESPACHO"].includes(role);
  if (!next.length && !canCancel) return <p className="text-sm text-slate-500">Esta orden está cerrada ({STATUS_LABEL[status]}).</p>;
  return (
    <div>
      {next.map((n) => {
        const blocked = n.items.some((i) => i.level === "required" && !i.ok);
        return (
          <div key={n.status} className="mb-4">
            <div className="label">Para pasar a {STATUS_LABEL[n.status]}</div>
            <ul className="mt-2 space-y-1.5">
              {n.items.map((i) => (
                <li key={i.key} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${i.ok ? "bg-emerald-500" : i.level === "required" ? "bg-rose-500" : "bg-amber-400"}`}>{i.ok ? "✓" : "!"}</span>
                  <span className={i.ok ? "text-slate-500" : ""}>{i.label}{i.level === "recommended" && <span className="text-xs text-slate-400"> (recomendado)</span>}</span>
                </li>
              ))}
              {!n.items.length && <li className="text-sm text-slate-500">Sin requisitos documentales.</li>}
            </ul>
            {n.status !== "ASIGNADA" && (
              <button className={blocked ? "btn-secondary mt-3 w-full" : "btn-primary mt-3 w-full"} disabled={busy} onClick={() => call(`/api/orders/${orderId}/transition`, json("POST", { to: n.status, note }), `Orden movida a ${STATUS_LABEL[n.status]}`)}>
                {n.status === "EN_RUTA" ? "Confirmar salida de origen" : n.status === "CUMPLIDA" ? "Cerrar servicio como cumplido" : n.status === "FACTURADA" ? "Marcar como facturada" : `Mover a ${STATUS_LABEL[n.status]}`}
              </button>
            )}
            {n.status === "ASIGNADA" && <p className="mt-2 text-xs text-slate-500">Asigna vehículo y conductor en el panel “Asignación”.</p>}
          </div>
        );
      })}
      {next.length > 0 && <input className="input" placeholder="Nota opcional para el historial / cliente" value={note} onChange={(e) => setNote(e.target.value)} />}
      {canCancel && (
        <button className="btn-danger mt-3 w-full" disabled={busy} onClick={() => confirm("¿Cancelar esta orden?") && call(`/api/orders/${orderId}/transition`, json("POST", { to: "CANCELADA", note: note || "Cancelada" }))}>
          Cancelar orden
        </button>
      )}
      <Feedback err={err} info={info} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AssignForm({ orderId, vehicles, drivers, current, requiredType, weightKg }: {
  orderId: string;
  vehicles: { id: string; plate: string; type: string; capacityKg: number }[];
  drivers: { id: string; name: string; phone: string | null }[];
  current: { vehicleId: string | null; driverId: string | null };
  requiredType?: string | null;
  weightKg?: number | null;
}) {
  const { busy, err, info, call, json } = useApi();
  const [v, setV] = useState(current.vehicleId ?? "");
  const [d, setD] = useState(current.driverId ?? "");
  const sorted = [...vehicles].sort((a, b) => Number(b.type === requiredType) - Number(a.type === requiredType));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Vehículo</label>
        <select className="input" value={v} onChange={(e) => setV(e.target.value)}>
          <option value="">Seleccione…</option>
          {sorted.map((x) => (
            <option key={x.id} value={x.id}>
              {x.plate} · {x.type} · {x.capacityKg.toLocaleString("es-CO")} kg{x.type === requiredType ? " ★" : ""}{weightKg && weightKg > x.capacityKg ? " (insuficiente)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Conductor</label>
        <select className="input" value={d} onChange={(e) => setD(e.target.value)}>
          <option value="">Seleccione…</option>
          {drivers.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.phone}</option>)}
        </select>
      </div>
      <button className="btn-primary w-full" disabled={busy || !v || !d} onClick={() => call(`/api/orders/${orderId}/assign`, json("POST", { vehicleId: v, driverId: d }), "Vehículo asignado y cliente notificado")}>
        {current.vehicleId ? "Reasignar" : "Asignar y notificar"}
      </button>
      <Feedback err={err} info={info} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function RefsForm({ orderId, remesa, manifiesto, rate, po }: { orderId: string; remesa: string | null; manifiesto: string | null; rate: number | null; po: string | null }) {
  const { busy, err, info, call, json } = useApi();
  const [f, setF] = useState({ remesaNumber: remesa ?? "", manifiestoNumber: manifiesto ?? "", rate: rate?.toString() ?? "", purchaseOrderNumber: po ?? "" });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div><label className="label">N° remesa</label><input className="input" value={f.remesaNumber} onChange={(e) => setF({ ...f, remesaNumber: e.target.value })} /></div>
      <div><label className="label">N° manifiesto (RNDC)</label><input className="input" value={f.manifiestoNumber} onChange={(e) => setF({ ...f, manifiestoNumber: e.target.value })} /></div>
      <div><label className="label">Orden de compra</label><input className="input" value={f.purchaseOrderNumber} onChange={(e) => setF({ ...f, purchaseOrderNumber: e.target.value })} /></div>
      <div><label className="label">Flete pactado</label><input className="input" type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
      <button className="btn-secondary col-span-2" disabled={busy} onClick={() => call(`/api/orders/${orderId}`, json("PATCH", f), "Datos guardados")}>Guardar referencias</button>
      <div className="col-span-2"><Feedback err={err} info={info} /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function EventForm({ orderId, status, hasIncident }: { orderId: string; status: Status; hasIncident: boolean }) {
  const { busy, err, info, call, json } = useApi();
  const options = MANUAL_EVENTS.filter((t) => (status === "ASIGNADA" ? ["SALIDA_ORIGEN", "NOVEDAD", "RETRASO"].includes(t) : status === "EN_RUTA" ? t !== "SALIDA_ORIGEN" : false));
  const [type, setType] = useState(options[0] ?? "PUNTO_CONTROL");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [visible, setVisible] = useState(true);
  if (!options.length) return <p className="text-sm text-slate-500">El monitoreo se habilita cuando la orden está asignada o en ruta.</p>;

  function gps() {
    navigator.geolocation?.getCurrentPosition((p) => setLocation(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`));
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${type === t ? (t === "NOVEDAD" || t === "RETRASO" ? "bg-rose-600 text-white ring-rose-600" : "bg-brand-600 text-white ring-brand-600") : "bg-white text-slate-600 ring-slate-200"}`}>
            {EVENT_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder="Descripción (ej. paso por peaje Cajamarca)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex gap-2">
          <input className="input" placeholder="Ubicación" value={location} onChange={(e) => setLocation(e.target.value)} />
          <button className="btn-secondary" type="button" onClick={gps} title="Usar GPS del dispositivo">📍</button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible y notificado al cliente</label>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={async () => { const ok = await call(`/api/orders/${orderId}/events`, json("POST", { type, description, location, visibleToClient: visible }), `${EVENT_LABEL[type]} registrado y notificado`); if (ok) { setDescription(""); setLocation(""); } }}>
          Registrar evento
        </button>
        {hasIncident && <button className="btn-secondary" disabled={busy} onClick={() => call(`/api/orders/${orderId}/resolve-incident`, json("POST", { note: description }), "Novedad marcada como resuelta")}>Marcar novedad resuelta</button>}
      </div>
      <Feedback err={err} info={info} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function DocUpload({ orderId, types, defaultType }: { orderId: string; types: DocType[]; defaultType?: DocType }) {
  const { busy, err, info, call } = useApi();
  const [type, setType] = useState<DocType>(defaultType ?? types[0]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-[220px]" value={type} onChange={(e) => setType(e.target.value as DocType)}>
          {types.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}
        </select>
        <input key={key} type="file" multiple accept="image/*,.pdf" capture="environment" className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" onChange={(e) => setFiles(e.target.files)} />
        <button
          className="btn-primary"
          disabled={busy || !files?.length}
          onClick={async () => {
            const fd = new FormData();
            fd.set("type", type);
            Array.from(files!).forEach((f) => fd.append("file", f));
            const ok = await call(`/api/orders/${orderId}/documents`, { method: "POST", body: fd }, `${DOC_LABEL[type]} cargado`);
            if (ok) { setFiles(null); setKey((k) => k + 1); }
          }}
        >
          Subir
        </button>
      </div>
      <Feedback err={err} info={info} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function InvoiceForm({ orderId, invoice, defaults, status }: {
  orderId: string;
  status: Status;
  invoice: { number: string; issueDate: string; subtotal: number; tax: number; purchaseOrderRef: string | null; remesaRef: string | null; status: string } | null;
  defaults: { subtotal: number | null; po: string | null; remesa: string | null };
}) {
  const { busy, err, info, call, json } = useApi();
  const [f, setF] = useState({
    number: invoice?.number ?? "",
    issueDate: (invoice?.issueDate ?? new Date().toISOString()).slice(0, 10),
    subtotal: String(invoice?.subtotal ?? defaults.subtotal ?? ""),
    tax: String(invoice?.tax ?? 0),
    purchaseOrderRef: invoice?.purchaseOrderRef ?? defaults.po ?? "",
    remesaRef: invoice?.remesaRef ?? defaults.remesa ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const editable = status === "CUMPLIDA";

  async function save(andClose: boolean) {
    const ok = await call(`/api/orders/${orderId}/invoice`, json("POST", f), "Factura registrada");
    if (!ok) return;
    if (file) {
      const fd = new FormData();
      fd.set("type", "FACTURA");
      fd.append("file", file);
      if (!(await call(`/api/orders/${orderId}/documents`, { method: "POST", body: fd }))) return;
    }
    if (andClose) await call(`/api/orders/${orderId}/transition`, json("POST", { to: "FACTURADA", note: `Factura ${f.number} emitida` }), "Orden facturada y cliente notificado");
  }

  if (!editable && !invoice) return <p className="text-sm text-slate-500">La facturación se habilita cuando la orden está <b>cumplida</b>.</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">N° factura</label><input className="input" disabled={!editable} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="FE-0001" /></div>
        <div><label className="label">Fecha emisión</label><input className="input" type="date" disabled={!editable} value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></div>
        <div><label className="label">Subtotal</label><input className="input" type="number" disabled={!editable} value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></div>
        <div><label className="label">Impuestos</label><input className="input" type="number" disabled={!editable} value={f.tax} onChange={(e) => setF({ ...f, tax: e.target.value })} /></div>
        <div><label className="label">OC referenciada</label><input className="input" disabled={!editable} value={f.purchaseOrderRef} onChange={(e) => setF({ ...f, purchaseOrderRef: e.target.value })} /></div>
        <div><label className="label">Remesa referenciada</label><input className="input" disabled={!editable} value={f.remesaRef} onChange={(e) => setF({ ...f, remesaRef: e.target.value })} /></div>
      </div>
      {editable && (
        <>
          <div><label className="label">Archivo de factura (PDF/XML/imagen)</label><input type="file" accept=".pdf,.xml,image/*" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" disabled={busy || !f.number} onClick={() => save(false)}>Guardar</button>
            <button className="btn-primary flex-1" disabled={busy || !f.number} onClick={() => save(true)}>Registrar y facturar</button>
          </div>
        </>
      )}
      {invoice && !editable && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Estado cartera: <b>{invoice.status}</b></span>
          {invoice.status !== "PAGADA" && <button className="btn-secondary" disabled={busy} onClick={() => call(`/api/orders/${orderId}/invoice`, json("PATCH", { status: "PAGADA" }), "Factura marcada como pagada")}>Marcar pagada</button>}
          {invoice.status === "EMITIDA" && <button className="btn-ghost" disabled={busy} onClick={() => call(`/api/orders/${orderId}/invoice`, json("PATCH", { status: "ENVIADA" }))}>Marcar enviada</button>}
        </div>
      )}
      <Feedback err={err} info={info} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AuditButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ai: { provider: string; findings: { severity: string; message: string }[] } } | null>(null);
  return (
    <div>
      <button
        className="btn-secondary w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch(`/api/orders/${orderId}/audit`, { method: "POST" });
          setRes(await r.json());
          setBusy(false);
        }}
      >
        {busy ? "Auditando documentos…" : "🔎 Auditar coherencia documental con IA"}
      </button>
      {res && (
        <ul className="mt-3 space-y-1.5">
          {res.ai.findings.map((f, i) => (
            <li key={i} className={`rounded-lg px-3 py-2 text-xs ${f.severity === "error" ? "bg-rose-50 text-rose-800" : f.severity === "warning" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"}`}>{f.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
