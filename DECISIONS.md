# Decisiones de Arquitectura

Registro de decisiones técnicas con fecha y justificación.
Formato: contexto → decisión → razón.

---

## 2026-07-31 — Prospección: búsqueda estructurada + mapa interactivo, `locationBias` no `locationRestriction`

**Contexto:** El input de texto libre de `/app/scraping` ("restaurantes en
Colonia del Sacramento") pasa a un formulario estructurado — Rubro / País /
Ciudad / Barrio / Radio de búsqueda — con un mapa interactivo sincronizado
en ambos sentidos: completar los campos mueve el mapa (geocode), mover el
mapa o ajustar el radio completa los campos (reverse geocode).

**Decisiones:**
1. **`locationBias`, no `locationRestriction`, en `places:searchText`**.
   El plan original asumía que `locationRestriction` con `circle` daba un
   filtro geográfico duro — probado contra la API real, devuelve 400
   ("Unknown name 'circle' at location_restriction"): `locationRestriction`
   en Text Search (New) solo admite `rectangle`, el `circle` únicamente
   existe en `locationBias`. Consecuencia real: el "Radio de búsqueda" es
   una preferencia de ranking, no un filtro absoluto — Google puede colar
   un resultado muy relevante apenas afuera del círculo. Alternativas
   descartadas: `searchNearby` sí soporta `locationRestriction` circular,
   pero no acepta texto libre de rubro (solo `includedTypes` del enum fijo
   de Google) — no sirve para "rubro" como lo pidió el usuario.
2. **Círculo del mapa no interactivo** (`editable:false, draggable:false,
   clickable:false`): con radios de varios km el relleno del círculo cubre
   casi todo el viewport, y el modo `editable` de Google intercepta drags
   que empiezan sobre el relleno, no solo el borde — competiría con
   arrastrar el mapa para reposicionar. El centro del círculo sigue al
   centro del mapa (pin fijo por CSS, patrón tipo selector de ubicación de
   apps de delivery); el radio se ajusta por el input numérico, que
   también actualiza el círculo en vivo.
3. **Geocoding 100% cliente** vía `google.maps.Geocoder` (librería
   `geocoding` del loader), no un endpoint proxy nuevo en el backend — ya
   viene con el mapa cargado, evita una ruta más solo para esto.
4. **La `GOOGLE_MAPS_API_KEY` viaja al cliente por `GET /api/scraping/status`**
   (detrás de `authMiddleware`), no por una var `NEXT_PUBLIC_*` — single
   source of truth en `apps/api/.env`. **Tradeoff de seguridad real:** la
   key es la misma que usa el servidor para Places API y actualmente no
   tiene restricción de HTTP-referrer en Google Cloud Console — cualquier
   usuario logueado del CRM puede leerla del network tab y usarla fuera de
   esta app contra cualquier producto de Google que tenga habilitado, hasta
   la cuota del proyecto. Es un ensanchamiento real de exposición respecto
   a hoy (antes la key nunca salía del servidor), acotado a "cualquier
   compañero con acceso al CRM" en vez de "cualquiera en internet". La
   mitigación real (restringir la key por referrer) queda fuera de este
   repo — requiere acceso a Google Cloud Console que el agente no tiene.

## 2026-07-23 — Módulo "Proyectos" por contacto (hosting, dominio, mantenimiento)

**Contexto:** El admin necesitaba organizar, dentro de la ficha de cada
cliente, el trabajo real entregado: plataforma usada, cuentas digitales
asociadas (Analytics, Search Console, hosting, dominio) y vencimientos de
hosting/dominio/mantenimiento.

**Decisiones:**
- Cada proyecto vive en su propia página (`/contacts/:id/projects/:projectId`),
  mismo patrón lista→ficha que Contactos — no todo apilado en la ficha del
  contacto, que ya era larga.
- Vencimientos (`project_reminders`, tabla única con `kind`: hosting/domain/
  maintenance/other, en vez de tres tablas casi idénticas) **auto-crean una
  Tarea interna** cuando entran en su ventana de aviso — reutiliza el módulo
  de Tareas ya existente. A diferencia de los recordatorios de pago
  (`payments.ts`, que sí le escriben al cliente por WhatsApp/email), estos
  vencimientos son gastos/mantenimiento propios de la agencia: no tiene
  sentido notificar al cliente, así que NO se reutilizó el mecanismo de
  `checkPaymentsAndSendReminders` — se construyó un poller paralelo
  (`lib/project-reminders.ts`) que solo toca `tasks`.
- Recurrencia propia (`ProjectReminderRecurrence`: none/monthly/quarterly/
  biannual/annual) separada de `PaymentRecurrence`, para no acoplar el ciclo
  de mantenimiento de un sitio (ej. trimestral) a los cobros a clientes.
- El campo `accounts` de un proyecto (jsonb key/value) guarda **referencias/
  etiquetas de qué cuenta se usa** (ej. "Google Analytics: cliente@gmail.com"),
  nunca contraseñas — ese es un límite de seguridad explícito, no una
  limitación técnica. Para borrar una entrada se manda el valor como string
  vacío (mismo límite que ya tenía `contacts.customFields`: el PATCH solo
  mergea, no soporta eliminar una key).

---

## 2026-07-22 — Deploy: Vercel (web) + Render (API/WhatsApp), no Fly.io

**Contexto:** Había que deployar el CRM. Se evaluó Vercel + Fly.io (propuesta
inicial del usuario) vs Vercel + Render.

**Decisión:** `apps/web` → Vercel (preview primero). `apps/api` y
`apps/whatsapp` → Render, siguiendo el mismo patrón ya validado en
`cccloud/render.yaml` (Fly.io fue descartado ahí antes por límites del free
tier).

**Incidentes durante el primer deploy a Vercel (preview, proyecto
`colonia-cloud-crm`):**
1. Archivos faltantes en el primer payload (`theme.css`, `lib/api-url.ts`,
   `lib/auth.ts`, todo `app/app/**`) — corregido incluyendo el árbol completo.
2. `ERR_PNPM_META_FETCH_FAIL` / `ERR_INVALID_THIS: Value of "this" must be of
   type URLSearchParams` al correr `pnpm install --no-frozen-lockfile` sin
   lockfile — bug de compatibilidad de pnpm en el entorno de build de Vercel,
   disparado específicamente por la resolución de metadata en vivo contra el
   registro (no reproducible localmente). Fix: generar y subir un
   `pnpm-lock.yaml` real (con `pnpm install --lockfile-only`) y usar
   `pnpm install --frozen-lockfile` — evita el code path de resolución en vivo.
   Cambiar la versión de Node (`engines`) no tuvo efecto; el bug es
   independiente de Node.
3. `Root Directory` (`apps/web`) rompe la resolución del workspace pnpm si se
   deja `installCommand` en automático — Vercel deja de encontrar
   `packages/shared` (`ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE`) y sin
   `installCommand` explícito tampoco encuentra el lockfile (busca en
   `apps/web/pnpm-lock.yaml`, no en la raíz). Se abandonó `rootDirectory` y
   se mantuvo el install/build corriendo desde la raíz del monorepo vía
   `installCommand`/`buildCommand`/`outputDirectory` explícitos.
4. "No Next.js version detected" — la detección de framework de Vercel lee
   el `package.json` de la raíz del repo buscando `next` como dependencia,
   no alcanza con que esté en `apps/web/package.json`. Fix: agregar `next`
   también como devDependency del `package.json` raíz (solo para que la
   detección lo encuentre; el build real sigue siendo
   `pnpm --filter @colonia-crm/web build`).

**Razón para documentarlo:** cualquier futuro deploy a Vercel de este
monorepo (o de `cccloud`, que comparte la misma estructura pnpm+turbo) debe
partir de esta configuración ya probada: lockfile real + `--frozen-lockfile`
+ `next` duplicado en el root `package.json`, sin `rootDirectory`.

---

## 2026-07-20 — Proyecto interno separado de `cccloud`, no una rama del SaaS

**Contexto:** Colonia Cloud ya tiene `cccloud`, un CRM SaaS multi-tenant en
desarrollo pensado para vender a otros negocios. El pedido de este proyecto
es un CRM de uso interno (gestión de los propios leads/clientes de Colonia
Cloud), con WhatsApp, email, scraping de prospección y calendario de cobros.

**Decisión:** Repo, infraestructura y base de datos completamente separados
de `cccloud`. Este proyecto (`Turbo`) es single-tenant.

**Razón:** Son dos productos con audiencias distintas — uno se vende, el
otro es herramienta interna. Mezclarlos en el mismo tenant multi-tenant de
`cccloud` habría forzado a modelar "Colonia Cloud" como un tenant más,
cargando con el aislamiento por schema, la lógica de billing/planes y el
modelo de `members`/organizaciones que ese proyecto necesita para venderse
a terceros pero que acá es puro overhead. Un modelo single-tenant es más
simple de operar y más barato de correr para un solo equipo.

---

## 2026-07-20 — Reutilización directa del CRM core de `cccloud`, adaptado a single-tenant

**Contexto:** `cccloud/apps/api` ya tenía un módulo de CRM maduro y probado:
contactos con búsqueda/filtros/paginación/bulk/import CSV, pipelines, deals,
tasks, tags, custom fields y timeline de actividad — todo sobre Hono +
Drizzle + Better Auth.

**Decisión:** Portar ese código a `Turbo/apps/api` quitando toda la capa de
multi-tenancy (`tenantId` en cada tabla, tablas `tenants`/`members`/
`tenant_modules`/`billing_*`, `tenantMiddleware`) en vez de reescribir el
CRM desde cero.

**Razón:** Es código ya resuelto y con casos borde cubiertos (dedupe de
import CSV, merge no destructivo de custom fields en PATCH, chunking de
updates masivos). Reescribirlo hubiera sido puro riesgo sin beneficio.
La adaptación es mecánica: eliminar una dimensión (tenant) del modelo de
datos, no cambiar su lógica de negocio.

**Impacto:** `assignedTo` (deals/tasks) y el autor de cada actividad del
timeline pasan a referenciar `user.id` de Better Auth directamente (que es
`text`, no `uuid`) en lugar de una tabla `members` intermedia — ya no hace
falta esa indirección sin multi-tenancy. El rol de cada usuario
(`admin` | `member`) vive como columna extra en `user` vía
`additionalFields` de Better Auth, no como tabla aparte.

---

## 2026-07-20 — `contact_activities` como timeline unificado de todo el sistema

**Contexto:** El pedido original describe cuatro herramientas separadas
(contactos, WhatsApp, email, scraping) más un calendario de pagos. Tratarlas
como silos independientes — cuatro pantallas sin relación — hubiera sido
la salida fácil pero no resuelve el problema real: entender de un vistazo
la relación completa con cada lead/cliente.

**Decisión:** Un mensaje de WhatsApp, un email, un vencimiento de pago o un
resultado de scraping enriquecido con Claude son todos filas en la misma
tabla `contact_activities`, con `type` como discriminador
(`whatsapp_message`, `email`, `payment_due`, `payment_received`,
`scrape_enriched`, además de los originales `note`/`status_change`/
`created`/`updated`). El campo ya está declarado en el tipo compartido
`ActivityType` aunque la lógica de escritura de los tipos nuevos se
implementa recién en las fases correspondientes (WhatsApp, email, scraping,
pagos).

**Razón:** Reservar el modelo de datos ahora evita una migración disruptiva
más adelante y fuerza a que cada módulo nuevo se diseñe pensando en cómo
se integra al timeline del contacto, no como una isla.

---

## 2026-07-20 — Baileys corre en proceso propio (`apps/whatsapp`), no dentro de `apps/api`

**Contexto:** Baileys implementa el protocolo de WhatsApp Web — mantiene
un socket WebSocket persistente y autenticado por sesión (vía QR) mientras
el proceso esté vivo.

**Decisión:** Servicio Node dedicado (`apps/whatsapp`), separado de la API
HTTP. Se comunican por BullMQ/Redis (jobs de envío, eventos de mensajes
entrantes), no por llamada HTTP directa.

**Actualización 2026-07-20 (implementación real):** al construir esta fase
se implementó la comunicación entre `apps/api` y `apps/whatsapp` por HTTP
directo con un secreto compartido (`WHATSAPP_INTERNAL_SECRET`), no por
BullMQ/Redis como decía el párrafo anterior. Razón: no hay Redis corriendo
todavía en este entorno (`REDIS_URL` es un placeholder sin usar), y el
volumen de mensajes de una sola agencia no justifica la infraestructura de
colas ahora — dos servicios internos llamándose por HTTP siguen aislados
(un crash de uno no tumba al otro) sin necesitar una pieza más de
infraestructura. BullMQ queda como mejora futura si el volumen o la
necesidad de reintentos automáticos lo justifica — la razón original
(aislar el socket persistente de Baileys en su propio proceso) sigue vigente
y es independiente de este punto.

**Razón:** Un socket persistente no encaja en el modelo request/response de
`apps/api` (que además puede escalar a cero o correr en varias instancias
sin estado compartido). Aislarlo evita que un crash o reconexión de WhatsApp
tumbe la API, y viceversa.

---

## 2026-07-20 — Email: polling de IMAP en vez de IDLE, dentro de `apps/api` (sin servicio propio)

**Contexto:** A diferencia de WhatsApp/Baileys, IMAP no requiere necesariamente
un socket persistente — soporta tanto IDLE (notificación push de mensajes
nuevos, requiere conexión abierta todo el tiempo) como polling periódico
(conectar, revisar no leídos, desconectar).

**Decisión:** Polling simple cada 60 segundos (`pollInbox()` en
`apps/api/src/lib/email.ts`, arrancado desde `index.ts` al bootear el
servidor) en vez de IDLE, y sin un servicio `apps/email` separado — vive
directo en `apps/api`.

**Razón:** IDLE necesitaría el mismo patrón de proceso-dedicado-con-socket-
persistente que Baileys, con la misma complejidad operativa, para ganar
"tiempo real" en algo donde 60 segundos de latencia son irrelevantes (un
email no es un chat). Polling con conectar/desconectar por ciclo es más
simple de operar, más tolerante a que el hosting de correo compartido
(cPanel) cierre conexiones IMAP inactivas, y no obliga a correr un cuarto
proceso en producción. Cada contacto/lead nuevo detectado por email sigue
el mismo patrón que WhatsApp: matching por dirección (case-insensitive) y
auto-creación de lead si no hay match, todo logueado en `contact_activities`
con `type: 'email'`.

**Trade-off aceptado:** un email recibido tarda hasta 60s en aparecer en el
timeline del contacto — aceptable para este caso de uso, a diferencia de un
chat de WhatsApp donde sí importa la inmediatez.

**Corrección 2026-07-20 (post-prueba con la casilla real):** la primera
implementación usaba la flag IMAP `\Seen` para saber qué mensajes ya se
habían procesado (buscar `seen:false`, procesar, marcar `\Seen`). Con la
casilla real de `comunicacion@colonia.cloud` (42 mensajes no leídos
acumulados — notificaciones de GitHub, AWS, Avast, etc., no leads) esto
generó dos problemas: (1) hubiera tratado los 42 mensajes históricos como
leads nuevos, y (2) reintentos de conexión durante el debugging (varios
procesos huérfanos quedaron corriendo en paralelo — ver más abajo) generaron
contactos y actividades duplicadas porque el marcado `\Seen` quedaba a mitad
de camino. Se reemplazó por tracking de UID persistido en
`apps/api/email-poll-state.json` (gitignored): en la primera conexión se
guarda el UID más alto existente como punto de partida SIN procesar nada
(evita importar el historial como leads); en cada poll siguiente se procesan
solo los mensajes con UID mayor al guardado. Ventaja adicional: no depende
de ni modifica el flag de leído/no-leído real de la casilla, que el dueño
puede seguir usando desde su cliente de correo habitual sin interferencia.

---

## 2026-07-20 — Campañas de email: envío secuencial síncrono, sin cola de jobs

**Contexto:** El pedido original incluye "email para campañas" además de
correo 1:1. Una campaña potencialmente manda a decenas o cientos de
contactos.

**Decisión:** `POST /api/email/campaigns` envía secuencialmente, con una
pausa de 300ms entre cada envío, dentro del mismo request HTTP — sin
encolar en BullMQ.

**Razón:** La mayoría de los hostings de correo compartido (cPanel) limitan
la cantidad de envíos por hora y marcan como spam ráfagas de mensajes muy
rápidas — la pausa entre envíos es una medida de higiene real, no solo
código defensivo. Para el volumen esperado de una sola agencia (decenas de
contactos, no miles), el envío síncrono dentro del request es aceptable
aunque la respuesta tarde varios segundos.

**Trade-off aceptado:** con una lista grande de destinatarios el request
puede tardar bastante y no hay reintento automático de los que fallan — si
el volumen de contactos crece mucho, esto se vuelve candidato a moverse a
un job de BullMQ (ya evaluado y descartado por ahora en la decisión de
WhatsApp, mismo razonamiento: no hay Redis corriendo todavía y no se
justifica la infraestructura extra para el volumen actual).

---

## 2026-07-20 — `NODE_OPTIONS=--use-system-ca` en los scripts de `apps/api`

**Contexto:** al conectar por IMAP/SMTP a `imap.hostinger.com` desde la
máquina de desarrollo, Node fallaba con
`unable to verify the first certificate`. La causa: Avast Antivirus
intercepta el tráfico de correo (Mail Shield) y reemplaza el certificado
real por uno propio generado al vuelo, instalado como root CA de confianza
en el almacén de certificados de Windows — pero Node por default solo
confía en su propio bundle de CAs (Mozilla), no en el del sistema operativo.

**Decisión:** `dev`/`start` de `apps/api` corren con
`NODE_OPTIONS=--use-system-ca` (via `cross-env` para que funcione igual en
PowerShell/cmd/bash).

**Razón:** Usar el almacén de certificados del sistema operativo además del
bundle de Node es una práctica razonable en general (no es exclusivo de
este caso de Avast) y no debilita la seguridad — sigue verificando contra
una CA confiable, a diferencia de `rejectUnauthorized: false` que se
descartó explícitamente por eso. En un servidor de producción Linux sin
interceptor de TLS, este flag no cambia nada (usa el almacén de CAs estándar
del sistema, que ya es confiable).

---

## 2026-07-20 — Lección operativa: `taskkill /F` sin `/T` deja huérfanos que siguen corriendo

**Contexto:** Durante el desarrollo se reinició `apps/api`/`apps/whatsapp`
muchas veces vía `taskkill //PID x //F` (sin `/T`, la flag de "árbol
completo"). En Windows, `tsx watch` genera un proceso hijo real (el que
ejecuta el código) separado del proceso que aparece como "dueño" del
puerto — matar solo el padre puede dejar ese hijo corriendo, sin puerto
pero con sus timers (`setInterval` de polling) y conexiones sigue vivo. Se
acumularon **11 procesos huérfanos** de `apps/api`/`apps/whatsapp` en una
sola sesión de trabajo, varios de ellos con conexión IMAP válida
polleando en paralelo — causa directa de los contactos/actividades
duplicados detectados al probar el email real.

**Decisión:** usar siempre `taskkill //PID x //F //T` (con `/T`, mata todo
el árbol de procesos) al reiniciar cualquier servicio de este monorepo
durante desarrollo.

**Impacto:** si en algún momento se ven contactos/actividades duplicados o
comportamiento inconsistente sin causa aparente en el código, lo primero a
revisar es si hay más de un proceso escuchando la lógica de un mismo
servicio — no asumir que "reiniciar" garantiza un solo proceso vivo.

---

## 2026-07-20 — Scraping: Places API (New), Claude Sonnet 5 sin extended thinking, flujo de dos pasos (buscar → revisar → importar)

**Contexto:** El pedido es prospección automática: buscar negocios en Google
Maps por rubro/zona, analizarlos con IA, y dejarlos como leads listos para
contactar por WhatsApp.

**Decisiones:**
1. **Places API (New)** (`places.googleapis.com/v1/places:searchText`), no
   la legacy `maps.googleapis.com/maps/api/place/*` — es la que la API key
   provista tenía habilitada, y de paso es la recomendada actualmente por
   Google.
2. **`thinking: { type: 'disabled' }` explícito** en cada llamada a Claude.
   Sin este flag, `claude-sonnet-5` activa "extended thinking" por default
   y puede consumir casi todo el `max_tokens` pensando (visto en pruebas
   reales: 394 de 400 tokens en pensamiento invisible, truncando la
   respuesta JSON antes de cerrarse) — la tarea es clasificación + redacción
   corta, no necesita razonamiento extendido, y además sale más rápido y
   barato sin él.
3. **Flujo de dos pasos, sin auto-importar**: `POST /api/scraping/search`
   NO crea contactos — devuelve la lista enriquecida para que el usuario
   revise y tilde cuáles importar con `POST /api/scraping/import`. Después
   del incidente con el polling de email (que estuvo a punto de importar 42
   notificaciones automáticas como leads), la postura por default con
   cualquier fuente de datos externa masiva es: mostrar antes de crear, no
   crear a ciegas.
4. **Dedupe por teléfono** (mismo criterio que WhatsApp/email): un negocio
   ya cargado como contacto no se duplica al reimportar la misma búsqueda.

---

## 2026-07-21 — Calendario de pagos: idempotencia por día calendario, no por timer

**Contexto:** Los recordatorios de pago corren en un `setInterval` cada hora
dentro de `apps/api` (mismo patrón sin Redis/BullMQ que WhatsApp/email).
Después de los incidentes de procesos huérfanos de fases anteriores, un
recordatorio que se reenvía cada vez que un proceso extra corre por
accidente sería mucho peor que un lead duplicado — es un mensaje real al
cliente sobre plata.

**Decisión:** la condición para mandar un recordatorio no depende de "hace
cuánto corrió el timer" sino de comparar `lastReminderSentAt` (persistido en
la fila de `payment_schedules`) contra el día calendario de hoy. Si ya se
mandó hoy, no se reenvía — sin importar cuántas veces dispare el intervalo
o cuántos procesos del servicio estén corriendo en simultáneo por error.
Probado en vivo: correr el chequeo dos veces seguidas generó un solo
recordatorio, no dos.

