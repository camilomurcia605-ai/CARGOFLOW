import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/api/auth/login", "/api/inbound"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const token = req.cookies.get("cf_session")?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));
      role = payload.role as string;
    } catch {}
  }
  if (!role) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // El cliente solo navega su portal
  if (role === "CLIENTE" && !pathname.startsWith("/portal") && !pathname.startsWith("/api/")) return NextResponse.redirect(new URL("/portal", req.url));
  if (role !== "CLIENTE" && pathname.startsWith("/portal")) return NextResponse.redirect(new URL("/dashboard", req.url));
  if (pathname === "/") return NextResponse.redirect(new URL(role === "CLIENTE" ? "/portal" : "/dashboard", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
