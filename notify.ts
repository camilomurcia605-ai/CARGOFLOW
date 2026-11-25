import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { EVENT_LABEL, type EventType } from "./domain";

type Audience = "CLIENTE" | "DESPACHO" | "FACTURACION";

/** Qué audiencias reciben cada evento */
const ROUTING: Partial<Record<EventType, Audience[]>> = {
  CREADA: ["DESPACHO", "CLIENTE"],
  ASIGNACION: ["CLIENTE"],
  SALIDA_ORIGEN: ["CLIENTE", "DESPACHO"],
  PUNTO_CONTROL: ["CLIENTE"],
  NOVEDAD: ["CLIENTE", "DESPACHO"],
  RETRASO: ["CLIENTE", "DESPACHO"],
  LLEGADA_DESTINO: ["CLIENTE", "DESPACHO"],
  CUMPLIDO: ["CLIENTE", "DESPACHO", "FACTURACION"],
  FACTURADA: ["CLIENTE"],
  CANCELADA: ["CLIENTE", "DESPACHO"],
};

/** Eventos que además salen por canales externos al cliente (email / WhatsApp / webhook) */
const EXTERNAL: EventType[] = ["CREADA", "ASIGNACION", "SALIDA_ORIGEN", "NOVEDAD", "RETRASO", "LLEGADA_DESTINO", "CUMPLIDO", "FACTURADA", "CANCELADA"];

export async function notifyOrderEvent(orderId: string, type: EventType, detail?: string) {
  const order = await db.query.serviceOrders.findFirst({
    where: eq(schema.serviceOrders.id, orderId),
    with: { client: true, vehicle: true, driver: true },
  });
  if (!order) return;
  const audiences = ROUTING[type];
  if (!audiences) return;

  const title = `${order.code} · ${EVENT_LABEL[type]}`;
  const route = `${order.originCity} → ${order.destinationCity}`;
  const body =
    [route, detail, order.vehicle ? `Vehículo ${order.vehicle.plate}` : null, order.driver ? `Conductor ${order.driver.name}` : null]
      .filter(Boolean)
      .join(" · ");

  db.insert(schema.notifications)
    .values(
      audiences.map((a) => ({
      tenantId: order.tenantId,
      audience: a,
      clientId: a === "CLIENTE" ? order.clientId : null,
      orderId: order.id,
      title,
      body,
    })),
    )
    .run();

  if (audiences.includes("CLIENTE") && EXTERNAL.includes(type)) {
    const c = order.client;
    const payload = {
      event: type,
      label: EVENT_LABEL[type],
      order: { id: order.id, code: order.code, status: order.status, origin: order.originCity, destination: order.destinationCity },
      detail: detail ?? null,
      vehicle: order.vehicle?.plate ?? null,
      driver: order.driver?.name ?? null,
      at: new Date().toISOString(),
    };
    const jobs: Promise<unknown>[] = [];
    if (c.email) jobs.push(sendEmail(order.tenantId, c.email, title, body));
    if (c.whatsapp) jobs.push(sendWhatsApp(order.tenantId, c.whatsapp, `${title}\n${body}`));
    if (c.webhookUrl) jobs.push(sendWebhook(order.tenantId, c.webhookUrl, payload));
    await Promise.allSettled(jobs);
  }
}

async function logOutbound(tenantId: string, channel: string, to: string, payload: string, status: string, subject?: string, error?: string) {
  db.insert(schema.outboundMessages).values({ tenantId, channel, to, payload, status, subject, error }).run();
}

async function sendEmail(tenantId: string, to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return logOutbound(tenantId, "EMAIL", to, text, "SIMULADO", subject);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
    });
    await logOutbound(tenantId, "EMAIL", to, text, r.ok ? "ENVIADO" : "ERROR", subject, r.ok ? undefined : await r.text());
  } catch (e) {
    await logOutbound(tenantId, "EMAIL", to, text, "ERROR", subject, String(e));
  }
}

/** WhatsApp Cloud API (Meta). En producción se usan plantillas aprobadas; aquí mensaje de texto. */
async function sendWhatsApp(tenantId: string, to: string, text: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return logOutbound(tenantId, "WHATSAPP", to, text, "SIMULADO");
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body: text } }),
    });
    await logOutbound(tenantId, "WHATSAPP", to, text, r.ok ? "ENVIADO" : "ERROR", undefined, r.ok ? undefined : await r.text());
  } catch (e) {
    await logOutbound(tenantId, "WHATSAPP", to, text, "ERROR", undefined, String(e));
  }
}

/** Webhook firmado con HMAC-SHA256 en el header X-CargaFlow-Signature */
async function sendWebhook(tenantId: string, url: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", process.env.WEBHOOK_SIGNING_SECRET || "dev").update(body).digest("hex");
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CargaFlow-Signature": sig },
      body,
      signal: AbortSignal.timeout(5000),
    });
    await logOutbound(tenantId, "WEBHOOK", url, body, r.ok ? "ENVIADO" : "ERROR", undefined, r.ok ? undefined : `HTTP ${r.status}`);
  } catch (e) {
    await logOutbound(tenantId, "WEBHOOK", url, body, "ERROR", undefined, String(e));
  }
}
