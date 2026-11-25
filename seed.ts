/* Datos de demostración realistas para reuniones de validación. Ejecutar: npm run db:seed */
import "./load-env";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema as S } from "../src/lib/db";
import { saveFile } from "../src/lib/storage";

const day = (offset: number, h = 8) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, 0, 0, 0);
  return d;
};

function svgDoc(title: string, sub: string, color: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
<rect width="800" height="560" fill="#f8fafc"/><rect x="24" y="24" width="752" height="512" rx="16" fill="#fff" stroke="${color}" stroke-width="4"/>
<text x="400" y="230" font-family="Arial" font-size="40" font-weight="bold" text-anchor="middle" fill="${color}">${title}</text>
<text x="400" y="290" font-family="Arial" font-size="24" text-anchor="middle" fill="#475569">${sub}</text>
<text x="400" y="340" font-family="Arial" font-size="18" text-anchor="middle" fill="#94a3b8">Documento de demostración · CargaFlow</text></svg>`);
}

async function main() {
  console.log("Limpiando base…");
  for (const t of [S.notifications, S.outboundMessages, S.aiExtractions, S.invoices, S.documents, S.trackingEvents, S.serviceOrders, S.users, S.vehicles, S.drivers, S.clients, S.tenants])
    db.delete(t).run();

  const tenant = db.insert(S.tenants).values({ name: "Transportes Andinos de Carga S.A.S.", nit: "900555123-4", plan: "PRO", monthlyOrderLimit: 500, association: "Asicarga" }).returning().get();
  const T = tenant.id;

  const mkClient = (v: typeof S.clients.$inferInsert) => db.insert(S.clients).values(v).returning().get();
  const alimentos = mkClient({
    tenantId: T, name: "Alimentos del Valle S.A.S.", nit: "901234567-8", email: "logistica@alimentosdelvalle.co", whatsapp: "+57 315 555 0101",
    city: "Cali", requiredDocs: ["ORDEN_COMPRA"], requiresPO: true, paymentTermsDays: 45,
  });
  const ferreteria = mkClient({ tenantId: T, name: "Ferretería Industrial Andina S.A.", nit: "860123456-1", email: "despachos@ferreandina.co", city: "Bogotá", paymentTermsDays: 30 });
  const quimicos = mkClient({ tenantId: T, name: "Químicos del Caribe S.A.S.", nit: "900987654-3", email: "trafico@quimicaribe.co", city: "Barranquilla", requiredDocs: ["MANIFIESTO"], paymentTermsDays: 60 });

  const hash = await bcrypt.hash("demo1234", 10);
  const users = (
    [
      { email: "admin@demo.co", name: "Laura Admin", role: "ADMIN" },
      { email: "comercial@demo.co", name: "Andrés Comercial", role: "COMERCIAL" },
      { email: "despacho@demo.co", name: "Marcela Despacho", role: "DESPACHO" },
      { email: "facturacion@demo.co", name: "Jorge Facturación", role: "FACTURACION" },
      { email: "cliente@alimentosdelvalle.co", name: "Paola (Alimentos del Valle)", role: "CLIENTE", clientId: alimentos.id },
      { email: "cliente@ferreandina.co", name: "Ricardo (Ferretería Andina)", role: "CLIENTE", clientId: ferreteria.id },
    ] as { email: string; name: string; role: string; clientId?: string }[]
  ).map((u) => db.insert(S.users).values({ ...u, tenantId: T, passwordHash: hash }).returning().get());
  const [admin, comercial, despacho, facturacion] = users;

  const vehicles = (
    [
      { plate: "SXT-482", type: "TRACTOMULA", capacityKg: 34000, ownerName: "Flota propia" },
      { plate: "WFK-913", type: "TRACTOMULA", capacityKg: 34000, ownerName: "Tercero - J. Ríos" },
      { plate: "TGM-207", type: "SENCILLO", capacityKg: 9000, ownerName: "Flota propia" },
      { plate: "KLM-550", type: "TURBO", capacityKg: 4500, ownerName: "Tercero - C. Vélez" },
      { plate: "RFR-118", type: "REFRIGERADO", capacityKg: 30000, ownerName: "Flota propia" },
      { plate: "DTQ-764", type: "DOBLETROQUE", capacityKg: 17000, ownerName: "Tercero - M. Pardo" },
    ]
  ).map((v) => db.insert(S.vehicles).values({ ...v, tenantId: T }).returning().get());
  const drivers = (
    [
      { name: "Carlos Mejía", docNumber: "79.456.123", phone: "+57 310 222 3344", license: "C3" },
      { name: "Wilson Rojas", docNumber: "80.112.987", phone: "+57 311 765 4433", license: "C3" },
      { name: "Fabio Cárdenas", docNumber: "1.023.456.789", phone: "+57 312 998 1122", license: "C2" },
      { name: "Jhon Fredy Ortiz", docNumber: "94.321.654", phone: "+57 314 555 7788", license: "C2" },
      { name: "Héctor Salazar", docNumber: "16.789.234", phone: "+57 316 444 9900", license: "C3" },
      { name: "Óscar Bermúdez", docNumber: "71.222.333", phone: "+57 318 333 2211", license: "C3" },
    ]
  ).map((d) => db.insert(S.drivers).values({ ...d, tenantId: T }).returning().get());

  let seq = 0;
  type Spec = {
    client: typeof alimentos; status: string; origin: string; dest: string; load: number; delivery: number; weight: number; vt: string;
    cargo: string; desc: string; rate: number; v?: number; po?: string; incident?: boolean; docs?: string[]; invoice?: { paid?: boolean; poRef?: string; subtotal?: number }; source?: string; late?: boolean;
  };
  const specs: Spec[] = [
    { client: alimentos, status: "PREALERTADA", origin: "Cali", dest: "Bogotá", load: 1, delivery: 2, weight: 28000, vt: "TRACTOMULA", cargo: "GENERAL", desc: "Pasabocas en cajas, 26 estibas", rate: 4200000, po: "OC-45871", source: "PORTAL_CLIENTE" },
    { client: ferreteria, status: "PREALERTADA", origin: "Bogotá", dest: "Medellín", load: 2, delivery: 3, weight: 8000, vt: "SENCILLO", cargo: "GENERAL", desc: "Tubería PVC y accesorios", rate: 2100000, source: "IA" },
    { client: quimicos, status: "PREALERTADA", origin: "Barranquilla", dest: "Bucaramanga", load: -1, delivery: 1, weight: 22000, vt: "TRACTOMULA", cargo: "PELIGROSA", desc: "Hipoclorito de sodio UN1791 en tambores", rate: 5300000 },
    { client: alimentos, status: "EN_CONSECUCION", origin: "Cali", dest: "Barranquilla", load: 1, delivery: 3, weight: 30000, vt: "REFRIGERADO", cargo: "REFRIGERADA", desc: "Lácteos refrigerados 2-6 °C", rate: 6800000, po: "OC-45902" },
    { client: ferreteria, status: "EN_CONSECUCION", origin: "Bogotá", dest: "Villavicencio", load: 0, delivery: 1, weight: 4000, vt: "TURBO", cargo: "GENERAL", desc: "Herramienta eléctrica", rate: 1100000 },
    { client: alimentos, status: "ASIGNADA", origin: "Cali", dest: "Pereira", load: 0, delivery: 0, weight: 8500, vt: "SENCILLO", cargo: "GENERAL", desc: "Galletas, 12 estibas", rate: 1650000, v: 2, po: "OC-45910", docs: [] },
    { client: quimicos, status: "ASIGNADA", origin: "Cartagena", dest: "Medellín", load: 1, delivery: 2, weight: 16000, vt: "DOBLETROQUE", cargo: "GENERAL", desc: "Resinas en sacos", rate: 3900000, v: 5 },
    { client: alimentos, status: "EN_RUTA", origin: "Buenaventura", dest: "Bogotá", load: -1, delivery: 0, weight: 31000, vt: "TRACTOMULA", cargo: "CONTENEDOR", desc: "Contenedor 40' azúcar importada", rate: 5600000, v: 0, po: "OC-45780", docs: ["FOTO_CARGUE", "MANIFIESTO"] },
    { client: ferreteria, status: "EN_RUTA", origin: "Bogotá", dest: "Cali", load: -2, delivery: -1, weight: 20000, vt: "TRACTOMULA", cargo: "GENERAL", desc: "Láminas de acero", rate: 4300000, v: 1, incident: true, docs: ["FOTO_CARGUE"], late: true },
    { client: quimicos, status: "EN_RUTA", origin: "Barranquilla", dest: "Cúcuta", load: -1, delivery: 1, weight: 28000, vt: "REFRIGERADO", cargo: "GENERAL", desc: "Detergentes industriales", rate: 4700000, v: 4, docs: ["FOTO_CARGUE", "MANIFIESTO"] },
    { client: alimentos, status: "CUMPLIDA", origin: "Cali", dest: "Medellín", load: -4, delivery: -3, weight: 26000, vt: "TRACTOMULA", cargo: "GENERAL", desc: "Pasabocas surtidos", rate: 3800000, v: 0, po: "OC-45650", docs: ["FOTO_CARGUE", "FOTO_DESCARGUE", "CUMPLIDO", "REMESA", "ORDEN_COMPRA"] },
    { client: ferreteria, status: "CUMPLIDA", origin: "Bogotá", dest: "Ibagué", load: -3, delivery: -2, weight: 7000, vt: "SENCILLO", cargo: "GENERAL", desc: "Cemento blanco y pegantes", rate: 1500000, v: 2, docs: ["FOTO_CARGUE", "CUMPLIDO"] },
    { client: quimicos, status: "CUMPLIDA", origin: "Barranquilla", dest: "Bogotá", load: -6, delivery: -4, weight: 25000, vt: "TRACTOMULA", cargo: "PELIGROSA", desc: "Soda cáustica UN1823", rate: 6200000, v: 1, docs: ["FOTO_CARGUE", "FOTO_DESCARGUE", "CUMPLIDO", "REMESA", "MANIFIESTO"], late: true },
    { client: alimentos, status: "FACTURADA", origin: "Cali", dest: "Bogotá", load: -12, delivery: -11, weight: 29000, vt: "TRACTOMULA", cargo: "GENERAL", desc: "Pasabocas en cajas", rate: 4200000, v: 0, po: "OC-45501", docs: ["FOTO_CARGUE", "FOTO_DESCARGUE", "CUMPLIDO", "REMESA", "ORDEN_COMPRA", "FACTURA"], invoice: { paid: true } },
    { client: ferreteria, status: "FACTURADA", origin: "Bogotá", dest: "Barranquilla", load: -9, delivery: -7, weight: 21000, vt: "TRACTOMULA", cargo: "GENERAL", desc: "Perfilería de aluminio", rate: 5900000, v: 1, docs: ["FOTO_CARGUE", "CUMPLIDO", "REMESA", "FACTURA"], invoice: {} },
    { client: quimicos, status: "FACTURADA", origin: "Cartagena", dest: "Cali", load: -15, delivery: -13, weight: 15000, vt: "DOBLETROQUE", cargo: "GENERAL", desc: "Pigmentos en sacos", rate: 4800000, v: 5, docs: ["FOTO_CARGUE", "CUMPLIDO", "REMESA", "MANIFIESTO", "FACTURA"], invoice: {} },
  ];

  const docColor: Record<string, string> = { FOTO_CARGUE: "#0ea5e9", FOTO_DESCARGUE: "#0ea5e9", CUMPLIDO: "#16a34a", REMESA: "#7c3aed", ORDEN_COMPRA: "#f59e0b", FACTURA: "#e11d48", MANIFIESTO: "#334155" };
  const docTitle: Record<string, string> = { FOTO_CARGUE: "FOTO DE CARGUE", FOTO_DESCARGUE: "FOTO DE DESCARGUE", CUMPLIDO: "CUMPLIDO FIRMADO", REMESA: "REMESA TERRESTRE", ORDEN_COMPRA: "ORDEN DE COMPRA", FACTURA: "FACTURA ELECTRÓNICA", MANIFIESTO: "MANIFIESTO DE CARGA" };

  for (const s of specs) {
    seq++;
    const code = `OS-${String(seq).padStart(6, "0")}`;
    const vi = s.v;
    const assigned = ["ASIGNADA", "EN_RUTA", "CUMPLIDA", "FACTURADA"].includes(s.status);
    const departed = ["EN_RUTA", "CUMPLIDA", "FACTURADA"].includes(s.status);
    const done = ["CUMPLIDA", "FACTURADA"].includes(s.status);
    const arrived = done ? day(s.delivery + (s.late ? 1 : 0), 15) : null;
    const o = db
      .insert(S.serviceOrders)
      .values({
        tenantId: T, code, clientId: s.client.id, createdById: s.source === "PORTAL_CLIENTE" ? users[4].id : comercial.id, source: s.source ?? "COMERCIAL",
        status: s.status, hasIncident: !!s.incident,
        originCity: s.origin, originAddress: "Bodega principal", destinationCity: s.dest, destinationAddress: "Centro de distribución",
        loadDate: day(s.load, 7), loadWindow: "07:00-11:00", deliveryDate: day(s.delivery, 8), deliveryWindow: "08:00-16:00",
        cargoType: s.cargo, cargoDescription: s.desc, weightKg: s.weight, vehicleType: s.vt, rate: s.rate,
        purchaseOrderNumber: s.po ?? null, contactName: "Jefe de bodega", contactPhone: "+57 300 123 4567",
        requirements: s.cargo === "PELIGROSA" ? "Vehículo con kit de derrames, rotulado UN y conductor con curso de mercancías peligrosas" : "EPP completo, cita previa en portería",
        vehicleId: assigned && vi != null ? vehicles[vi].id : null, driverId: assigned && vi != null ? drivers[vi].id : null,
        remesaNumber: assigned ? `RM-${20250 + seq}` : null, manifiestoNumber: departed ? `MF-${880100 + seq}` : null,
        assignedAt: assigned ? day(s.load - 1, 16) : null, departedAt: departed ? day(s.load, 11) : null,
        arrivedAt: arrived, completedAt: done ? day(s.delivery + (s.late ? 1 : 0), 17) : null,
        invoicedAt: s.status === "FACTURADA" ? day(s.delivery + 2, 10) : null,
        createdAt: day(Math.min(s.load - 2, -1), 9),
      })
      .returning()
      .get();
    const ev = async (type: string, description: string, at: Date, location?: string) =>
      db.insert(S.trackingEvents).values({ orderId: o.id, type, description, createdAt: at, location, createdById: despacho.id }).run();
    await ev("CREADA", `Orden creada por ${s.source === "PORTAL_CLIENTE" ? "portal cliente" : s.source === "IA" ? "asistente IA" : "comercial"}`, day(Math.min(s.load - 2, -1), 9));
    if (assigned && vi != null) await ev("ASIGNACION", `Vehículo ${vehicles[vi].plate} · Conductor ${drivers[vi].name}`, day(s.load - 1, 16));
    if (departed) await ev("SALIDA_ORIGEN", "Salida de origen confirmada", day(s.load, 11), s.origin);
    if (departed && s.status === "EN_RUTA") await ev("PUNTO_CONTROL", "Paso por peaje sin novedad", day(s.load, 17), "Peaje en ruta");
    if (s.incident) await ev("NOVEDAD", "Cierre vial por derrumbe; vehículo detenido en espera de paso", day(s.load + 1, 6), "Vía La Línea");
    if (done) {
      await ev("LLEGADA_DESTINO", "Llegada a destino", arrived!, s.dest);
      await ev("CUMPLIDO", "Servicio cumplido", day(s.delivery + (s.late ? 1 : 0), 17));
    }
    for (const dt of s.docs ?? []) {
      const p = await saveFile(`${T}/${o.id}`, `${dt.toLowerCase()}.svg`, svgDoc(docTitle[dt] ?? dt, `${code} · ${s.origin} → ${s.dest}`, docColor[dt] ?? "#334155"));
      db.insert(S.documents).values({ orderId: o.id, type: dt, fileName: `${dt.toLowerCase()}_${code}.svg`, mimeType: "image/svg+xml", size: 900, storagePath: p, uploadedById: despacho.id }).run();
    }
    if (s.invoice) {
      const sub = s.invoice.subtotal ?? s.rate;
      db.insert(S.invoices)
        .values({
          orderId: o.id, number: `FE-${3400 + seq}`, issueDate: day(s.delivery + 2, 10), dueDate: day(s.delivery + 2 + s.client.paymentTermsDays, 10),
          subtotal: sub, tax: 0, total: sub, purchaseOrderRef: s.po ?? null, remesaRef: `RM-${20250 + seq}`,
          status: s.invoice.paid ? "PAGADA" : "ENVIADA", paidAt: s.invoice.paid ? day(-1) : null,
        })
        .run();
      await ev("FACTURADA", `Factura FE-${3400 + seq} emitida`, day(s.delivery + 2, 10));
    }
  }

  db.insert(S.notifications)
    .values([
      { tenantId: T, audience: "DESPACHO", title: "OS-000009 · Novedad", body: "Bogotá → Cali · Cierre vial por derrumbe en La Línea" },
      { tenantId: T, audience: "CLIENTE", clientId: alimentos.id, title: "OS-000008 · Salida de origen", body: "Buenaventura → Bogotá · Vehículo SXT-482" },
      { tenantId: T, audience: "FACTURACION", title: "OS-000011 · Servicio cumplido", body: "Listo para facturar: soportes completos" },
      { tenantId: T, audience: "DESPACHO", title: "OS-000001 · Orden creada", body: "Nueva orden desde portal cliente (Alimentos del Valle)" },
    ])
    .run();
  db.update(S.tenants).set({ orderSeq: seq }).where(eq(S.tenants.id, T)).run();
  console.log(`Listo: ${seq} órdenes, ${users.length} usuarios. Contraseña de todos: demo1234`);
  void admin; void facturacion;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
