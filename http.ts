import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";

/** Envuelve un handler para devolver errores JSON consistentes. */
export function handler<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Datos inválidos", details: e.flatten() }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: "Error interno", details: String(e) }, { status: 500 });
    }
  };
}
