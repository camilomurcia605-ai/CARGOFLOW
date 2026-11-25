import { NextResponse } from "next/server";
import { apiSession, assertOrderAccess } from "@/lib/auth";
import { handler } from "@/lib/http";
import { addTrackingEvent } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** POST { type: SALIDA_ORIGEN|PUNTO_CONTROL|NOVEDAD|RETRASO|LLEGADA_DESTINO, description, location, lat, lng } */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "DESPACHO"]);
  assertOrderAccess(s, params.id);
  return NextResponse.json(await addTrackingEvent(s, params.id, await req.json()), { status: 201 });
});
