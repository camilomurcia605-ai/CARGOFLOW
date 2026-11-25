import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiSession } from "@/lib/auth";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "FACTURACION"]);
  return NextResponse.json(db.select().from(schema.drivers).where(eq(schema.drivers.tenantId, s.tenantId)).orderBy(asc(schema.drivers.name)).all());
});

export const POST = handler(async (req: Request) => {
  const s = await apiSession(["ADMIN", "DESPACHO"]);
  const data = z.object({ name: z.string().trim().min(3), docNumber: z.string().trim().min(5), phone: z.string().optional(), license: z.string().optional() }).parse(await req.json());
  return NextResponse.json(db.insert(schema.drivers).values({ ...data, tenantId: s.tenantId }).returning().get(), { status: 201 });
});
