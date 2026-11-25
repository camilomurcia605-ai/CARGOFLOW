# CargaFlow — Arquitectura técnica

## 1. Visión general

```
┌──────────────────────────── Next.js 14 (App Router, TypeScript) ────────────────────────────┐
│  UI (React Server Components + Client Components, Tailwind)                                  │
│   ├─ Centro de operaciones: tablero, órdenes (kanban/tabla), calendario, monitoreo,          │
│   │   facturación, maestros, notificaciones                                                  │
│   └─ Portal de clientes: mis envíos, detalle con evidencias, solicitud con IA                │
│                                                                                              │
│  middleware.ts ── sesión JWT (cookie httpOnly) + enrutamiento por rol                        │
│                                                                                              │
│  API REST (src/app/api/**/route.ts) ── validación Zod ── errores JSON uniformes              │
│                                                                                              │
│  Dominio (src/lib)                                                                           │
│   ├─ domain.ts      máquina de estados, checklist documental, reglas de anomalías (puro)     │
│   ├─ orders.ts      casos de uso: crear, editar, transicionar, asignar, eventos              │
│   ├─ ai.ts          extracción IA (Claude, tool use) + extractor heurístico + auditoría       │
│   ├─ notify.ts      notificaciones in-app + email / WhatsApp / webhook firmado               │
│   ├─ kpis.ts        indicadores operativos, financieros y de suscripción                     │
│   └─ storage.ts     archivos (driver local; interfaz lista para S3)                          │
│                                                                                              │
│  Datos: Drizzle ORM → SQLite (better-sqlite3) en MVP · PostgreSQL en escala                  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ X-Api-Key                                ▼ HTTPS
  GPS / app conductor / n8n                  Anthropic API · Resend · WhatsApp Cloud · webhooks cliente
  (POST /api/inbound/tracking)
```

**Decisiones clave**
- **Monolito modular** (un solo despliegue) con el dominio aislado en `src/lib`: rápido de iterar el fin de semana y fácil de partir en servicios después.
- **Reglas de negocio puras** en `domain.ts` (sin BD): se prueban con `npm test` y se reutilizan en servidor y cliente.
- **Multi-tenant por columna** `tenant_id` en todas las tablas; toda consulta pasa por `orderScope(session)`, que además limita al rol CLIENTE a sus propias órdenes.
- **La IA nunca crea órdenes sola**: produce borradores; el usuario confirma (`/api/ai/extract` → revisión → `/api/ai/create-orders`). Cada extracción queda en bitácora (`ai_extractions`).

## 2. Roles y permisos

| Acción | ADMIN | COMERCIAL | DESPACHO | FACTURACION | CLIENTE |
|---|:-:|:-:|:-:|:-:|:-:|
| Crear orden (manual / IA) | ✓ | ✓ | ✓ | | ✓ (solo propia) |
| Editar orden | ✓ | ✓ | ✓ | | solo PREALERTADA, sin flete |
| Prealertada → En consecución | ✓ | ✓ | ✓ | | |
| Asignar vehículo/conductor | ✓ | | ✓ | | |
| Eventos de ruta / cumplir | ✓ | | ✓ | | |
| Registrar factura / facturar | ✓ | | | ✓ | |
| Subir documentos | ✓ | ✓ | ✓ | ✓ | OC y otros |
| Ver flete y anomalías | ✓ | ✓ | ✓ | ✓ | |

## 3. Máquina de estados y checklist documental

```
PREALERTADA ──► EN_CONSECUCION ──► ASIGNADA ──► EN_RUTA ──► CUMPLIDA ──► FACTURADA
     │                 │               │  ▲          (novedad / retraso = bandera hasIncident)
     └─────────────────┴───────────────┴──┴──► CANCELADA
```

| Para pasar a | Requisitos obligatorios | Recomendados |
|---|---|---|
| EN_CONSECUCION | origen, destino, fecha de cargue | |
| ASIGNADA | vehículo, conductor, peso ≤ capacidad | |
| EN_RUTA (salida) | N° de remesa | N° manifiesto (RNDC), foto de cargue |
| CUMPLIDA | cumplido firmado **o** acta de entrega, remesa (documento) | foto de descargue |
| FACTURADA | cumplido/acta, remesa, factura registrada + archivo, documentos exigidos por el cliente (p. ej. OC), N° OC si el cliente lo exige, **sin inconsistencias bloqueantes** | |

La validación está en `canTransition()`; la API devuelve `409` con `details.reasons` y el checklist, que la UI muestra tal cual.

**Eventos automáticos:** `SALIDA_ORIGEN` mueve a EN_RUTA; `NOVEDAD`/`RETRASO` marcan `hasIncident`; `LLEGADA_DESTINO` registra `arrivedAt`; cerrar como cumplida limpia la bandera de novedad (el historial la conserva).

## 4. Detección de anomalías (reglas + IA)

`detectAnomalies()` (reglas deterministas, corren en cada vista):

