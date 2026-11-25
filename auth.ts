import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Role } from "./domain";

export const SESSION_COOKIE = "cf_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export type Session = { userId: string; tenantId: string; role: Role; clientId: string | null; name: string; email: string };

export async function createSessionToken(s: Session) {
  return new SignJWT(s as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifySessionToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

/** Para Server Components: exige sesión (y opcionalmente roles) o redirige. */
export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect(s.role === "CLIENTE" ? "/portal" : "/dashboard");
  return s;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Para Route Handlers: exige sesión o lanza 401/403. */
export async function apiSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "No autenticado");
  if (roles && !roles.includes(s.role)) throw new HttpError(403, "Sin permisos para esta acción");
  return s;
}

/** Filtro de alcance de órdenes: tenant + (si es cliente) solo sus órdenes */
export function orderScope(s: Session) {
  const o = schema.serviceOrders;
  return s.role === "CLIENTE" ? and(eq(o.tenantId, s.tenantId), eq(o.clientId, s.clientId ?? "__none__"))! : eq(o.tenantId, s.tenantId);
}

/** Verifica que la orden exista y sea visible para la sesión (multi-tenant + cliente). */
export function assertOrderAccess(s: Session, id: string) {
  const o = db.select({ id: schema.serviceOrders.id }).from(schema.serviceOrders).where(and(eq(schema.serviceOrders.id, id), orderScope(s))).get();
  if (!o) throw new HttpError(404, "Orden no encontrada");
}
