# Arquitectura del Sistema — CRM Interno Colonia Cloud

## Qué es esto y qué no es

Este es el CRM de uso interno de Colonia Cloud (agencia de desarrollo web,
marketing y automatizaciones en Colonia del Sacramento, Uruguay). Es
**single-tenant**: una sola organización, el propio equipo de Colonia Cloud.
No se vende a terceros — para eso existe el proyecto hermano `cccloud`
(SaaS multi-tenant, repo y base de datos completamente separados).

El motor del sistema es un ciclo cerrado de cuatro etapas, todas
enganchadas al mismo timeline de actividad por contacto:

```
Prospección (scraping Maps + Claude)
        │
        ▼
   Contacto (WhatsApp / Email)
        │
        ▼
  Cierre (pipeline de Contactos)
        │
        ▼
   Cobro (calendario de pagos + recordatorios automáticos)
```

## Superficies del sistema

| Superficie | Tecnología | Responsabilidad |
|---|---|---|
| **Web** | Next.js 15 (App Router) | UI del CRM: contactos, pipeline, calendario de pagos, configuración de WhatsApp/Email |
| **API** | Hono + Node.js | REST endpoints, auth, jobs |
| **WhatsApp** | Node + Baileys, proceso propio | Socket WebSocket persistente a WhatsApp Web — no puede vivir en un runtime serverless ni compartir proceso con la API |

## Stack por capa

Hereda las decisiones ya validadas en `cccloud` (ver su `DECISIONS.md`),
simplificadas para un solo tenant:

- **Next.js 15 + React 19 + React Aria Components**: mismo enfoque que
  `cccloud` — accesibilidad nativa, sin Tailwind/shadcn, tokens de marca en
  `theme.css` con la paleta e identidad de Colonia Cloud (fondo `#FFFAFA`,
  acento terracota `#C17A5A`, Clash Display + DM Sans).
- **Hono**: framework HTTP para `apps/api`.
- **Drizzle ORM + PostgreSQL**: sin schema-per-tenant — un único schema
  `public`, no hace falta el aislamiento que sí necesita `cccloud`.
- **Better Auth**: autenticación del equipo. Sin modelo de organizaciones —
  un campo `role` (`admin` | `member`) directamente en `user`.
- **BullMQ + Redis**: cola de jobs para envío de WhatsApp/email, scraping
  de prospección y recordatorios de cobro (cron).
- **packages/shared**: tipos TypeScript compartidos entre `web` y `api`,
  sin lógica de negocio.

## Estructura del monorepo

```
Turbo/
├── apps/
│   ├── web/          Next.js — UI del CRM
│   ├── api/           Hono — API REST + auth + jobs
│   └── whatsapp/       Servicio Baileys — proceso propio, socket persistente
├── packages/
│   └── shared/         Tipos compartidos (@colonia-crm/shared)
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

**Reglas de dependencia:** igual que `cccloud` — `web` y `api` importan
`@colonia-crm/shared`; `shared` no importa nada interno; `web` nunca
importa directo de `api` (solo HTTP). `whatsapp` se comunica con `api`
vía BullMQ/Redis, no HTTP directo.

## Estado actual (2026-07-20)

Implementado: `contacts`, `pipelines`/`pipeline_stages`, `deals`, `tasks`,
`tags`/`contact_tags`, `custom_field_definitions`, `contact_activities`
(timeline), auth de equipo con Better Auth. API completa con CRUD, búsqueda,
filtros, operaciones bulk e import CSV (adaptado de `cccloud`, ver
`DECISIONS.md`). Web: página mínima de contactos (lista + alta) para
validar el circuito web → api → db — todavía sin pipeline visual tipo
Kanban ni UI de deals/tasks.

Pendiente (roadmap): WhatsApp (Baileys), Email (IMAP/SMTP), scraping de
prospección (Google Places + Claude), calendario de pagos con recordatorios
automáticos. El schema de `contact_activities` ya reserva los tipos de
evento (`whatsapp_message`, `email`, `payment_due`, `payment_received`,
`scrape_enriched`) para cuando se implementen.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL (recomendado: Neon, mismo proveedor que `cccloud`, proyecto separado) |
| `REDIS_URL` | Cola de jobs (BullMQ) |
| `BETTER_AUTH_SECRET` | Auth |
| `ANTHROPIC_API_KEY` | Enriquecimiento de leads en scraping (Fase 4) |
| `GOOGLE_MAPS_API_KEY` | Prospección vía Google Places API (Fase 4) |
| `EMAIL_IMAP_*` / `EMAIL_SMTP_*` | Correo corporativo — IMAP/SMTP genérico (Fase 3) |
| `WHATSAPP_SERVICE_URL` | URL interna del servicio `apps/whatsapp` |

Ver `.env.example` en la raíz y en cada app.