| Código | Severidad | Condición |
|---|---|---|
| SIN_NIT, SIN_RUTA, SIN_FECHA | error | Campos críticos vacíos |
| FECHAS_INVERTIDAS | error | Entrega antes del cargue |
| SOBREPESO | error | Peso > capacidad del vehículo asignado |
| CUMPLIDA_SIN_SOPORTE | error | Cumplida sin cumplido/acta |
| OC_NO_COINCIDE / REMESA_NO_COINCIDE | error | Factura vs. orden |
| FACTURA_SIN_OC | error | Cliente exige OC y la factura no la referencia |
| VALOR_DIFERENTE | warning | Subtotal facturado ≠ flete pactado (>1 %) |
| CARGUE_VENCIDO, ENTREGA_VENCIDA | warning | Fechas comprometidas vencidas |
| SIN_PESO, SIN_TARIFA | warning | Datos comerciales incompletos |

**Auditoría documental con IA** (`POST /api/orders/:id/audit`): envía a Claude los PDF/imágenes de OC, remesa, manifiesto, cumplido y factura + los datos de la orden, y devuelve hallazgos estructurados (números distintos, cumplido sin firma o con faltantes anotados, NIT/razón social distintos, cantidades o valores que no cuadran).

## 5. Lógica del asistente IA de carga de órdenes

1. **Entrada** (`POST /api/ai/extract`, multipart): `text` (chat, correo, WhatsApp), `files[]` (PDF, imágenes, CSV/TXT) y `draft` (borrador actual, para conversación iterativa).
2. **Con `ANTHROPIC_API_KEY`**: se arma un mensaje multimodal (bloques `document` para PDF, `image` para fotos, texto para CSV) con la fecha de hoy en Bogotá y el borrador previo, y se fuerza la herramienta `registrar_ordenes_servicio` (`tool_choice`) cuyo `input_schema` es el esquema de la orden (enums de vehículo y tipo de carga). Resultado: `orders[]` (una por despacho; un listado produce varias), `questions[]`, `warnings[]`, `summary`.
3. **Sin API key o si la IA falla**: extractor heurístico local (ciudades colombianas y abreviaturas, fechas absolutas/relativas — "mañana", "el viernes", "15 de diciembre" —, ventanas horarias am/pm, toneladas→kg, estibas, OC, pedido, NIT, celular, requisitos como EPP o citas, y CSV con encabezados `origen;destino;fecha…`).
4. **Post-proceso en servidor** (no se confía ciegamente en el modelo): limpieza de enums, campos obligatorios faltantes por orden, validaciones (fecha pasada, entrega < cargue, peso > capacidad típica del vehículo, carga refrigerada en vehículo no refrigerado) y **emparejamiento de cliente** por NIT o razón social. Para el rol CLIENTE, el cliente se fija a su empresa.
5. **Confirmación humana**: la UI muestra el borrador editable, resalta lo faltante y solo crea con `POST /api/ai/create-orders`, que aplica la misma validación Zod que la creación manual y el límite del plan.

## 6. Modelo de datos (`src/db/schema.ts`)

| Tabla | Propósito | Campos principales |
|---|---|---|
| `tenants` | Transportadora suscriptora | nit, plan, subscription_status, monthly_order_limit, association (canal gremial), order_seq |
| `users` | Usuarios por rol | tenant_id, email, role, client_id (si CLIENTE), password_hash (bcrypt) |
| `clients` | Generadores de carga | nit, email, whatsapp, webhook_url, required_docs (JSON), requires_po, payment_terms_days |
| `vehicles` / `drivers` | Flota y conductores | placa, tipo, capacidad_kg / cédula, licencia |
| `service_orders` | Orden de servicio | code, status, has_incident, origen/destino, fechas y ventanas, carga, peso, vehículo requerido, requisitos, contacto, flete, OC, pedido, remesa, manifiesto, vehicle_id, driver_id, sellos de tiempo por etapa |
| `tracking_events` | Trazabilidad | type, description, location, lat/lng, visible_to_client |
| `documents` | Soportes | type (FOTO_CARGUE, CUMPLIDO, REMESA, ACTA_ENTREGA, MANIFIESTO, ORDEN_COMPRA, FACTURA…), storage_path |
| `invoices` | Factura por orden | number, issue/due date, subtotal, tax, total, purchase_order_ref, remesa_ref, status (EMITIDA/ENVIADA/PAGADA/ANULADA) |
| `notifications` | Bandeja in-app | audience (CLIENTE/DESPACHO/FACTURACION), client_id, order_id, read |
| `outbound_messages` | Envíos externos | channel (EMAIL/WHATSAPP/WEBHOOK), status (ENVIADO/SIMULADO/ERROR) |
| `ai_extractions` | Bitácora IA | provider, input, archivos, resultado, órdenes creadas |

## 7. API REST

