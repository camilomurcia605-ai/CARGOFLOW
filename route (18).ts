import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiSession } from "@/lib/auth";
import { handler } from "@/lib/http";
import { VEHICLE_TYPES } from "@/lib/domain";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "FACTURACION"]);
  return NextResponse.json(db.select().from(schema.vehicles).where(eq(schema.vehicles.tenantId, s.tenantId)).orderBy(asc(schema.vehicles.plate)).all());
});

export const POST = handler(async (req: Request) => {
  const s = await apiSession(["ADMIN", "DESPACHO"]);
  const data = z
    .object({
      plate: z.string().trim().toUpperCase().regex(/^[A-Z]{3}-?\d{3}[A-Z]?$/, "Placa inválida (ej. SXT-482)"),
      type: z.enum(VEHICLE_TYPES),
      capacityKg: z.coerce.number().int().positive(),
      ownerName: z.string().optional(),
    })
    .parse(await req.json());
  return NextResponse.json(db.insert(schema.vehicles).values({ ...data, tenantId: s.tenantId }).returning().get(), { status: 201 });
});
