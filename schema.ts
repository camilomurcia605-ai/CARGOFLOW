// CargaFlow TMS — Modelo de datos (Drizzle ORM)
// Dialecto SQLite para desarrollo/MVP. Para producción en PostgreSQL ver docs/ARCHITECTURE.md §Base de datos.
// Los "enums" se guardan como texto y se validan con las constantes de src/lib/domain.ts.
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () => ts("created_at").notNull().$defaultFn(() => new Date());

/** Empresa de transporte suscriptora (multi-tenant SaaS) */
export const tenants = sqliteTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  nit: text("nit").notNull().unique(),
  plan: text("plan").notNull().default("PRO"), // BASICO | PRO | ENTERPRISE
  subscriptionStatus: text("subscription_status").notNull().default("ACTIVA"), // TRIAL | ACTIVA | SUSPENDIDA
  monthlyOrderLimit: integer("monthly_order_limit").notNull().default(500),
  association: text("association"), // canal gremial, ej. "Asicarga"
  orderSeq: integer("order_seq").notNull().default(0),
  createdAt: createdAt(),
});

export const users = sqliteTable("users", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // ADMIN | COMERCIAL | DESPACHO | FACTURACION | CLIENTE
  clientId: text("client_id").references(() => clients.id), // solo rol CLIENTE
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

/** Generador de carga (cliente de la transportadora) */
export const clients = sqliteTable(
  "clients",
  {
    id: id(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    nit: text("nit").notNull(),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    city: text("city"),
    address: text("address"),
    /** Tipos de documento adicionales exigidos para facturar, ej. ["ORDEN_COMPRA"] */
    requiredDocs: text("required_docs", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    requiresPO: integer("requires_po", { mode: "boolean" }).notNull().default(false),
    webhookUrl: text("webhook_url"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    createdAt: createdAt(),
  },
  (t) => ({ nitUq: uniqueIndex("clients_tenant_nit").on(t.tenantId, t.nit) }),
);

export const vehicles = sqliteTable(
  "vehicles",
  {
    id: id(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    plate: text("plate").notNull(),
    type: text("type").notNull(), // TURBO | SENCILLO | DOBLETROQUE | TRACTOMULA | FURGON | REFRIGERADO | CAMA_BAJA
    capacityKg: integer("capacity_kg").notNull(),
    ownerName: text("owner_name"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({ plateUq: uniqueIndex("vehicles_tenant_plate").on(t.tenantId, t.plate) }),
);

export const drivers = sqliteTable("drivers", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  docNumber: text("doc_number").notNull(),
  phone: text("phone"),
  license: text("license"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** Orden de servicio de transporte */
export const serviceOrders = sqliteTable(
  "service_orders",
  {
    id: id(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    code: text("code").notNull().unique(), // OS-000123
    clientId: text("client_id").notNull().references(() => clients.id),
    createdById: text("created_by_id").references(() => users.id),
    source: text("source").notNull().default("COMERCIAL"), // PORTAL_CLIENTE | COMERCIAL | IA
    status: text("status").notNull().default("PREALERTADA"),
    hasIncident: integer("has_incident", { mode: "boolean" }).notNull().default(false),

    originCity: text("origin_city").notNull(),
    originAddress: text("origin_address"),
    destinationCity: text("destination_city").notNull(),
    destinationAddress: text("destination_address"),
    loadDate: ts("load_date").notNull(),
    loadWindow: text("load_window"),
    deliveryDate: ts("delivery_date"),
    deliveryWindow: text("delivery_window"),

    cargoType: text("cargo_type"),
    cargoDescription: text("cargo_description"),
    weightKg: real("weight_kg"),
    volumeM3: real("volume_m3"),
    packages: integer("packages"),
    declaredValue: real("declared_value"),
    vehicleType: text("vehicle_type"),
    requirements: text("requirements"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),

    rate: real("rate"), // flete pactado COP
    purchaseOrderNumber: text("purchase_order_number"),
    customerOrderNumber: text("customer_order_number"),
    remesaNumber: text("remesa_number"),
    manifiestoNumber: text("manifiesto_number"), // RNDC

    vehicleId: text("vehicle_id").references(() => vehicles.id),
    driverId: text("driver_id").references(() => drivers.id),

    assignedAt: ts("assigned_at"),
    departedAt: ts("departed_at"),
    arrivedAt: ts("arrived_at"),
    completedAt: ts("completed_at"),
    invoicedAt: ts("invoiced_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => ({
    byStatus: index("orders_tenant_status").on(t.tenantId, t.status),
    byLoad: index("orders_tenant_load").on(t.tenantId, t.loadDate),
  }),
);

export const trackingEvents = sqliteTable(
  "tracking_events",
  {
    id: id(),
    orderId: text("order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    lat: real("lat"),
    lng: real("lng"),
    visibleToClient: integer("visible_to_client", { mode: "boolean" }).notNull().default(true),
    createdById: text("created_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => ({ byOrder: index("events_order").on(t.orderId) }),
);

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    orderId: text("order_id").notNull().references(() => serviceOrders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedById: text("uploaded_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => ({ byOrder: index("documents_order").on(t.orderId) }),
);

export const invoices = sqliteTable("invoices", {
  id: id(),
  orderId: text("order_id").notNull().unique().references(() => serviceOrders.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  issueDate: ts("issue_date").notNull(),
  dueDate: ts("due_date").notNull(),
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull(),
  purchaseOrderRef: text("purchase_order_ref"),
  remesaRef: text("remesa_ref"),
  status: text("status").notNull().default("EMITIDA"), // EMITIDA | ENVIADA | PAGADA | ANULADA
  paidAt: ts("paid_at"),
  createdAt: createdAt(),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    audience: text("audience").notNull(), // CLIENTE | DESPACHO | FACTURACION
    clientId: text("client_id"),
    orderId: text("order_id").references(() => serviceOrders.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({ byAudience: index("notif_tenant_aud").on(t.tenantId, t.audience, t.read) }),
);

/** Bandeja de salida multicanal (email / WhatsApp / webhook) */
export const outboundMessages = sqliteTable("outbound_messages", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  channel: text("channel").notNull(), // EMAIL | WHATSAPP | WEBHOOK
  to: text("to").notNull(),
  subject: text("subject"),
  payload: text("payload").notNull(),
  status: text("status").notNull(), // ENVIADO | SIMULADO | ERROR
  error: text("error"),
  createdAt: createdAt(),
});

/** Bitácora de extracciones IA (auditoría y mejora continua) */
export const aiExtractions = sqliteTable("ai_extractions", {
  id: id(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id"),
  provider: text("provider").notNull(),
  inputText: text("input_text"),
  fileNames: text("file_names", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  result: text("result", { mode: "json" }).notNull(),
  orderIds: text("order_ids", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Relaciones (para consultas con `with`)
// ---------------------------------------------------------------------------
export const tenantsRel = relations(tenants, ({ many }) => ({ users: many(users), clients: many(clients), orders: many(serviceOrders) }));
export const usersRel = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
}));
export const clientsRel = relations(clients, ({ many, one }) => ({ orders: many(serviceOrders), tenant: one(tenants, { fields: [clients.tenantId], references: [tenants.id] }) }));
export const vehiclesRel = relations(vehicles, ({ many }) => ({ orders: many(serviceOrders) }));
export const driversRel = relations(drivers, ({ many }) => ({ orders: many(serviceOrders) }));
export const ordersRel = relations(serviceOrders, ({ one, many }) => ({
  client: one(clients, { fields: [serviceOrders.clientId], references: [clients.id] }),
  vehicle: one(vehicles, { fields: [serviceOrders.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [serviceOrders.driverId], references: [drivers.id] }),
  createdBy: one(users, { fields: [serviceOrders.createdById], references: [users.id] }),
  invoice: one(invoices, { fields: [serviceOrders.id], references: [invoices.orderId] }),
  events: many(trackingEvents),
  documents: many(documents),
}));
export const eventsRel = relations(trackingEvents, ({ one }) => ({
  order: one(serviceOrders, { fields: [trackingEvents.orderId], references: [serviceOrders.id] }),
  createdBy: one(users, { fields: [trackingEvents.createdById], references: [users.id] }),
}));
export const documentsRel = relations(documents, ({ one }) => ({ order: one(serviceOrders, { fields: [documents.orderId], references: [serviceOrders.id] }) }));
export const invoicesRel = relations(invoices, ({ one }) => ({ order: one(serviceOrders, { fields: [invoices.orderId], references: [serviceOrders.id] }) }));

export type Order = typeof serviceOrders.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Doc = typeof documents.$inferSelect;
