import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession, assertOrderAccess } from "@/lib/auth";
import { handler } from "@/lib/http";
import { assignResources } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "DESPACHO"]);
  assertOrderAccess(s, params.id);
  const { vehicleId, driverId } = z.object({ vehicleId: z.string().min(1), driverId: z.string().min(1) }).parse(await req.json());
  return NextResponse.json(await assignResources(s, params.id, vehicleId, driverId));
});
