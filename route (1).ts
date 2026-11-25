import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiSession } from "@/lib/auth";
import { handler } from "@/lib/http";
import { createOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** POST { orders: [...borradores confirmados con clientId], extractionId? } — crea las órdenes confirmadas por el usuario */
export const POST = handler(async (req: Request) => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "CLIENTE"]);
  const body = z.object({ orders: z.array(z.record(z.string(), z.unknown())).min(1).max(100), extractionId: z.string().optional() }).parse(await req.json());
  const created: { index: number; id: string; code: string }[] = [];
  const errors: { index: number; error: string }[] = [];
  for (const [i, raw] of body.orders.entries()) {
    try {
      if (s.role === "CLIENTE") raw.clientId = s.clientId;
      const o = await createOrder(s, raw, s.role === "CLIENTE" ? "PORTAL_CLIENTE" : "IA");
      created.push({ index: i, id: o.id, code: o.code });
    } catch (e) {
      const err = e as { message?: string; issues?: { path: (string | number)[]; message: string }[] };
      errors.push({ index: i, error: err.issues ? err.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") : err.message ?? String(e) });
    }
  }
  if (body.extractionId && created.length)
    db.update(schema.aiExtractions).set({ orderIds: created.map((c) => c.id) }).where(eq(schema.aiExtractions.id, body.extractionId)).run();
  return NextResponse.json({ created, errors }, { status: created.length ? 201 : 422 });
});