**Recurrencia:** al marcar un cobro recurrente (`monthly`/`annual`) como
`paid`, se crea automáticamente la próxima ocurrencia (mismo criterio que
usan los planes de Marketing Digital y el add-on de hosting anual del
catálogo real de servicios) — sin necesidad de un motor de recurrencia
tipo cron, alcanza con este trigger puntual al cobrar.

---

## 2026-07-21 — WhatsApp: lista blanca de JIDs, no lista negra

**Contexto:** El filtro original de mensajes entrantes excluía solo grupos
(`@g.us`). Con la sesión de WhatsApp ya conectada y corriendo en segundo
plano, un mensaje entrante de un JID no personal (`@broadcast` de estados,
`@lid`, u otro namespace no-1:1) se coló y creó un lead basura
("WhatsApp 130451092062446" — un ID que no es un teléfono real).

**Decisión:** el filtro pasa a ser una lista blanca — solo se procesan
mensajes de JIDs terminados en `@s.whatsapp.net` (chats 1:1 reales),
descartando todo lo demás por default.

**Impacto:** mismo principio que ya se aplicó con el backlog de email y el
scraping — con cualquier fuente de datos externa que pueda traer ruido
inesperado, el default seguro es una lista blanca explícita de qué sí
procesar, no una lista negra de lo que se te ocurrió excluir.