Autenticación por cookie de sesión (`POST /api/auth/login`). Errores: `{ error, details }` con 401/403/404/409/413/422.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | Sesión |
| GET | `/api/orders?status=&q=&clientId=&incident=1` | Lista con anomalías |
| POST | `/api/orders` | Crear orden (cliente: forzada a su empresa) |
| GET / PATCH | `/api/orders/:id` | Detalle con eventos, checklist y anomalías / editar |
| POST | `/api/orders/:id/transition` | `{ to, note }` con validación de rol y checklist |
| POST | `/api/orders/:id/assign` | `{ vehicleId, driverId }` + alerta de vehículo en otra orden activa |
| POST | `/api/orders/:id/events` | `{ type, description, location, lat, lng, visibleToClient }` |
| POST | `/api/orders/:id/resolve-incident` | Cierra la novedad |
| POST | `/api/orders/:id/documents` | multipart `type`, `file[]` (≤ 15 MB) |
| GET | `/api/documents/:id[?download=1]` | Descarga con control de acceso |
| POST / PATCH | `/api/orders/:id/invoice` | Registrar factura / estado de cartera |
| POST | `/api/orders/:id/audit` | Auditoría reglas + IA |
| POST | `/api/ai/extract` | Borradores desde texto/archivos |
| POST | `/api/ai/create-orders` | Crea los borradores confirmados |
| GET / POST | `/api/notifications` | Listar / marcar leídas |
| GET | `/api/kpis` | Indicadores (por cliente en el portal) |
| GET / POST | `/api/clients` · `/api/vehicles` · `/api/drivers` | Maestros |
| POST | `/api/inbound/tracking` | Webhook de entrada (GPS, app conductor, n8n): header `X-Api-Key`, body `{ tenantNit, orderCode, type, … }` |

Ejemplo de integración GPS:
```bash
curl -X POST https://tu-dominio/api/inbound/tracking \
  -H "X-Api-Key: $INBOUND_API_KEY" -H "Content-Type: application/json" \
  -d '{"tenantNit":"900555123-4","orderCode":"OS-000008","type":"PUNTO_CONTROL","description":"Paso por Ibagué","lat":4.43,"lng":-75.21}'
```

## 8. KPIs
Órdenes activas, en ruta, con novedad, % de cumplimiento a tiempo (llegada ≤ fecha compromiso), pendientes por facturar (cantidad y valor), cumplidas sin soportes completos, facturado del mes, cartera abierta y vencida, días promedio de cumplido a factura, cargues por día (14 días), consumo del plan (órdenes/mes vs. límite) y usuarios.

## 9. Seguridad
JWT HS256 en cookie httpOnly/SameSite=Lax (12 h); contraseñas con bcrypt; validación Zod en toda entrada; aislamiento por tenant y cliente en cada consulta y descarga; tamaños máximos de archivo; webhooks salientes firmados con HMAC-SHA256; webhook de entrada con API key. **Pendiente para producción:** rate limiting, recuperación de contraseña/2FA, rotación de secretos, antivirus de archivos y registro de auditoría por usuario.

## 10. Escalar a producción

| Tema | MVP | Producción |
|---|---|---|
| Base de datos | SQLite (archivo en `data/`) | PostgreSQL (Neon/RDS/Supabase): cambiar `sqlite-core` → `pg-core` en `schema.ts` (tipos `text`/`timestamp`/`boolean`/`jsonb`), driver `postgres` en `db.ts`, y `drizzle-kit generate` para migraciones. Las transacciones pasan a `await db.transaction(async tx => …)`. |
| Archivos | Disco local | S3/GCS con URLs firmadas: implementar `saveFile/readFile` en `storage.ts` |
| Tiempo real | Polling cada 20 s | SSE/WebSocket o Supabase Realtime |
| Notificaciones | Envío inline | Cola (BullMQ/SQS) con reintentos; plantillas aprobadas de WhatsApp |
| KPIs | Cálculo en memoria | Consultas agregadas / vistas materializadas |
| Multi-tenant | Columna `tenant_id` | + Row Level Security en Postgres, subdominio por empresa, facturación de la suscripción (Wompi/Stripe) |

## 11. Hoja de ruta sugerida
1. **RNDC (Ministerio de Transporte)**: reporte de remesas y manifiestos vía servicio web desde la orden (los campos ya existen).
2. **Facturación electrónica DIAN** a través de un proveedor tecnológico (API), adjuntando automáticamente el XML/PDF a la orden.
3. **App del conductor (PWA)**: eventos con GPS y foto del cumplido desde el celular, contra `/api/inbound/tracking` y `/documents`.
4. **Tarifador** por ruta/vehículo y cotización automática desde el asistente IA.
5. **Marketplace de vehículos terceros** ("tipo Uber"): publicar la consecución a una red de propietarios con oferta/aceptación.
6. **Panel gremial** (p. ej. Asicarga): métricas agregadas y anónimas de las empresas afiliadas.
