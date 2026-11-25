import Anthropic from "@anthropic-ai/sdk";
import { CARGO_TYPES, VEHICLE_TYPES } from "./domain";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type DraftOrder = {
  clientName?: string | null;
  clientNit?: string | null;
  originCity?: string | null;
  originAddress?: string | null;
  destinationCity?: string | null;
  destinationAddress?: string | null;
  loadDate?: string | null; // YYYY-MM-DD
  loadWindow?: string | null;
  deliveryDate?: string | null;
  deliveryWindow?: string | null;
  cargoType?: string | null;
  cargoDescription?: string | null;
  weightKg?: number | null;
  volumeM3?: number | null;
  packages?: number | null;
  declaredValue?: number | null;
  vehicleType?: string | null;
  requirements?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  purchaseOrderNumber?: string | null;
  customerOrderNumber?: string | null;
};

export type InputFile = { name: string; mimeType: string; data: Buffer };

export type ExtractionResult = {
  provider: "anthropic" | "heuristic";
  orders: DraftOrder[];
  missing: string[][]; // por orden
  warnings: string[][]; // por orden
  questions: string[];
  summary: string;
};

export const REQUIRED_FIELDS: { key: keyof DraftOrder; label: string }[] = [
  { key: "originCity", label: "Ciudad de origen" },
  { key: "destinationCity", label: "Ciudad de destino" },
  { key: "loadDate", label: "Fecha de cargue" },
];
export const IMPORTANT_FIELDS: { key: keyof DraftOrder; label: string }[] = [
  { key: "weightKg", label: "Peso (kg)" },
  { key: "vehicleType", label: "Tipo de vehículo" },
  { key: "loadWindow", label: "Ventana horaria de cargue" },
  { key: "contactPhone", label: "Teléfono de contacto" },
];

const FIELD_PROPS = {
  clientName: { type: "string", description: "Razón social del cliente generador de la carga" },
  clientNit: { type: "string", description: "NIT del cliente, formato 900123456-7" },
  originCity: { type: "string", description: "Ciudad/municipio de origen (cargue), nombre oficial en Colombia" },
  originAddress: { type: "string", description: "Dirección o sitio de cargue (bodega, planta, puerto)" },
  destinationCity: { type: "string", description: "Ciudad/municipio de destino (descargue)" },
  destinationAddress: { type: "string" },
  loadDate: { type: "string", description: "Fecha de cargue YYYY-MM-DD (resuelve fechas relativas con la fecha de hoy)" },
  loadWindow: { type: "string", description: "Ventana horaria de cargue HH:MM-HH:MM (24h)" },
  deliveryDate: { type: "string", description: "Fecha compromiso de entrega YYYY-MM-DD" },
  deliveryWindow: { type: "string", description: "Ventana horaria de descargue HH:MM-HH:MM" },
  cargoType: { type: "string", enum: [...CARGO_TYPES] },
  cargoDescription: { type: "string", description: "Qué se transporta (producto, empaque)" },
  weightKg: { type: "number", description: "Peso total en kilogramos (convierte toneladas a kg)" },
  volumeM3: { type: "number" },
  packages: { type: "integer", description: "Número de unidades/bultos/estibas" },
  declaredValue: { type: "number", description: "Valor declarado de la mercancía en COP" },
  vehicleType: { type: "string", enum: [...VEHICLE_TYPES], description: "Mula = TRACTOMULA; termoking/frío = REFRIGERADO" },
  requirements: { type: "string", description: "Requisitos de cargue/descargue: EPP, citas, montacargas, sellos, escolta, etc." },
  contactName: { type: "string" },
  contactPhone: { type: "string" },
  notes: { type: "string" },
  purchaseOrderNumber: { type: "string", description: "Número de orden de compra (OC) del cliente" },
  customerOrderNumber: { type: "string", description: "Número de pedido / despacho del cliente" },
} as const;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "registrar_ordenes_servicio",
  description: "Registra el borrador estructurado de una o varias órdenes de servicio de transporte de carga terrestre.",
  input_schema: {
    type: "object",
    properties: {
      orders: {
        type: "array",
        description: "Una entrada por cada despacho/viaje distinto identificado. Si es un listado, una por fila.",
        items: { type: "object", properties: FIELD_PROPS },
      },
      questions: {
        type: "array",
        items: { type: "string" },
        description: "Preguntas concretas y cortas al usuario para completar datos faltantes o ambiguos (máx. 4).",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Inconsistencias detectadas (fechas imposibles, peso excesivo para el vehículo, datos contradictorios).",
      },
      summary: { type: "string", description: "Resumen de una línea de lo entendido." },
    },
    required: ["orders", "questions", "summary"],
  },
};

