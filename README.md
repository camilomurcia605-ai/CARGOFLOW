# CargaFlow — TMS de carga terrestre con IA

Plataforma SaaS (multi-empresa) para transportadoras de carga: **órdenes de servicio con asistente IA → consecución y despacho → monitoreo en ruta → cumplidos y evidencias → facturación sin glosas → portal del cliente en tiempo real**.

> MVP funcional: la API, las reglas de negocio y las pantallas están conectadas de punta a punta, con datos demo realistas para reuniones de validación.

## Arranque rápido (5 minutos)

Requisitos: Node.js 20+ (probado con 22).

```bash
npm install
cp .env.example .env          # ya trae valores de desarrollo
npm run setup                 # crea la base SQLite (data/) y carga datos demo
npm run dev                   # http://localhost:3000
```

Cuentas demo (clave `demo1234`; en el login hay botones de acceso rápido):

| Rol | Correo | Qué ve |
|---|---|---|
| Administrador | admin@demo.co | Todo |
| Comercial | comercial@demo.co | Órdenes, clientes, creación con IA |
| Despacho / monitoreo | despacho@demo.co | Tablero, calendario, asignación, eventos, cumplidos |
| Facturación | facturacion@demo.co | Bandeja de facturación, cartera |
| Cliente (portal) | cliente@alimentosdelvalle.co | Solo sus envíos, evidencias, facturas; solicita servicios con IA |

`npm run db:reset` deja la demo como nueva antes de cada reunión.

### Activar la IA completa (Claude)
Sin API key, el asistente funciona con un **extractor local** (texto libre, correos, WhatsApp y listados CSV). Para leer **PDF e imágenes** (órdenes de compra escaneadas, fotos de listados) y la **auditoría documental**, agrega en `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-5-5"
```

### Notificaciones reales
Por defecto los envíos a clientes quedan registrados como `SIMULADO` en *Notificaciones y envíos*. Para enviarlos de verdad: `RESEND_API_KEY` (correo), `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp Cloud API) y, por cliente, una `webhookUrl` (POST firmado con HMAC en `X-CargaFlow-Signature`).

## Guion de demo sugerido (10 min)
1. **Cliente** → *Solicitar servicio (IA)* → “Ejemplo: Mensaje de WhatsApp” → *Analizar* → revisar borrador → *Confirmar*.
2. **Despacho** → campana de notificaciones → abrir la orden → *Asignación* (prueba un TURBO: el sistema bloquea por sobrepeso) → asignar tractomula.
3. *Confirmar salida de origen* sin remesa → bloqueo del checklist. Registrar remesa, subir foto de cargue, salir. Registrar *Novedad* y *Llegada*.
4. Intentar cerrar sin cumplido → bloqueo. Subir cumplido y remesa → *Cerrar servicio como cumplido*.
5. **Facturación** → *Facturación* → registrar factura con una OC distinta → bloqueo por inconsistencia OC vs. factura; corregir → facturada.
6. **Cliente** → ve la línea de tiempo, las fotos, el cumplido y descarga la factura.

## Scripts
| Script | Uso |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo / compilación / producción |
| `npm run setup` | Crea esquema + datos demo |
| `npm run db:reset` | Borra y recrea la base demo |
| `npm run db:generate` | Genera migraciones SQL (drizzle-kit) |
| `npm test` | Pruebas de reglas de negocio y extractor IA |
| `npm run typecheck` | Verificación de tipos |

## Despliegue
- **Docker**: `docker build -t cargaflow . && docker run -p 3000:3000 -v cargaflow-data:/app/data -v cargaflow-files:/app/storage --env-file .env cargaflow`
- Cualquier VPS / Railway / Render / Fly.io con volumen persistente. Para Vercel (serverless) primero migra a PostgreSQL + almacenamiento S3 (ver `docs/ARCHITECTURE.md`).
- En producción: cambia `AUTH_SECRET`, `INBOUND_API_KEY` y `WEBHOOK_SIGNING_SECRET`; sirve detrás de HTTPS.

Arquitectura, modelo de datos, endpoints, máquina de estados, lógica de IA y hoja de ruta: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Capturas
| | |
|---|---|
| ![Tablero](docs/screenshots/01-dashboard.png) | ![Asistente IA](docs/screenshots/07-asistente-ia.png) |
| ![Órdenes](docs/screenshots/02-tablero.png) | ![Detalle](docs/screenshots/06-detalle.png) |
| ![Calendario](docs/screenshots/04-calendario.png) | ![Facturación](docs/screenshots/08-facturacion.png) |
| ![Portal cliente](docs/screenshots/09-portal.png) | ![Detalle portal](docs/screenshots/10-portal-detalle.png) |
