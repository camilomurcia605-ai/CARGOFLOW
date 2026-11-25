import { NextResponse } from "next/server";
import { apiSession, assertOrderAccess } from "@/lib/auth";
import { handler } from "@/lib/http";
import { resolveIncident } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const s = await apiSession(["ADMIN", "DESPACHO"]);
  assertOrderAccess(s, params.id);
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(resolveIncident(s, params.id, body?.note));
});
