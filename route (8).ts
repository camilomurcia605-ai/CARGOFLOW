import { NextResponse } from "next/server";
import { z } from "zod";
import { apiSession, assertOrderAccess } from "@/lib/auth";
import { handler } from "@/lib/http";
import { transitionOrder } from "@/lib/orders";
import { STATUSES } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** POST { to: "CUMPLIDA", note?: string } — valida rol, máquina de estados y checklist documental */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "COMERCIAL", "DESPACHO", "FACTURACION"]);
  assertOrderAccess(s, params.id);
  const { to, note, location } = z.object({ to: z.enum(STATUSES), note: z.string().optional(), location: z.string().optional() }).parse(await req.json());
  return NextResponse.json(await transitionOrder(s, params.id, to, note, location));
});