---

## 2026-07-21 — Extracción de email: fetch + regex propio, Claude solo para desempatar

**Contexto:** el usuario pidió obtener el email de cada lead de scraping, y
propuso que Claude "entre" al sitio web de cada negocio a buscarlo. La API
de Messages de Anthropic no tiene un browser real detrás — no puede
"navegar" una URL por sí sola.

**Decisión:** el propio servidor trae el HTML del sitio (`fetch` con
timeout de 8s, probando la home y `/contacto`/`/contact` como fallback) y
busca emails con regex (`mailto:` primero, después texto plano), filtrando
patrones basura conocidos (assets, dominios de plantillas, placeholders de
formulario tipo "tu@email.com"). Si aparece un solo candidato válido, se usa
directo. Si hay varios, Claude elige cuál es el contacto de negocio real
(tarea barata, pocos tokens) — recién ahí interviene la IA.

**Razón:** más rápido, más barato y más confiable que intentar simular
navegación con un LLM. Probado con datos reales: 8 de 20 hoteles de una
búsqueda real tenían email extraíble en el sitio.

**Limitación conocida y aceptada:** sitios 100% SPA (todo el contenido
armado por JavaScript en el cliente) no tienen nada que extraer del HTML
crudo — haría falta un navegador real (Puppeteer/Playwright) para eso, lo
cual no se justifica para el volumen de este caso de uso.

