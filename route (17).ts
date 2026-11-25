import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiSession } from "@/lib/auth";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "FACTURACION"]);
  return NextResponse.json(db.select().from(schema.clients).where(eq(schema.clients.tenantId, s.tenantId)).orderBy(asc(schema.clients.name)).all());
});

export const POST = handler(async (req: Request) => {
  const s = await apiSession(["ADMIN", "COMERCIAL"]);
  const data = z
    .object({
      name: z.string().trim().min(2),
      nit: z.string().trim().regex(/^[\d.]{6,15}-?\d?$/, "NIT inválido (ej. 900123456-7)"),
      email: z.string().email().optional().or(z.literal("")),
      whatsapp: z.string().optional(),
      city: z.string().optional(),
      requiresPO: z.boolean().optional(),
      requiredDocs: z.array(z.string()).optional(),
      paymentTermsDays: z.coerce.number().int().min(0).max(180).optional(),
      webhookUrl: z.string().url().optional().or(z.literal("")),
    })
    .parse(await req.json());
  const row = db
    .insert(schema.clients)
    .values({ ...data, email: data.email || null, webhookUrl: data.webhookUrl || null, nit: data.nit.replace(/\./g, ""), tenantId: s.tenantId })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
});
