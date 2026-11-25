import { NextResponse } from "next/server";
import { and, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiSession } from "@/lib/auth";
import { notificationScope } from "@/lib/notifications";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const N = schema.notifications;

export const GET = handler(async () => {
  const s = await apiSession();
  const rows = db.select().from(N).where(notificationScope(s)).orderBy(desc(N.createdAt)).limit(50).all();
  return NextResponse.json({ unread: rows.filter((r) => !r.read).length, items: rows });
});

/** POST { ids?: string[] } — marca como leídas (todas si no se envían ids) */
export const POST = handler(async (req: Request) => {
  const s = await apiSession();
  const body = await req.json().catch(() => ({}));
  const where = body?.ids?.length ? and(notificationScope(s), inArray(N.id, body.ids)) : notificationScope(s);
  db.update(N).set({ read: true }).where(where).run();
  return NextResponse.json({ ok: true });
});