**De yapa:** la Places API (New) devuelve `googleMapsUri` directo (no hace
falta construirlo a mano desde el `place_id`) — se agregó al field mask y
se expone en cada resultado de búsqueda y en el contacto importado
(`customFields.google_maps_url`), junto con el sitio web
(`customFields.website`). El email extraído se guarda directo en la columna
`email` del contacto, quedando usable de inmediato por el módulo de Email.

---

## 2026-07-21 — Prioridad de extracción: página de contacto real antes que el footer de la home

**Contexto:** la primera versión de la extracción de email probaba la home
del sitio primero, y recién si no encontraba nada probaba `/contacto`. El
usuario pidió invertir esa prioridad — el footer de la home mezcla emails
genéricos con redes sociales y otros links, la página de contacto dedicada
es más confiable.

**Decisión:** ahora se busca primero un link explícito a la página de
contacto dentro del HTML de la home (por texto del link o por el href —
"contacto", "contact", "contáctenos", "escribinos", etc.), se la visita, y
de ahí se saca el email. Solo si no hay link explícito se prueban rutas
típicas a ciegas (`/contacto`, `/contact`, etc.), y solo como último
recurso se vuelve a mirar la home (que es donde vive el footer).

**Redes sociales — nuevo campo:** de paso, ya que se están visitando estas
páginas, se extraen también los links a Instagram/Facebook/TikTok/X/
LinkedIn/YouTube/WhatsApp que aparezcan. Se guardan aplanados en
`customFields` (`social_instagram`, `social_facebook`, etc. — el campo no
admite arrays anidados, ver schema de `contacts`), y se filtran dos tipos
de ruido detectados en pruebas reales: botones de "compartir en redes"
(URLs tipo `/intent/`, `/share`, `/sharer.php`) y links de plantilla sin
completar (`tu-perfil`, `your-profile`) que quedan pegados de temas/themes
sin personalizar.

