import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, type Session } from "@/lib/auth";
import { handler } from "@/lib/http";
import type { Role } from "@/lib/domain";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(await req.json());
  const u = db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase().trim()) }).sync();
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash)))
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  const s: Session = { userId: u.id, tenantId: u.tenantId, role: u.role as Role, clientId: u.clientId, name: u.name, email: u.email };
  const res = NextResponse.json({ ok: true, role: u.role, redirect: u.role === "CLIENTE" ? "/portal" : "/dashboard" });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(s), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1" });
  return res;
});
