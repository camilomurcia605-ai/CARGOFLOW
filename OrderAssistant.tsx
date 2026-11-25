"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CARGO_TYPES, VEHICLE_TYPES } from "@/lib/domain";

type Draft = Record<string, string | number | null | undefined> & { clientId?: string | null };
type Msg = { role: "user" | "assistant"; text: string; files?: string[]; questions?: string[]; provider?: string; warnings?: string[] };
type ClientOpt = { id: string; name: string; nit: string };

const REQUIRED = ["originCity", "destinationCity", "loadDate"];

const EXAMPLES = [
  {
    label: "Mensaje de WhatsApp",
    text: "Buenas tardes, necesito una mula para el próximo lunes de Yumbo a Bogotá. Son 26 estibas de pasabocas, 27 toneladas aprox. Cargue de 6am a 10am en Calle 15 # 32-50 Acopi. Entrega en Funza. Recibe: Andrea 311 456 7890. OC 45980. Requiere EPP completo y cita previa en portería.",
  },
  {
    label: "Correo de despacho",
    text: "Asunto: Programación despacho refrigerado\n\nCliente: Alimentos del Valle S.A.S. NIT 901234567-8\nOrigen: Cali, planta principal\nDestino: Barranquilla, CEDI Malambo\nFecha cargue: 15 de diciembre, entre 8:00 y 12:00\nEntrega: 17 de diciembre\nMercancía: lácteos refrigerados 2-6°C, 30 toneladas\nVehículo: refrigerado (termoking)\nPedido: PD-77812",
  },
];