**UI:** dos módulos nuevos en la ficha del contacto — "Enlaces" (Google
Maps + sitio web) y "Redes sociales" — que solo se muestran si el contacto
tiene ese dato cargado (no todos los contactos vienen de scraping).

---

## 2026-07-21 — Rebrand a blanco y negro (sistema 2026 del ecosistema)

**Contexto:** el ecosistema de Colonia Cloud abandonó el acento terracota;
ahora usa negro y blanco, con botones primarios con un leve efecto 3D de
gradientes sutiles.

**Decisión:** los tokens de `theme.css` se actualizaron copiando los valores
EXACTOS de `colonia-cloud/app/globals.css` (la fuente de verdad del sitio
público): acento `#000000`, hover `#262626`, superficies `#F2F2F2`/`#EDEDED`,
gris neutro `#A3A3A3`, y el gradiente del botón primario
(negro → `#0D0D0D` al 65%, brillo interno superior blanco al 15%) espejado
en los tokens `--btn-gradient*`/`--btn-shadow*`. El nombre `--color-warm`
se conservó por compatibilidad con el CSS existente pero su valor pasó al
gris neutro. Los colores semánticos (éxito/peligro/aviso de pills y estados)
se conservan — B&N aplica a la marca, no a la semántica de estados. Los
links ganaron subrayado sutil (con acento negro ya no se distinguen del
texto por color).

