import { and, eq, inArray, type SQL } from "drizzle-orm";
import { schema } from "./db";
import type { Session } from "./auth";

const N = schema.notifications;
/** Qué notificaciones ve cada rol */
export function notificationScope(s: Session): SQL {
  if (s.role === "CLIENTE") return and(eq(N.tenantId, s.tenantId), eq(N.audience, "CLIENTE"), eq(N.clientId, s.clientId ?? "-"))!;
  const aud = s.role === "FACTURACION" ? ["FACTURACION"] : s.role === "ADMIN" ? ["DESPACHO", "FACTURACION"] : ["DESPACHO"];
  return and(eq(N.tenantId, s.tenantId), inArray(N.audience, aud))!;
}