export function OrderAssistant({ clients, fixedClient, base }: { clients: ClientOpt[]; fixedClient?: ClientOpt | null; base: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hola 👋 Pega aquí el correo, el mensaje de WhatsApp o describe el servicio. También puedes adjuntar la orden de compra, un listado de despachos (CSV) o una foto/PDF. Yo armo la orden y te pido lo que falte antes de crearla.",
    },
  ]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [missing, setMissing] = useState<string[][]>([]);
  const [extractionId, setExtractionId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string }[]>([]);
  const [errors, setErrors] = useState<{ index: number; error: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    if (!text.trim() && !files.length) return;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text, files: files.map((f) => f.name) }]);
    const fd = new FormData();
    fd.set("text", text);
    if (drafts.length) fd.set("draft", JSON.stringify(drafts.map(({ clientId, ...d }) => d)));
    files.forEach((f) => fd.append("files", f));
    setText("");
    setFiles([]);
    try {
      const r = await fetch("/api/ai/extract", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const next: Draft[] = j.orders.map((o: Draft, i: number) => ({ ...o, clientId: fixedClient?.id ?? j.clientIds[i] ?? drafts[i]?.clientId ?? null }));
      setDrafts(next);
      setMissing(j.missing);
      setExtractionId(j.extractionId);
      const allWarnings = Array.from(new Set<string>(j.warnings.flat()));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          provider: j.provider,
          text: `${j.summary || "Listo."} Revisa el borrador a la derecha${next.length > 1 ? ` (${next.length} órdenes)` : ""}.`,
          questions: j.questions,
          warnings: allWarnings.filter((w) => !w.startsWith("Recomendado")),
        },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `No pude procesar la información: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, key: string, value: string) {
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, [key]: value } : x)));
    setMissing((m) => m.map((x, j) => (j === i ? x.filter(() => true) : x)));
  }

  const isMissing = (d: Draft, k: string) => REQUIRED.includes(k) && !d[k];

  async function createAll() {
    setErrors([]);
    const invalid = drafts.findIndex((d) => !d.clientId || REQUIRED.some((k) => !d[k]));
    if (invalid >= 0) {
      setErrors([{ index: invalid, error: "Completa cliente, origen, destino y fecha de cargue." }]);
      return;
    }
    setBusy(true);
    const r = await fetch("/api/ai/create-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders: drafts, extractionId }) });
    const j = await r.json();
    setBusy(false);
    setCreated(j.created ?? []);
    setErrors(j.errors ?? (j.error ? [{ index: -1, error: j.error }] : []));
    if (j.created?.length) {
      const ok = new Set(j.created.map((c: { index: number }) => c.index));
      setDrafts((d) => d.filter((_, i) => !ok.has(i)));
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      {/* Chat */}
      <div className="card flex h-[calc(100vh-180px)] min-h-[560px] flex-col xl:col-span-2">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">IA</span> Asistente de carga de órdenes</div>
          <button className="text-xs text-brand-600 hover:underline" onClick={() => { setDrafts([{ clientId: fixedClient?.id ?? null }]); setMissing([[]]); }}>Llenar manualmente</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.files?.length ? <p className="mt-1 text-xs opacity-80">📎 {m.files.join(", ")}</p> : null}
                {m.warnings?.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-amber-700">{m.warnings.map((w) => <li key={w}>▲ {w}</li>)}</ul>
                ) : null}
                {m.questions?.length ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-600">Para completar la orden:</p>
                    {m.questions.map((q) => <p key={q} className="text-xs">• {q}</p>)}
                  </div>
                ) : null}
                {m.provider && <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">{m.provider === "anthropic" ? "Procesado con IA (Claude)" : "Extracción local (sin API key)"}</p>}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-slate-400">Analizando…</div>}
        </div>
        <div className="border-t p-3">
          {messages.length <= 1 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => <button key={e.label} onClick={() => setText(e.text)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400">Ejemplo: {e.label}</button>)}
            </div>
          )}
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs">
                  📎 {f.name}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">×</button>
                </span>
              ))}
            </div>
          )}
          <textarea
            className="input h-24 resize-none"
            placeholder={drafts.length ? "Responde las preguntas o corrige algo: “la entrega es el viernes en la tarde”…" : "Pega el correo, WhatsApp o describe el servicio…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          />
          <div className="mt-2 flex items-center justify-between">
            <div>
              <input ref={fileRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.tsv" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>📎 Adjuntar</button>
            </div>
            <button className="btn-primary" onClick={send} disabled={busy || (!text.trim() && !files.length)}>Analizar con IA</button>
          </div>
        </div>
      </div>

      {/* Borradores */}
      <div className="space-y-4 xl:col-span-3">
        {created.length > 0 && (
          <div className="card border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            ✅ Se crearon {created.length} orden(es):{" "}
            {created.map((c) => <Link key={c.id} href={`${base}/${c.id}`} className="mr-2 font-semibold underline">{c.code}</Link>)}
            — El área de despacho ya fue notificada.
          </div>
        )}
        {errors.length > 0 && <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{errors.map((e) => <p key={e.index}>{e.index >= 0 ? `Orden ${e.index + 1}: ` : ""}{e.error}</p>)}</div>}
        {drafts.length === 0 && !created.length && (
          <div className="card flex h-64 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Aquí aparecerá el borrador de la orden</p>
            <p className="mt-1 max-w-md">La IA extrae origen, destino, fechas, ventanas horarias, tipo de carga, peso, vehículo, contacto y requisitos. Nada se crea sin tu confirmación.</p>
          </div>
        )}
        {drafts.map((d, i) => (
          <div key={i} className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Orden {drafts.length > 1 ? `${i + 1} de ${drafts.length}` : "(borrador)"}</h3>
              <div className="flex items-center gap-3">
                {(missing[i]?.length ?? 0) > 0 && <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">Faltan: {REQUIRED.filter((k) => !d[k]).length} obligatorio(s)</span>}
                {drafts.length > 1 && <button onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="text-xs text-slate-400 hover:text-rose-600">Descartar</button>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="label">Cliente *</label>
                {fixedClient ? (
                  <input className="input bg-slate-50" value={`${fixedClient.name} · ${fixedClient.nit}`} readOnly />
                ) : (
                  <select className={`input ${!d.clientId ? "border-rose-400 bg-rose-50" : ""}`} value={d.clientId ?? ""} onChange={(e) => update(i, "clientId", e.target.value)}>
                    <option value="">{d.clientName ? `No encontrado: “${d.clientName}” — seleccione` : "Seleccione cliente…"}</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.nit}</option>)}
                  </select>
                )}
              </div>
              <F d={d} i={i} k="purchaseOrderNumber" label="Orden de compra" up={update} />
              <F d={d} i={i} k="customerOrderNumber" label="N° pedido" up={update} />
              <F d={d} i={i} k="originCity" label="Ciudad origen *" up={update} bad={isMissing(d, "originCity")} />
              <F d={d} i={i} k="originAddress" label="Dirección cargue" up={update} />
              <F d={d} i={i} k="destinationCity" label="Ciudad destino *" up={update} bad={isMissing(d, "destinationCity")} />
              <F d={d} i={i} k="destinationAddress" label="Dirección descargue" up={update} />
              <F d={d} i={i} k="loadDate" label="Fecha cargue *" type="date" up={update} bad={isMissing(d, "loadDate")} />
              <F d={d} i={i} k="loadWindow" label="Ventana cargue" placeholder="07:00-11:00" up={update} />
              <F d={d} i={i} k="deliveryDate" label="Fecha entrega" type="date" up={update} />
              <F d={d} i={i} k="deliveryWindow" label="Ventana descargue" placeholder="08:00-16:00" up={update} />
              <div>
                <label className="label">Tipo de carga</label>
                <select className="input" value={(d.cargoType as string) ?? ""} onChange={(e) => update(i, "cargoType", e.target.value)}>
                  <option value="">—</option>
                  {CARGO_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vehículo requerido</label>
                <select className="input" value={(d.vehicleType as string) ?? ""} onChange={(e) => update(i, "vehicleType", e.target.value)}>
                  <option value="">—</option>
                  {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <F d={d} i={i} k="weightKg" label="Peso (kg)" type="number" up={update} />
              <F d={d} i={i} k="packages" label="Unidades / estibas" type="number" up={update} />
              <div className="sm:col-span-2"><F d={d} i={i} k="cargoDescription" label="Descripción mercancía" up={update} /></div>
              <F d={d} i={i} k="contactName" label="Contacto" up={update} />
              <F d={d} i={i} k="contactPhone" label="Teléfono contacto" up={update} />
              <div className="sm:col-span-2 lg:col-span-4"><F d={d} i={i} k="requirements" label="Requisitos de cargue / descargue" up={update} /></div>
              <div className="sm:col-span-2 lg:col-span-4"><F d={d} i={i} k="notes" label="Observaciones" up={update} /></div>
              {!fixedClient && <F d={d} i={i} k="rate" label="Flete pactado (COP)" type="number" up={update} />}
              <F d={d} i={i} k="declaredValue" label="Valor declarado (COP)" type="number" up={update} />
            </div>
          </div>
        ))}
        {drafts.length > 0 && (
          <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <p className="text-sm text-slate-600">Revisa los datos. Al confirmar, la orden queda <b>Prealertada</b> y se notifica a despacho{fixedClient ? "" : " y al cliente"}.</p>
            <button className="btn-primary" onClick={createAll} disabled={busy}>Confirmar y crear {drafts.length > 1 ? `${drafts.length} órdenes` : "orden"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function F({ d, i, k, label, type = "text", placeholder, up, bad }: { d: Draft; i: number; k: string; label: string; type?: string; placeholder?: string; up: (i: number, k: string, v: string) => void; bad?: boolean }) {
  const v = d[k];
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className={`input ${bad ? "border-rose-400 bg-rose-50" : v ? "border-emerald-300" : ""}`}
        type={type}
        placeholder={placeholder}
        value={v == null ? "" : String(v).slice(0, type === "date" ? 10 : undefined)}
        onChange={(e) => up(i, k, e.target.value)}
      />
    </div>
  );
}