---

## 2026-07-21 — Auditoría Digital con IA (motor de venta consultiva)

**Contexto:** el sistema está pensado para captar clientes y proponerles
servicios directamente (auditorías gratuitas, etc.). El outreach frío con
un mensaje genérico convierte poco; el pedido fue una idea que explote la
API de Anthropic.

**Decisión:** auditoría digital automática por lead, con esta arquitectura:
1. **Los hechos los verifica código, no la IA** (`collectSiteFacts` en
   `apps/api/src/lib/audit.ts`): HTTPS, title/meta description/H1/OG,
   viewport mobile, señales de reservas/e-commerce, redes enlazadas, email
   visible, año de copyright vencido, builder (WordPress/Wix/etc.). La
   credibilidad del informe depende de que cada hallazgo salga de un dato
   real — Claude solo interpreta y redacta, no "descubre".
2. **Claude recibe los hechos + el catálogo real de servicios con precios**
   (hardcodeado de 04-productos-servicios.md) y genera: resumen, puntajes
   1-10 en 4 áreas, 3-5 hallazgos (cada uno mapeado a un servicio del
   catálogo con su precio real — no puede inventar servicios), y un mensaje
   de WhatsApp corto para el primer contacto.
3. **El informe ES la demo**: se sirve como página pública brandeada
   (`GET /public/audits/:publicId`, sin auth, token random de 32 hex como
   única protección — está pensado para compartirse) renderizada
   server-side por Hono con el sistema B&N 2026. El prospecto que lo abre
   ve la calidad de diseño de la agencia en el informe mismo.
