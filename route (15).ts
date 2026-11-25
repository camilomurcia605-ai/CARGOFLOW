import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth";
import { handler } from "@/lib/http";
import { computeKpis } from "@/lib/kpis";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await apiSession();
  return NextResponse.json(computeKpis(s.tenantId, s.role === "CLIENTE" ? s.clientId : null));
});