const SYSTEM = `Eres el asistente de ingreso de órdenes de una plataforma TMS de transporte de carga terrestre en Colombia.
Tu tarea: leer texto libre, correos, mensajes de WhatsApp, órdenes de compra, listados de despachos e imágenes/PDF, y extraer
los datos de cada orden de servicio. Reglas:
- No inventes datos. Si un dato no está, déjalo vacío y pregunta por él.
- Normaliza ciudades a su nombre oficial (ej. "Bta" → "Bogotá", "B/quilla" → "Barranquilla", "Buenaventura puerto" → "Buenaventura").
- Convierte pesos a kg (1 t = 1000 kg). Fechas en YYYY-MM-DD; resuelve "mañana", "el lunes", etc. con la fecha de hoy indicada.
- Ventanas horarias en formato 24h "HH:MM-HH:MM".
- Si recibes un BORRADOR ACTUAL, actualízalo con la nueva información y conserva lo que no cambie.
- Responde SIEMPRE llamando la herramienta registrar_ordenes_servicio. Preguntas en español, cortas y concretas.`;

function todayBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ---------------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------------
export async function extractOrders(params: { text: string; files: InputFile[]; draft?: DraftOrder[] | null; clientHint?: string | null }): Promise<ExtractionResult> {
  let result: Omit<ExtractionResult, "missing" | "warnings"> & { warnings?: string[] };
  if (aiEnabled()) {
    try {
      result = await extractWithClaude(params);
    } catch (e) {
      console.error("Fallo IA, usando heurística:", e);
      result = { ...heuristicExtract(params), summary: "IA no disponible en este momento; se usó extracción local." };
    }
  } else {
    result = heuristicExtract(params);
  }
  const orders = result.orders.map((o) => cleanDraft(o));
  return {
    provider: result.provider,
    orders,
    missing: orders.map((o) => REQUIRED_FIELDS.filter((f) => isEmpty(o[f.key])).map((f) => f.label)),
    warnings: orders.map((o) => [...validateDraft(o), ...(result.warnings ?? [])]),
    questions: result.questions,
    summary: result.summary,
  };
}

async function extractWithClaude(params: { text: string; files: InputFile[]; draft?: DraftOrder[] | null; clientHint?: string | null }) {
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  for (const f of params.files) {
    const b64 = f.data.toString("base64");
    if (/^image\/(png|jpe?g|gif|webp)$/.test(f.mimeType)) {
      content.push({ type: "text", text: `Archivo adjunto (imagen): ${f.name}` });
      content.push({ type: "image", source: { type: "base64", media_type: f.mimeType as "image/png", data: b64 } });
    } else if (f.mimeType === "application/pdf") {
      content.push({ type: "text", text: `Archivo adjunto (PDF): ${f.name}` });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    } else {
      content.push({ type: "text", text: `Archivo adjunto (${f.name}):\n${f.data.toString("utf8").slice(0, 60000)}` });
    }
  }
  const ctx = [
    `Fecha de hoy (America/Bogota): ${todayBogota()}.`,
    params.clientHint ? `El usuario pertenece al cliente: ${params.clientHint}.` : "",
    params.draft?.length ? `BORRADOR ACTUAL:\n${JSON.stringify(params.draft, null, 2)}` : "",
    params.text ? `MENSAJE DEL USUARIO:\n${params.text}` : "Extrae las órdenes de los archivos adjuntos.",
  ]
    .filter(Boolean)
    .join("\n\n");
  content.push({ type: "text", text: ctx });

  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 4096,
    system: SYSTEM,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
    messages: [{ role: "user", content }],
  });
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!tu) throw new Error("La IA no devolvió estructura");
  const out = tu.input as { orders?: DraftOrder[]; questions?: string[]; warnings?: string[]; summary?: string };
  return {
    provider: "anthropic" as const,
    orders: out.orders?.length ? out.orders : params.draft ?? [{}],
    questions: out.questions ?? [],
    warnings: out.warnings ?? [],
    summary: out.summary ?? "",
  };
}