4. **Leads sin sitio web** (los de score alto en prospección) reciben la
   variante "informe de oportunidad": qué pierden sin presencia propia.
5. Desde la ficha del contacto: generar (→ actividad `audit_generated` en
   el timeline), ver informe, y enviarlo por WhatsApp/Email reutilizando
   los canales existentes (mensaje de Claude + link público).

**Verificado con un sitio real** (Costa Colonia Boutique Hotel): los
hallazgos coincidieron con los datos técnicos (sin meta description, título
duplicado, sin H1 → SEO 4/10; mobile correcto → 8/10), reconoció lo que
estaba bien (credibilidad) y recomendó solo servicios del catálogo.

**Nota de despliegue:** el link público se construye con `API_PUBLIC_URL` —
en producción debe ser el dominio real para que el prospecto pueda abrirlo.
El CTA del informe usa `AUDIT_CTA_URL` (ej. wa.me de la agencia), con
fallback al mailto corporativo.

---

## 2026-07-22 — Incidente: loop caliente de reconexión de WhatsApp + fix con backoff

**Qué pasó:** al reiniciar los servicios, la sesión guardada de Baileys fue
rechazada por WhatsApp con `badSession` (500). La lógica de reconexión
original reintentaba inmediatamente en cada cierre, sin pausa — resultado:
varios reintentos POR SEGUNDO contra los servidores de WhatsApp durante
varios minutos, hasta que WhatsApp empezó a rechazar también conexiones
con credenciales nuevas (bloqueo temporal por ráfaga).

