import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CargaFlow · Gestión y trazabilidad de carga",
  description: "Plataforma SaaS para transportadoras: órdenes, despacho, monitoreo, cumplidos y facturación con IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