// ---------------------------------------------------------------------------
// Auditoría documental con IA (OC vs remesa vs factura vs cumplido)
// ---------------------------------------------------------------------------
export type AuditFinding = { severity: "error" | "warning" | "info"; message: string };

export async function auditDocumentsWithAI(orderData: Record<string, unknown>, docs: { type: string; name: string; mimeType: string; data: Buffer }[]): Promise<{ provider: string; findings: AuditFinding[] }> {
  if (!aiEnabled()) return { provider: "heuristic", findings: [{ severity: "info", message: "Auditoría IA de contenido documental no configurada (define ANTHROPIC_API_KEY). Se aplicaron solo reglas." }] };
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  for (const d of docs.slice(0, 8)) {
    const b64 = d.data.toString("base64");
    content.push({ type: "text", text: `Documento tipo ${d.type}: ${d.name}` });
    if (/^image\/(png|jpe?g|gif|webp)$/.test(d.mimeType)) content.push({ type: "image", source: { type: "base64", media_type: d.mimeType as "image/png", data: b64 } });
    else if (d.mimeType === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    else content.push({ type: "text", text: d.data.toString("utf8").slice(0, 20000) });
  }
  content.push({
    type: "text",
    text: `Datos de la orden en el sistema:\n${JSON.stringify(orderData, null, 2)}\n\nCompara los documentos entre sí y contra los datos de la orden. Detecta: números de OC/pedido/remesa distintos, valores que no cuadran, fechas incoherentes, cumplido sin firma/sello o con novedades anotadas (faltantes, averías), NIT o razón social distintos, cantidades/peso diferentes. Si todo cuadra, devuelve un hallazgo "info" diciendo que está conforme.`,
  });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 2048,
    system: "Eres auditor de facturación de una transportadora de carga en Colombia. Tu objetivo es evitar glosas y rechazos de facturas.",
    tools: [
      {
        name: "reportar_hallazgos",
        description: "Reporta hallazgos de la auditoría documental",
        input_schema: {
          type: "object",
          properties: {
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: { severity: { type: "string", enum: ["error", "warning", "info"] }, message: { type: "string" } },
                required: ["severity", "message"],
              },
            },
          },
          required: ["findings"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "reportar_hallazgos" },
    messages: [{ role: "user", content }],
  });
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  return { provider: "anthropic", findings: ((tu?.input as { findings?: AuditFinding[] })?.findings ?? []) };
}