**Fix aplicado** (`apps/whatsapp/src/baileys.ts`):
1. `badSession` (500) y `loggedOut` (401) se tratan como sesión muerta:
   se borran las credenciales guardadas (reintentar con credenciales
   inválidas nunca se recupera solo).
2. **Backoff exponencial en TODOS los caminos de reconexión** (4s, 8s,
   16s… tope 60s), incluso después de limpiar la sesión — si WhatsApp está
   bloqueando temporalmente, martillarlo solo alarga el bloqueo.
3. Tope de 10 intentos: superado, el servicio queda a la espera del botón
   "Cerrar sesión de WhatsApp" en Configuración (que resetea el contador
   y arranca de cero).

**Consecuencia operativa:** la vinculación de WhatsApp se pierde en este
incidente — cuando WhatsApp deje de bloquear (típicamente menos de una
hora), la página de Configuración → WhatsApp va a volver a mostrar el QR
para re-escanear.

**Lección:** cualquier lógica de reconexión automática contra un servicio
externo debe nacer con backoff exponencial y tope de intentos — el "retry
inmediato" que parece inofensivo en desarrollo es exactamente lo que
dispara bloqueos del lado del proveedor.

---

## 2026-07-22 — Incidente: "Failed to fetch" al loguearse — IP de LAN hardcodeada

**Qué pasó:** el router le reasignó a la máquina una IP nueva por DHCP
(192.168.1.10 → .13). `NEXT_PUBLIC_API_URL` tenía la IP vieja fijada a mano
(quedó así desde que se habilitó el acceso por red local) — como esa
variable se hornea en el bundle del cliente, **todos** los navegadores
(incluso en localhost) intentaban pegarle a una IP que ya no existía. Lo
mismo pasaba con `WEB_URL` del lado de la API (CORS/`trustedOrigins`
rechazaban el origen nuevo).

**Fix — detección dinámica en vez de valor fijo:**
1. `apps/web/src/lib/api-url.ts` (nuevo): en el browser, la URL de la API
   se deduce del host con el que se abrió la página
   (`window.location.hostname`) + puerto 3001 — funciona para localhost y
   para cualquier IP de LAN sin importar cuál sea, sin necesidad de fijarla
   a mano. `NEXT_PUBLIC_API_URL` sigue existiendo como override explícito
   para producción (dominio real de la API), simplemente no se define en
   dev.
2. CORS de `apps/api` (`index.ts`): en vez de una lista fija de orígenes,
   una función que además de la lista explícita de `WEB_URL` acepta
   cualquier origen `http://<localhost o IP privada>:3010` en desarrollo
   (`NODE_OPTIONS`/`NODE_ENV !== 'production'` gatea esto — en prod sigue
   siendo lista blanca estricta).
3. `trustedOrigins` de Better Auth (`lib/auth.ts`) ya soporta patrones
   wildcard nativamente — `WEB_URL` pasó a incluir
   `http://192.168.*.*:3010` en vez de una IP fija.

**Por qué no se tocó `WHATSAPP_SERVICE_URL`/`API_INTERNAL_URL`:** esas son
llamadas servidor-a-servidor entre `apps/api` y `apps/whatsapp`, que
siempre corren en la misma máquina — `localhost` ahí nunca se rompe con un
cambio de IP. El problema es específico de URLs que cruzan al browser de
otro dispositivo en la red.

**Lección (mismo patrón que el incidente de WhatsApp de ayer):** cualquier
valor de red que dependa de "la IP de esta máquina en este momento" es
frágil por definición si se fija a mano — hay que derivarlo en runtime o
diseñar para aceptar un rango, no una config editada una vez y olvidada.

---

## Pendientes de decisión (a resolver al implementar cada fase)

- **Email (Fase 3):** IMAP/SMTP genérico confirmado por el usuario — falta
  definir el proveedor de hosting de correo real para completar
  `EMAIL_IMAP_HOST`/`EMAIL_SMTP_HOST`.
- **Scraping (Fase 4):** confirmar cuota/presupuesto de Google Places API
  antes de correr scraping masivo — cobra por request.
- **Infraestructura de despliegue:** `cccloud` migró de Fly.io a Render por
  el free tier (ver su `DECISIONS.md`). Evaluar si este proyecto sigue el
  mismo camino o corre en la misma cuenta de Render que `cccloud` — pendiente
  de decidir cuando se acerque el primer deploy.
