import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, detectAnomalies, type OrderSnapshot } from "../src/lib/domain";
import { heuristicExtract, findDates } from "../src/lib/ai";

const base: OrderSnapshot = {
  status: "EN_RUTA",
  clientNit: "900123456-7",
  originCity: "Cali",
  destinationCity: "Bogotá",
  loadDate: new Date(),
  weightKg: 10000,
  vehicleId: "v",
  driverId: "d",
  remesaNumber: "RM-1",
  docTypes: [],
};

test("no se puede cumplir sin cumplido ni remesa", () => {
  const r = canTransition("EN_RUTA", "CUMPLIDA", "DESPACHO", base);
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.some((x) => x.includes("Cumplido")));
});

test("cumple con soportes mínimos", () => {
  const r = canTransition("EN_RUTA", "CUMPLIDA", "DESPACHO", { ...base, docTypes: ["ACTA_ENTREGA", "REMESA"] });
  assert.equal(r.allowed, true);
});

test("rol cliente no puede facturar", () => {
  const r = canTransition("CUMPLIDA", "FACTURADA", "CLIENTE", { ...base, status: "CUMPLIDA" });
  assert.ok(r.reasons.some((x) => x.includes("rol")));
});

test("facturar exige documentos del cliente y bloquea OC distinta", () => {
  const snap: OrderSnapshot = {
    ...base,
    status: "CUMPLIDA",
    purchaseOrderNumber: "OC-100",
    docTypes: ["CUMPLIDO", "REMESA", "FACTURA"],
    clientRequiredDocs: ["ORDEN_COMPRA"],
    invoice: { number: "FE-1", subtotal: 100, total: 100, purchaseOrderRef: "OC-999" },
  };
  const r = canTransition("CUMPLIDA", "FACTURADA", "FACTURACION", snap);
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.some((x) => x.includes("Orden de compra")));
  assert.ok(r.reasons.some((x) => x.includes("OC de la factura")));
});

test("detecta sobrepeso y fechas invertidas", () => {
  const a = detectAnomalies({ ...base, status: "ASIGNADA", weightKg: 40000, vehicleCapacityKg: 34000, loadDate: "2030-01-10", deliveryDate: "2030-01-05" });
  const codes = a.map((x) => x.code);
  assert.ok(codes.includes("SOBREPESO"));
  assert.ok(codes.includes("FECHAS_INVERTIDAS"));
});

test("extractor heurístico entiende un mensaje de WhatsApp", () => {
  const r = heuristicExtract({
    text: "Buenas, necesito una mula para mañana de Cali a Bogotá, 28 toneladas de pasabocas, cargue de 7am a 11am. Contacto: Paola 315 555 0101. OC 45871. Requiere EPP y cita previa.",
    files: [],
  });
  const o = r.orders[0];
  assert.equal(o.originCity, "Cali");
  assert.equal(o.destinationCity, "Bogotá");
  assert.equal(o.weightKg, 28000);
  assert.equal(o.vehicleType, "TRACTOMULA");
  assert.equal(o.loadWindow, "07:00-11:00");
  assert.equal(o.purchaseOrderNumber, "45871");
  assert.ok(o.loadDate);
  assert.ok(o.requirements?.includes("EPP"));
});

test("extractor heurístico procesa un listado CSV", () => {
  const csv = "origen;destino;fecha cargue;peso kg;pedido\nCali;Medellín;2030-02-01;12000;P-1\nYumbo;Cartagena;2030-02-02;30000;P-2";
  const r = heuristicExtract({ text: "", files: [{ name: "despachos.csv", mimeType: "text/csv", data: Buffer.from(csv) }] });
  assert.equal(r.orders.length, 2);
  assert.equal(r.orders[1].destinationCity, "Cartagena");
  assert.equal(r.orders[1].weightKg, 30000);
});

test("fechas relativas y en texto", () => {
  const today = new Date("2030-03-04T12:00:00"); // lunes
  assert.equal(findDates("cargar el 15 de marzo", today)[0].date, "2030-03-15");
  assert.equal(findDates("para mañana", today)[0].date, "2030-03-05");
  assert.equal(findDates("el viernes", today)[0].date, "2030-03-08");
});