// ---------------------------------------------------------------------------
// Extractor heurístico (fallback offline, también útil para demos sin API key)
// ---------------------------------------------------------------------------
const CITIES: Record<string, string> = {
  bogota: "Bogotá", bta: "Bogotá", "bogota dc": "Bogotá", medellin: "Medellín", mde: "Medellín", cali: "Cali",
  barranquilla: "Barranquilla", "b/quilla": "Barranquilla", baq: "Barranquilla", cartagena: "Cartagena",
  buenaventura: "Buenaventura", "santa marta": "Santa Marta", bucaramanga: "Bucaramanga", pereira: "Pereira",
  manizales: "Manizales", armenia: "Armenia", ibague: "Ibagué", neiva: "Neiva", villavicencio: "Villavicencio",
  cucuta: "Cúcuta", pasto: "Pasto", ipiales: "Ipiales", tunja: "Tunja", duitama: "Duitama", sogamoso: "Sogamoso",
  yumbo: "Yumbo", palmira: "Palmira", funza: "Funza", mosquera: "Mosquera", siberia: "Siberia (Cota)", cota: "Cota",
  tocancipa: "Tocancipá", soacha: "Soacha", girardot: "Girardot", facatativa: "Facatativá", madrid: "Madrid (Cundinamarca)",
  rionegro: "Rionegro", itagui: "Itagüí", envigado: "Envigado", sabaneta: "Sabaneta", bello: "Bello",
  monteria: "Montería", sincelejo: "Sincelejo", valledupar: "Valledupar", riohacha: "Riohacha", popayan: "Popayán",
  "puerto boyaca": "Puerto Boyacá", barrancabermeja: "Barrancabermeja", "la dorada": "La Dorada", turbo: "Turbo",
  "santa rosa de cabal": "Santa Rosa de Cabal", tulua: "Tuluá", "buga": "Buga", jamundi: "Jamundí", candelaria: "Candelaria",
  "puerto de cartagena": "Cartagena", "santa marta puerto": "Santa Marta", malambo: "Malambo", soledad: "Soledad",
};

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function findCities(text: string): { city: string; idx: number }[] {
  const t = strip(text);
  const found: { city: string; idx: number }[] = [];
  const keys = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  const taken: [number, number][] = [];
  for (const k of keys) {
    if (k === "turbo") continue; // "turbo" es más probable tipo de vehículo
    const re = new RegExp(`(^|[^a-z])${k.replace(/[/.]/g, "\\$&")}([^a-z]|$)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const start = m.index + m[1].length;
      const end = start + k.length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      found.push({ city: CITIES[k], idx: start });
    }
  }
  return found.sort((a, b) => a.idx - b.idx);
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function findDates(text: string, today = new Date(todayBogota() + "T12:00:00")): { date: string; idx: number }[] {
  const t = strip(text);
  const out: { date: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = reIso.exec(t))) out.push({ date: iso(new Date(+m[1], +m[2] - 1, +m[3])), idx: m.index });
  const reDmy = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g;
  while ((m = reDmy.exec(t))) {
    if (out.some((o) => Math.abs(o.idx - m!.index) < 10)) continue;
    const d = +m[1], mo = +m[2];
    if (d > 31 || mo > 12 || d === 0 || mo === 0) continue;
    let y = m[3] ? +m[3] : today.getFullYear();
    if (y < 100) y += 2000;
    out.push({ date: iso(new Date(y, mo - 1, d)), idx: m.index });
  }
  const reText = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(20\d{2}))?/g;
  while ((m = reText.exec(t))) {
    let y = m[3] ? +m[3] : today.getFullYear();
    const cand = new Date(y, MONTHS[m[2]] - 1, +m[1]);
    if (!m[3] && cand < new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)) cand.setFullYear(++y);
    out.push({ date: iso(cand), idx: m.index });
  }
  const rel: [RegExp, number][] = [[/\bpasado manana\b/g, 2], [/\bmanana\b/g, 1], [/\bhoy\b/g, 0]];
  for (const [re, add] of rel) {
    while ((m = re.exec(t))) {
      if (add === 1 && /pasado\s+$/.test(t.slice(Math.max(0, m.index - 8), m.index))) continue;
      if (add === 1 && /\b(en la|por la|de la)\s+$/.test(t.slice(Math.max(0, m.index - 7), m.index))) continue; // "en la mañana"
      const d = new Date(today);
      d.setDate(d.getDate() + add);
      out.push({ date: iso(d), idx: m.index });
    }
  }
  const reWd = /\b(?:el|este|proximo)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g;
  while ((m = reWd.exec(t))) {
    const d = new Date(today);
    const diff = (WEEKDAYS[m[1]] - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    out.push({ date: iso(d), idx: m.index });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

function toH(h: string, ampm?: string) {
  const [hh, mm = "00"] = h.split(":");
  let n = +hh;
  if (ampm?.startsWith("p") && n < 12) n += 12;
  if (ampm?.startsWith("a") && n === 12) n = 0;
  return `${String(n).padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

function findWindows(text: string) {
  const t = strip(text);
  const re = /(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)?(\d{1,2}(?::\d{2})?)\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?\s*(?:a|-|y|hasta)\s*(?:las\s+)?(\d{1,2}(?::\d{2})?)\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm|h|hrs)?\b/g;
  const out: { win: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const a = m[1], b = m[3];
    if (!a.includes(":") && !b.includes(":") && !m[2] && !m[4]) continue; // evita "2 a 3 estibas"
    const ap2 = m[4]?.replace(/[\s.]/g, "");
    const ap1 = m[2]?.replace(/[\s.]/g, "") ?? (ap2 === "pm" && +a.split(":")[0] < +b.split(":")[0] ? "pm" : undefined);
    out.push({ win: `${toH(a, ap1)}-${toH(b, ap2 === "h" || ap2 === "hrs" ? undefined : ap2)}`, idx: m.index });
  }
  return out;
}

function num(s: string) {
  // "12.500,5" | "12,500.5" | "12500" -> number
  const clean = s.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) return parseFloat(clean.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)) return parseFloat(clean.replace(/,/g, ""));
  return parseFloat(clean.replace(",", "."));
}

function extractOne(text: string): DraftOrder {
  const t = strip(text);
  const d: DraftOrder = {};
  // Ciudades
  const cities = findCities(text);
  const origKw = t.search(/\b(origen|cargue en|recoger en|recogida en|desde|sale de)\b/);
  const destKw = t.search(/\b(destino|entregar en|descargue en|entrega en|hasta|llega a|con destino a)\b/);
  if (origKw >= 0) d.originCity = cities.find((c) => c.idx > origKw)?.city ?? null;
  if (destKw >= 0) d.destinationCity = cities.find((c) => c.idx > destKw && c.city !== d.originCity)?.city ?? null;
  const rest = cities.filter((c) => c.city !== d.originCity && c.city !== d.destinationCity);
  if (!d.originCity && cities.length) d.originCity = (d.destinationCity ? rest[0] : cities[0])?.city ?? null;
  if (!d.destinationCity) d.destinationCity = cities.find((c) => c.city !== d.originCity)?.city ?? null;

  // Fechas y ventanas
  const dates = findDates(text);
  const entregaKw = t.search(/\b(entrega|descargue|llegada)\b[^.\n]{0,40}?(\d|manana|hoy|el\s)/);
  if (dates.length) {
    const delivery = entregaKw >= 0 ? dates.find((x) => x.idx >= entregaKw) : undefined;
    const load = dates.find((x) => x !== delivery) ?? dates[0];
    d.loadDate = load.date;
    d.deliveryDate = delivery && delivery !== load ? delivery.date : dates.find((x) => x !== load && x.idx > load.idx)?.date ?? null;
  }
  const wins = findWindows(text);
  if (wins.length) {
    d.loadWindow = wins[0].win;
    if (wins[1]) d.deliveryWindow = wins[1].win;
  }

  // Peso / volumen / unidades
  let m = t.match(/(\d[\d.,]*)\s*(toneladas|tonelada|ton|tn|t)\b/);
  if (m) d.weightKg = Math.round(num(m[1]) * 1000);
  m = t.match(/(\d[\d.,]*)\s*(kg|kilos|kilogramos|kgs)\b/);
  if (m) d.weightKg = num(m[1]);
  m = t.match(/(\d[\d.,]*)\s*(m3|m³|metros cubicos)/);
  if (m) d.volumeM3 = num(m[1]);
  m = t.match(/(\d+)\s*(cajas|estibas|pallets|paletas|bultos|unidades|paquetes|tambores|sacos|rollos|contenedor(?:es)?)/);
  if (m) d.packages = parseInt(m[1], 10);
  m = t.match(/valor\s+(?:declarado|mercancia|asegurado)[^\d$]{0,15}\$?\s*([\d.,]+)\s*(millones|mm|m)?/);
  if (m) d.declaredValue = num(m[1]) * (m[2] ? 1_000_000 : 1);

  // Vehículo / tipo de carga
  if (/\b(tractomula|mula|tractocamion)\b/.test(t)) d.vehicleType = "TRACTOMULA";
  else if (/\b(refrigerad[oa]|termo\s?king|thermo\s?king|cuarto frio)\b/.test(t)) d.vehicleType = "REFRIGERADO";
  else if (/\bdoble\s?troque\b/.test(t)) d.vehicleType = "DOBLETROQUE";
  else if (/\bcama\s?baja\b/.test(t)) d.vehicleType = "CAMA_BAJA";
  else if (/\bfurgon\b/.test(t)) d.vehicleType = "FURGON";
  else if (/\bturbo\b/.test(t)) d.vehicleType = "TURBO";
  else if (/\bsencillo\b/.test(t)) d.vehicleType = "SENCILLO";

  if (/\b(refrigerad|congelad|cadena de frio|perecedero)/.test(t)) d.cargoType = "REFRIGERADA";
  else if (/\b(peligros|un\s?\d{4}|inflamable|corrosiv|mercancia peligrosa)/.test(t)) d.cargoType = "PELIGROSA";
  else if (/\bgranel\b/.test(t)) d.cargoType = "GRANEL";
  else if (/\bcontenedor|\b(20|40)\s?(pies|ft|')/.test(t)) d.cargoType = "CONTENEDOR";
  else if (/\b(extradimensionad|sobredimensionad)/.test(t)) d.cargoType = "EXTRADIMENSIONADA";
  else if (d.weightKg || d.packages) d.cargoType = "GENERAL";

  const desc = text.match(/(?:mercanc[ií]a|producto|carga)\s*[:\-]\s*([^\n.;]{3,80})/i);
  if (desc) d.cargoDescription = desc[1].trim();

  // Identificadores
  m = t.match(/\bnit\b\.?\s*(?:no\.?|n°|#|:)?\s*([\d.]{6,15}\s*-?\s*\d?)/);
  if (m) d.clientNit = m[1].replace(/[\s.]/g, "");
  const oc = text.match(/(?:\bOC\b|orden de compra)\s*(?:No\.?|N°|#|:|nro\.?)?\s*([A-Z0-9][A-Z0-9\-]{2,})/i);
  if (oc) d.purchaseOrderNumber = oc[1].toUpperCase();
  const ped = text.match(/\bpedido\s*(?:No\.?|N°|#|:|nro\.?)?\s*([A-Z0-9][A-Z0-9\-]{2,})/i);
  if (ped) d.customerOrderNumber = ped[1].toUpperCase();
  const cli = text.match(/(?:cliente|empresa|raz[oó]n social)\s*:\s*([^\n,;]{3,60})/i);
  if (cli) d.clientName = cli[1].trim();

  // Contacto
  const phone = text.match(/(?:\+?57\s?)?(3\d{2})\s?(\d{3})\s?(\d{4})\b/);
  if (phone) d.contactPhone = `+57 ${phone[1]} ${phone[2]} ${phone[3]}`;
  const contact = text.match(/(?:[Cc]ontacto|[Rr]ecibe|[Pp]reguntar por|[Aa]tiende)\s*:?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
  if (contact) d.contactName = contact[1];

  // Direcciones
  const addr = [...text.matchAll(/\b((?:calle|cra|carrera|av\.?|avenida|diagonal|transversal|cl|kr|km)\s*[\w#\-\s.]{3,40}?)(?=[,.;\n]|$)/gi)];
  if (addr[0]) d.originAddress = addr[0][1].trim();
  if (addr[1]) d.destinationAddress = addr[1][1].trim();

  // Requisitos
  const reqs = text
    .split(/[\n.;]+/)
    .map((x) => x.trim())
    .filter((x) => /(requiere|requisito|epp|cita|montacarga|sello|escolta|arnes|carpa|estibado|cargue manual|curso|seguridad social|casco|botas)/i.test(x));
  if (reqs.length) d.requirements = reqs.join(". ");
  return d;
}

function parseCsv(text: string): DraftOrder[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map((h) => strip(h.trim()));
  const idx = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const io = idx("origen"), id = idx("destino");
  if (io < 0 || id < 0) return null;
  const map = {
    loadDate: idx("fecha cargue", "fecha de cargue", "fecha"),
    deliveryDate: idx("fecha entrega", "entrega"),
    weightKg: idx("peso", "kg"),
    packages: idx("unidades", "cajas", "estibas", "bultos"),
    vehicleType: idx("vehiculo", "tipo vehiculo"),
    cargoDescription: idx("producto", "mercancia", "descripcion"),
    contactName: idx("contacto"),
    contactPhone: idx("telefono", "celular"),
    customerOrderNumber: idx("pedido", "despacho"),
    purchaseOrderNumber: idx("oc", "orden de compra"),
    loadWindow: idx("hora", "ventana"),
    originAddress: idx("direccion origen", "dir origen"),
    destinationAddress: idx("direccion destino", "dir destino"),
  };
  return lines.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim());
    const get = (i: number) => (i >= 0 ? c[i] || null : null);
    const fromCity = (v: string | null) => (v ? findCities(v)[0]?.city ?? v : null);
    const dLoad = get(map.loadDate);
    const dDel = map.deliveryDate !== map.loadDate ? get(map.deliveryDate) : null;
    const v = get(map.vehicleType);
    return {
      originCity: fromCity(get(io)),
      destinationCity: fromCity(get(id)),
      loadDate: dLoad ? findDates(dLoad)[0]?.date ?? null : null,
      deliveryDate: dDel ? findDates(dDel)[0]?.date ?? null : null,
      weightKg: get(map.weightKg) ? num(get(map.weightKg)!) : null,
      packages: get(map.packages) ? parseInt(get(map.packages)!, 10) : null,
      vehicleType: v ? extractOne(v).vehicleType ?? null : null,
      cargoDescription: get(map.cargoDescription),
      contactName: get(map.contactName),
      contactPhone: get(map.contactPhone),
      customerOrderNumber: get(map.customerOrderNumber),
      purchaseOrderNumber: get(map.purchaseOrderNumber),
      loadWindow: get(map.loadWindow) ? findWindows(get(map.loadWindow)!)[0]?.win ?? get(map.loadWindow) : null,
      originAddress: get(map.originAddress),
      destinationAddress: get(map.destinationAddress),
      cargoType: "GENERAL",
    };
  });
}

export function heuristicExtract(params: { text: string; files: InputFile[]; draft?: DraftOrder[] | null }) {
  const textFiles = params.files.filter((f) => /^text\/|csv|json|tab-separated/.test(f.mimeType) || /\.(csv|txt|tsv)$/i.test(f.name));
  const binFiles = params.files.filter((f) => !textFiles.includes(f));
  let orders: DraftOrder[] = [];
  for (const f of textFiles) {
    const rows = parseCsv(f.data.toString("utf8"));
    if (rows) orders.push(...rows);
  }
  const freeText = [params.text, ...textFiles.filter((f) => !parseCsv(f.data.toString("utf8"))).map((f) => f.data.toString("utf8"))].join("\n");
  if (freeText.trim()) {
    const one = extractOne(freeText);
    if (params.draft?.length && !orders.length) {
      orders = params.draft.map((d, i) => (i === 0 ? mergeDraft(d, one) : d));
    } else if (!orders.length) orders = [one];
    else orders = orders.map((o) => mergeDraft(o, { requirements: one.requirements, clientNit: one.clientNit, clientName: one.clientName }));
  } else if (params.draft?.length && !orders.length) orders = params.draft;
  if (!orders.length) orders = [{}];

  const questions: string[] = [];
  const o0 = orders[0];
  if (!o0.originCity) questions.push("¿Desde qué ciudad y dirección se carga la mercancía?");
  if (!o0.destinationCity) questions.push("¿Cuál es la ciudad de destino?");
  if (!o0.loadDate) questions.push("¿Qué día y en qué horario se debe cargar?");
  if (!o0.weightKg) questions.push("¿Cuál es el peso aproximado (kg o toneladas)?");
  if (!o0.vehicleType && questions.length < 4) questions.push("¿Qué tipo de vehículo requieren (turbo, sencillo, tractomula, refrigerado…)?");
  if (binFiles.length)
    questions.unshift(`Recibí ${binFiles.length} archivo(s) PDF/imagen. La lectura de documentos e imágenes requiere la IA activada (ANTHROPIC_API_KEY); por ahora extraje solo del texto.`);

  return {
    provider: "heuristic" as const,
    orders,
    questions: questions.slice(0, 5),
    summary: `Se identificaron ${orders.length} orden(es) por extracción local.`,
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function mergeDraft(base: DraftOrder, update: DraftOrder): DraftOrder {
  const out: DraftOrder = { ...base };
  for (const [k, v] of Object.entries(update)) if (!isEmpty(v)) (out as Record<string, unknown>)[k] = v;
  return out;
}

function isEmpty(v: unknown) {
  return v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
}

function cleanDraft(o: DraftOrder): DraftOrder {
  const out: DraftOrder = {};
  for (const k of Object.keys(FIELD_PROPS) as (keyof DraftOrder)[]) {
    const v = o[k];
    if (!isEmpty(v)) (out as Record<string, unknown>)[k] = v;
  }
  if (out.vehicleType && !(VEHICLE_TYPES as readonly string[]).includes(out.vehicleType)) out.vehicleType = null;
  if (out.cargoType && !(CARGO_TYPES as readonly string[]).includes(out.cargoType)) out.cargoType = null;
  return out;
}

const CAPACITY: Record<string, number> = { TURBO: 4500, SENCILLO: 9000, DOBLETROQUE: 17000, TRACTOMULA: 34000, FURGON: 10000, REFRIGERADO: 30000, CAMA_BAJA: 40000 };

export function validateDraft(o: DraftOrder): string[] {
  const w: string[] = [];
  const today = todayBogota();
  if (o.loadDate && o.loadDate < today) w.push("La fecha de cargue está en el pasado.");
  if (o.loadDate && o.deliveryDate && o.deliveryDate < o.loadDate) w.push("La fecha de entrega es anterior a la de cargue.");
  if (o.originCity && o.destinationCity && o.originCity === o.destinationCity) w.push("Origen y destino son la misma ciudad (¿urbano?). Verifica.");
  if (o.weightKg && o.vehicleType && CAPACITY[o.vehicleType] && o.weightKg > CAPACITY[o.vehicleType])
    w.push(`El peso (${o.weightKg} kg) excede la capacidad típica de un ${o.vehicleType} (${CAPACITY[o.vehicleType]} kg).`);
  if (o.cargoType === "REFRIGERADA" && o.vehicleType && o.vehicleType !== "REFRIGERADO") w.push("Carga refrigerada con vehículo no refrigerado.");
  for (const f of IMPORTANT_FIELDS) if (isEmpty(o[f.key])) w.push(`Recomendado completar: ${f.label}.`);
  return w;
}
