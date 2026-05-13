# TALLER

> Documento de referencia del producto TALLER.
> Versión del Protocolo Nueva Órbita: **v2.2**
> Última actualización: 2026-05-12

---

## 1. Identidad del producto

### Qué es

**TALLER** es una Web App (PWA) de gestión operativa para talleres mecánicos automotrices independientes. Ordena el flujo desde que entra un vehículo al patio hasta que el cliente paga y se lo lleva, sin que el dueño deje de atender carros.

### Para quién

Dueños de talleres mecánicos automotrices independientes en Ecuador, con equipo de **1 a 8 mecánicos** y volumen de **5 a 30 vehículos por semana**. No aplica para concesionarios oficiales ni cadenas de franquicia.

El cliente típico:

- No está sentado en un escritorio — está bajo un carro o atendiendo en el patio.
- Tiene la información del taller repartida en cuaderno, Excel, WhatsApp del jefe, y memoria del mecánico viejo.
- Cuando un cliente regresa después de 8 meses, no recuerda qué le hicieron ni en qué tiempos.
- Pierde ingresos porque no factura mano de obra completa o no cobra repuestos usados.

### Filosofía

TALLER cumple las 6 condiciones de toda WAP Nueva Órbita:

1. **Agradable a la vista** — paleta azul oscuro profesional, sin estridencias.
2. **Dinámica** — listeners Firestore sienten cada cambio de status de OT al instante.
3. **Intuitiva** — un recepcionista aprende a recibir un vehículo en 5 minutos.
4. **Fácil** — el mecánico actualiza status desde el celular bajo el carro.
5. **A la medida** — vocabulario del nicho: OT, placa, mano de obra, mantenimiento preventivo.
6. **Desaparece dolores de cabeza** — no los administra, los desaparece.

### Lo que NO es

- **No es un sistema contable**. No genera reportes fiscales ni concilia con el SRI.
- **No es un software de diagnóstico OBD2**. No se conecta al carro, no lee códigos de falla.
- **No es un inventario completo de repuestos**. Registra los usados en una OT pero no hace gestión de stock con alertas (eso llega en V3).
- **No reemplaza tu facturación electrónica del SRI**. Genera comprobante interno para el cliente, no factura SRI.
- **No automatiza la cobranza con pasarela de pagos**. El registro de cobro es manual (efectivo, transferencia, tarjeta).

### Frase guía universal

*La WAP desaparece dolores de cabeza. No los administra, los desaparece.*

---

## 2. Stack técnico

TALLER usa el stack permanente Nueva Órbita:

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Hosting | Vercel (CLI global) |
| Backend ligero | Vercel serverless functions (solo si aplica — V1 no lo necesita) |
| Base de datos | Firebase Firestore plan Spark |
| Storage | Firebase Storage (5 GB) — diferido a V2 (requiere Blaze, no activado en V1) |
| Autenticación | PIN propio sobre Firestore |
| Lenguaje | JavaScript |
| Estilos | CSS Modules |
| Tipografía | Inter (400, 500, 600) |
| PWA | vite-plugin-pwa |
| Excel | xlsx (SheetJS) |

**Reglas duras heredadas del Protocolo:** no TypeScript, no Tailwind, no librerías UI grandes, no Firebase Auth, no Cloud Functions, no localStorage, no emojis en UI de producción.

**Modelo Firebase:** un proyecto Firebase por cliente final, no por WAP. Cada taller tiene su proyecto con sus propias cuotas Spark.

---

## 3. Arquitectura de datos

### Colecciones Firestore

#### `clients`

| Campo | Tipo | Descripción | Denormalizado |
|---|---|---|---|
| `id` | string | ID del documento (auto o legible `CLI-2026-001`) | — |
| `name` | string | Nombre completo del cliente | — |
| `phone` | string | Teléfono normalizado a `593...` | — |
| `email` | string \| null | Email opcional | — |
| `firstVisitAt` | Timestamp | Server timestamp de la primera visita | — |
| `lastVisitAt` | Timestamp | Última visita (Regla 1, se muestra en lista) | Sí — de `workOrders` |
| `totalVisits` | number | Contador acumulado de visitas (Regla 5) | Sí — `increment()` |
| `totalSpent` | number | Total gastado histórico USD (Regla 5) | Sí — `increment()` |
| `createdAt` | Timestamp | — | — |
| `createdBy` | string | `actorId` de quien creó | — |

**Estimación:** 5-30 nuevos/mes según taller.

#### `vehicles`

| Campo | Tipo | Descripción | Denormalizado |
|---|---|---|---|
| `id` | string | ID legible (`VEH-PCY-1234`) o auto | — |
| `placa` | string | Placa alfanumérica, normalizada uppercase sin guión | — |
| `marca` | string | Toyota, Chevrolet, Hyundai... | — |
| `modelo` | string | Corolla, Spark, Tucson... | — |
| `year` | number \| null | Año del vehículo | — |
| `color` | string \| null | — | — |
| `lastKm` | number \| null | Último kilometraje registrado | — |
| `clientId` | string | FK al cliente dueño | — |
| `clientName` | string | Nombre del cliente (Regla 1, se muestra junto al vehículo) | **Sí — de `clients`** |
| `clientPhone` | string | Teléfono del cliente (Regla 1, para botón WhatsApp) | **Sí — de `clients`** |
| `createdAt` | Timestamp | — | — |
| `createdBy` | string | — | — |

**Estimación:** ~igual que `clients`.

#### `workOrders` (la principal)

| Campo | Tipo | Descripción | Denormalizado |
|---|---|---|---|
| `id` | string | ID legible (`OT-2026-05-001`) | — |
| `status` | enum | `recibido` \| `diagnostico` \| `aprobacion` \| `proceso` \| `listo` \| `entregado` \| `cancelado` | — |
| `openedAt` | Timestamp | Fecha de apertura | — |
| `closedAt` | Timestamp \| null | Fecha de cierre con cobro | — |
| `problema` | string | Problema reportado por el cliente | — |
| `tasks` | array<object> | Tareas de mano de obra `[{descripcion, horas, precioUnit, total}]` | — |
| `parts` | array<object> | Repuestos usados `[{descripcion, cantidad, precioUnit, total}]` | — |
| `totalLabor` | number | Suma mano de obra USD | — |
| `totalParts` | number | Suma repuestos USD | — |
| `totalGeneral` | number | Suma total USD | — |
| `clientId` | string | FK | — |
| `clientName` | string | (Regla 1) | **Sí — de `clients`** |
| `clientPhone` | string | (Regla 1, para botón WhatsApp en cola) | **Sí — de `clients`** |
| `vehicleId` | string | FK | — |
| `vehiclePlaca` | string | (Regla 1, se ve en lista) | **Sí — de `vehicles`** |
| `vehicleMarca` | string | (Regla 1) | **Sí — de `vehicles`** |
| `vehicleModelo` | string | (Regla 1) | **Sí — de `vehicles`** |
| `mechanicId` | string \| null | Mecánico asignado | — |
| `mechanicName` | string \| null | (Regla 1, se ve en cola) | **Sí — de `users`** |
| `photoUrls` | array<string> | URLs Firebase Storage de fotos del estado inicial | — |
| `createdAt` | Timestamp | — | — |
| `createdBy` | string | — | — |
| `actorId`, `actorRole` | string | Patrón `withActor` | — |

**Subcollections:** ninguna en V1. Si V2 necesita comentarios internos del mecánico, se agrega `workOrders/{id}/notes`.

**Estimación:** 20-150 docs/mes según taller.

#### `payments`

| Campo | Tipo | Descripción | Denormalizado |
|---|---|---|---|
| `id` | string | ID legible (`PAY-2026-05-001`) | — |
| `workOrderId` | string | FK | — |
| `monto` | number | USD | — |
| `formaPago` | enum | `efectivo` \| `transferencia` \| `tarjeta` | — |
| `paidAt` | Timestamp | — | — |
| `receivedBy` | string | `actorId` de quien cobró | — |
| `receivedByName` | string | (Regla 1) | **Sí — de `users`** |
| `clientName` | string | (Regla 1, para reportes y export) | **Sí — de `workOrders`** |
| `vehiclePlaca` | string | (Regla 1) | **Sí — de `workOrders`** |

**Estimación:** ~igual que `workOrders` cerradas.

### Colecciones del Protocolo (siempre presentes)

- `users` — usuarios del taller con auth PIN (owner, manager, recepcionista, mecánico, cajero).
- `_audit` — log inmutable de eventos críticos (login, apertura/cierre OT, cobro, cambios de PIN).
- `_whatsapp_events` — eventos de envío WhatsApp desde la app (confirmación, listo, recordatorio).
- `_archive_index` — índice de colecciones archivadas.

### Optimización Spark

**Estimación de uso por cliente típico (taller mediano, 3 mecánicos, 15 vehículos/semana):**

- Reads/día estimados: **~8.000-15.000** (cola de OTs es la pantalla más golpeada).
- Writes/día estimados: **~200-500** (creación de OT, actualizaciones de status, cobros).

Holgura amplia frente a los 50K/20K diarios del plan Spark. Persistencia offline es lo que mantiene los reads bajos cuando un mecánico abre la pantalla de su OT 15 veces durante un trabajo.

**Reglas obligatorias:**

- Listas con paginación obligatoria (`usePaginatedQuery`, pageSize típico 20).
- Persistencia offline activada por defecto (`persistentSingleTabManager`).
- Escrituras masivas (import Excel) en `batch` de máximo 500.

### Reglas Firestore

`firestore.rules` debe declarar reglas para todas las colecciones. Patrones específicos de TALLER:

- **`clients`, `vehicles`** — read libre con sesión, write `recepcionista | manager | owner`. Delete bloqueado (un cliente nunca se borra, se inactiva).
- **`workOrders`** — read libre con sesión. Write con regla compuesta:
  - `recepcionista` crea OT (status `recibido` o `diagnostico`).
  - `mechanic` solo actualiza OTs donde `mechanicId == actorId`.
  - `manager | owner` pueden todo, incluyendo cancelar OT.
  - Delete bloqueado siempre (las OTs se archivan, no se borran).
- **`payments`** — read libre con sesión. Write `cajero | recepcionista | manager | owner`. Delete bloqueado.
- **Internas (`_audit`, `_whatsapp_events`, `_archive_*`)** — según patrón del Protocolo sección 18.5 y 21.7.

---

## 4. Los 5 módulos

### Módulo 1: Recepción de vehículos

**Qué hace:**

- Registra entrada del vehículo al patio.
- Captura el problema reportado por el cliente (texto libre).
- Genera el número de OT (`OT-2026-05-001`).
- (V2) Subir 3-6 fotos del estado inicial del vehículo a Firebase Storage. En V1, recepción se hace sin fotos.
- Si el cliente ya existe (búsqueda por teléfono o placa), prellena los datos. Si es nuevo, lo crea.

**Qué NO hace:**

- Diagnóstico automatizado.
- Cotización automática.
- No genera un PDF de "acta de entrega" en V1 (eso es V2).

**Pantallas asociadas:**

- `RecepcionForm` — formulario de recepción.
- `PhotoCapture` — captura/subida de fotos. (V2, no se construye en V1.)
- `ClienteSearch` — búsqueda rápida por placa o teléfono.

### Módulo 2: Orden de Trabajo (OT)

**Qué hace:**

- Es el documento vivo del trabajo del mecánico.
- Lista de tareas de mano de obra (descripción, horas, precio unitario, total).
- Lista de repuestos usados (descripción, cantidad, precio unitario, total).
- Status del trabajo: `recibido` → `diagnostico` → `aprobacion` → `proceso` → `listo` → `entregado`.
- Asignación de mecánico (manual en V1).
- Cálculo automático de totales (mano de obra + repuestos = total general).

**Qué NO hace:**

- Ordenar repuestos automáticamente a proveedores.
- Calcular tiempos estimados por algoritmo.
- Enviar la cotización al cliente automáticamente (eso lo hace el botón de WhatsApp manual).

**Pantallas asociadas:**

- `ColaOT` — la cola de OTs activas del día. **(Pantalla más usada del producto.)**
- `OTDetail` — detalle de una OT (la abre el mecánico mientras trabaja).
- `OTForm` — formulario de creación/edición.

### Módulo 3: Clientes y vehículos

**Qué hace:**

- Catálogo de clientes con sus vehículos asociados.
- Historial de visitas (últimas 10 OTs del cliente).
- Recordatorios de mantenimiento preventivo (en V2 con automatización, en V1 solo lectura del próximo).
- Contadores `totalVisits` y `totalSpent` que se mantienen con `increment()` al cerrar cada OT.

**Qué NO hace:**

- Campañas masivas de marketing.
- Segmentación avanzada (RFM, NPS, etc).
- En V1, no agenda automáticamente recordatorios — solo los muestra.

**Pantallas asociadas:**

- `ClientesList` — lista paginada.
- `ClienteDetail` — detalle con historial.
- `VehiculoDetail` — detalle de un vehículo con sus OTs.

### Módulo 4: Caja y Cobros

**Qué hace:**

- Cierre del trabajo: recepcionista/cajero abre la OT en status `listo` y registra cobro.
- Captura monto total (prellenado desde la OT), forma de pago (efectivo/transferencia/tarjeta).
- Genera comprobante interno para el cliente (impresión simple desde el browser, sin formato fiscal SRI).
- Marca la OT como `entregado` y crea documento en `payments`.
- Dispara `increment()` en `clients.totalSpent` y `clients.totalVisits`.

**Qué NO hace:**

- Emisión de facturas electrónicas SRI.
- Conciliación con cuentas bancarias.
- División de pagos (un pago parcial hoy, otro mañana — eso es V2).

**Pantallas asociadas:**

- `CobroForm` — formulario de cobro.
- `Comprobante` — vista imprimible (sin valor fiscal).

### Módulo 5: Panel del dueño

**Qué hace:**

- 4 KPIs básicos del mes actual:
  1. **Ingresos del mes** (suma de `payments.monto` del período).
  2. **OTs activas** (count `workOrders` con status ≠ `entregado` y ≠ `cancelado`).
  3. **Mecánicos productivos** (ranking de mecánicos por OTs cerradas del mes).
  4. **Clientes recurrentes vs nuevos** (split del mes).
- Vista de Histórico (`<HistoricoViewer />`) para revisar meses pasados.

**Qué NO hace:**

- Contabilidad fiscal.
- Cálculos de margen sobre repuestos (requiere inventario, V3).
- Proyecciones de ingresos.

**Pantallas asociadas:**

- `PanelDueño` — la pantalla con los 4 KPIs.
- `HistoricoView` — navegación de meses archivados.

### Capacidades estándar v2.2 (presentes desde V1)

Toda WAP Nueva Órbita tiene desde V1, y TALLER no es excepción:

1. **Import Excel** (`<ExcelImporter />`) — usado en onboarding inicial para cargar `clients` y `vehicles` (ver Pregunta 17 del cuestionario).
2. **Export Excel mensual** (`<ExcelExporter />`) — visible solo a `manager` y `owner`. Exporta `workOrders`, `payments`, `clients`, `vehicles` con filtro por período.
3. **WhatsApp Click-to-Chat** (`<WhatsAppButton />`) — botón en cada OT, vehículo y cliente. 5 plantillas pre-definidas (ver sección 11 y módulo 3). Cada uso registra evento en `_whatsapp_events`.
4. **Vista de Histórico** (`<HistoricoViewer />`) — para `manager` y `owner`, navega `workOrders` y `payments` archivados mes por mes.

---

## 5. Roles y permisos

| Rol | Qué puede hacer | Qué NO puede hacer | PIN típico |
|---|---|---|---|
| `owner` | Todo. Único que puede crear/desactivar usuarios, ver/cambiar planes, ver datos sensibles (% margen, deudas internas). | (sin restricciones) | 4 dígitos a elegir en Sesión 1 |
| `manager` | Operación diaria completa: crear OTs, asignar mecánicos, cobrar, ver panel del dueño, exportar Excel. | Crear/desactivar usuarios, cambiar planes, ver campos marcados como privados por owner. | 4 dígitos |
| `recepcionista` | Recibir vehículos, crear OTs, ver historial de clientes, cobrar. | Editar precios de mano de obra/repuestos ya cerrados, ver panel del dueño. | 4 dígitos |
| `mechanic` | Ver SOLO sus OTs asignadas (`mechanicId == actorId`). Actualizar status, registrar tiempo y repuestos usados. | Ver OTs de otros mecánicos. Ver panel. Cobrar. | 4 dígitos |
| `cajero` | Cobrar OTs en status `listo`. Registrar pagos. | Crear/editar OTs. Editar precios. Ver panel. | 4 dígitos |

### Reglas Firestore por rol (extracto crítico)

```javascript
// workOrders — el mecánico solo ve y actualiza lo suyo
match /workOrders/{otId} {
  allow read: if hasActor()
              && (hasRole(['owner', 'manager', 'recepcionista', 'cajero'])
                  || (hasRole(['mechanic']) && resource.data.mechanicId == actorId()));

  allow create: if hasActor()
                && hasRole(['recepcionista', 'manager', 'owner'])
                && isValidActor(request.resource.data.actorId,
                                request.resource.data.actorRole);

  allow update: if hasActor()
                && (hasRole(['manager', 'owner'])
                    || (hasRole(['recepcionista']) && !changedSensitiveFields())
                    || (hasRole(['mechanic'])
                        && resource.data.mechanicId == actorId()
                        && !changedFinancialFields()));

  allow delete: if false;
}

// payments — solo roles de cobro
match /payments/{payId} {
  allow read: if hasActor()
              && hasRole(['cajero', 'recepcionista', 'manager', 'owner']);
  allow create: if hasActor()
                && hasRole(['cajero', 'recepcionista', 'manager', 'owner'])
                && isValidActor(request.resource.data.actorId,
                                request.resource.data.actorRole);
  allow update, delete: if false;
}
```

Helpers (`hasActor`, `hasRole`, `actorId`, `isValidActor`, etc.) según patrón del Protocolo sección 9.

---

## 6. Decisiones de producto cerradas

Estas decisiones están cerradas y NO deben re-debatirse cuando se construya el código.

### V1 (lo que sale primero)

| # | Decisión | Razón |
|---|---|---|
| 1 | Auth con PIN propio sobre Firestore | Estándar Nueva Órbita Spark, sin Cloud Functions |
| 2 | Asignación de mecánicos a cada OT manualmente | Asignación automática es V2; el dueño quiere control en V1 |
| 3 | Cobro con registro manual de forma de pago (efectivo, transferencia, tarjeta) | No hay pasarela de pagos en Spark; el cobro físico ya pasa, solo se registra |
| 4 | Panel del dueño con 4 KPIs básicos | MVP suficiente para que el dueño vea valor en Sesión 3; más KPIs en V2 |

### V2 (3-6 meses después de V1)

| # | Decisión | Razón |
|---|---|---|
| 5 | Recordatorios automáticos de mantenimiento preventivo | Requiere job que corre semanalmente — viable con Vercel cron |
| 6 | Catálogo de servicios con precios base | Después de 2-3 clientes activos sabremos qué servicios estandarizar |
| 7 | Acta de entrega imprimible con fotos del estado inicial | Cliente lo pide después del primer reclamo |
| 8 | Multi-local (agregar `locationId` a clientes, vehículos, OTs) | Solo si llega un cliente con 2+ talleres |
| 9 | Subir fotos del estado inicial del vehículo a Firebase Storage | Diferido de V1 porque Storage requiere Blaze; se activa cuando el cliente justifique el costo |

### V3 (1+ año después)

| # | Decisión | Razón |
|---|---|---|
| 10 | Inventario de repuestos con alertas | Requiere catálogo de proveedores, código de parte, conteo físico — gran proyecto |
| 11 | Integración SRI para facturación electrónica | Cuando el cliente promedio sea suficientemente formal — implica activar Blaze |

---

## 7. Sistema de diseño

### Paleta base (con override del primario)

```css
--bg-app:          #FAFAF7;
--bg-surface:      #FFFFFF;
--bg-active:       #EFF6FF;

--text-primary:    #1A1F2E;
--text-secondary:  #6B7280;
--text-disabled:   #9CA3AF;

--border-light:    #E5E7EB;
--border-medium:   #D1D5DB;

/* Override TALLER: azul oscuro, comunica confianza profesional */
--primary:         #1E3A8A;
--primary-hover:   #1E40AF;
--primary-light:   #DBEAFE;

--success:         #059669;
--warning:         #D97706;
--danger:          #DC2626;
```

### Tipografía

- Fuente única: **Inter**
- Pesos: 400 (texto), 500 (énfasis), 600 (titulares y números)
- Escalas: 12, 14, 16, 18, 22, 28 px

### Filosofía visual

- Densidad alta pero ordenada (la cola de OTs es densa por naturaleza, no diluir).
- Bordes sutiles 1px, no sombras pesadas.
- Bordes redondeados 4-6px (no 16px).
- Sin gradientes vistosos, sin animaciones decorativas.
- **Sin emojis en UI de producción.**
- Status de OT con códigos de color cortos:
  - `recibido` → gris neutro.
  - `diagnostico` → azul.
  - `aprobacion` → naranja (acción pendiente del cliente).
  - `proceso` → amarillo (trabajo activo).
  - `listo` → verde (cobrable).
  - `entregado` → gris claro (archivado conceptualmente).
  - `cancelado` → rojo apagado.

### Vocabulario del nicho

La UI usa consistentemente:

| En la UI usar | En lugar de |
|---|---|
| **OT** | "orden", "trabajo", "tarea" |
| **Vehículo** | "carro", "auto", "carrito" |
| **Mecánico** | "técnico", "operario" |
| **Placa** | "matrícula" |
| **Cliente** | "comprador", "dueño del vehículo" |
| **Mano de obra** | "labor", "servicio" (cuando se cobra mano de obra) |
| **Mantenimiento preventivo** | "chequeo", "revisión" |

---

## 8. Convenciones de código

### Estructura del repo

```
taller/
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionStatus.jsx
│   │   │   ├── ExcelImporter.jsx
│   │   │   ├── ExcelExporter.jsx
│   │   │   ├── WhatsAppButton.jsx
│   │   │   ├── HistoricoViewer.jsx
│   │   │   ├── PhotoCapture.jsx          (específico TALLER)
│   │   │   └── StatusBadge.jsx           (específico TALLER)
│   │   ├── modules/
│   │   │   ├── recepcion/
│   │   │   ├── ot/
│   │   │   ├── clientes/
│   │   │   ├── caja/
│   │   │   └── panel/
│   │   ├── services/
│   │   │   ├── firestore.js
│   │   │   ├── auth.js
│   │   │   ├── storage.js                (fotos del vehículo)
│   │   │   ├── excel.js
│   │   │   └── whatsapp.js
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useOnlineStatus.js
│   │   │   ├── usePendingWrites.js
│   │   │   └── usePaginatedQuery.js
│   │   ├── styles/
│   │   ├── utils/
│   │   │   ├── formatCurrency.js
│   │   │   ├── formatDate.js
│   │   │   └── normalizePlaca.js         (uppercase, sin guión)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── .env.local.[cliente]
│   ├── package.json
│   └── vite.config.js
├── scripts/
│   ├── generate-pin-hash.js
│   └── archive-month.js
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── storage.rules
├── .env.example
├── .gitignore
├── README.md
├── CLAUDE.md
├── ONBOARDING.md
└── TALLER.md
```

### Naming

- **Colecciones Firestore:** inglés, plural, lowercase (`clients`, `vehicles`, `workOrders`, `payments`).
- **Colecciones internas:** prefijo `_` (`_audit`, `_whatsapp_events`, `_archive_*`).
- **Documentos:** ID legible cuando aplica (`OT-2026-05-001`, `PAY-2026-05-001`, `CLI-2026-001`).
- **Campos:** inglés, camelCase (`clientName`, `vehiclePlaca`, `totalGeneral`).
- **Componentes:** PascalCase (`ColaOT.jsx`, `OTDetail.jsx`).
- **Utilidades:** camelCase (`formatCurrency.js`).
- **Código:** inglés.
- **UI visible:** español neutro (sin "vos", "decís", "checá", "carrito").

### Reglas de oro

1. **Componentes NO tocan Firestore directo.** Siempre vía `services/`.
2. **Toda escritura pasa por `withActor(session, data)`**.
3. **Listeners de Firestore cleanup en `useEffect`.**
4. **Toda lista usa `usePaginatedQuery` o equivalente con `.limit()`** — empezando por `ColaOT` (la pantalla más golpeada).
5. **Escrituras masivas en batch máximo 500** — relevante en import Excel de clientes y vehículos.
6. **`firestore.rules` se actualiza junto con cada nueva colección.**

---

## 9. Reglas para Claude Code

### Siempre

- Leer `TALLER.md` y `CLAUDE.md` al inicio de cada sesión.
- Preguntar antes de asumir cuando algo no esté claro.
- Pasar por `services/` para todas las lecturas/escrituras Firebase.
- Pasar por `withActor(session, data)` para toda escritura.
- Cerrar listeners en `useEffect` cleanup.
- Aplicar las 6 reglas de denormalización del Protocolo.
- Actualizar `firestore.rules` al crear/modificar colección.
- Usar `usePaginatedQuery` en toda lista.
- Escrituras masivas en `batch` de máximo 500.
- Listar al final de cada cambio los archivos modificados, uno por línea.

### Nunca

- Tocar archivos no pedidos explícitamente.
- "Limpiar" o "refactorizar" código existente sin que se pida.
- Agregar librerías sin preguntar.
- Crear archivos de prueba sin que se pida.
- Cambiar estructura de carpetas sin preguntar.
- Usar TypeScript, Tailwind, librerías UI grandes, Firebase Auth, Cloud Functions, localStorage.
- Usar emojis en UI de producción.
- Usar regionalismos (`carrito`, `padrísimo`, `checá`).
- Inventar — siempre preguntar.

### Frase de freno

Cuando Claude Code se sale del documento:

> *"Para. Relee TALLER.md sección X. Dime qué te saltaste y propón cómo corregirlo."*

---

## 10. Roadmap por fases

### V1 — lo que sale primero

**Alcance:**

- Los 5 módulos descritos en sección 4, en su versión mínima.
- Auth PIN con los 5 roles.
- Fotos del estado inicial subidas a Firebase Storage.
- Asignación manual de mecánicos.
- 4 KPIs en el panel del dueño.
- Las 4 capacidades estándar v2.2 (Import Excel, Export Excel, WhatsApp, Histórico).
- Persistencia offline funcionando para los módulos 1, 2, 3 (lectura) y 4.

**Excluido de V1:**

- Recordatorios automáticos de mantenimiento.
- Catálogo de servicios con precios base.
- Acta de entrega imprimible con fotos.
- Inventario de repuestos.
- Integración SRI.
- Multi-local.

**Criterio de éxito:**

- Un taller cliente puede recibir un vehículo, abrir OT, asignar mecánico, registrar tareas y repuestos, cobrar, y entregar — todo desde la WAP, sin volver a cuaderno ni Excel, durante 30 días seguidos.

### V2 — 3-6 meses después

**Alcance:**

- Decisiones #6, #7, #8, #9 de la sección 6.
- Sub-módulo de comentarios internos por OT (`workOrders/{id}/notes`).
- Subir fotos también del trabajo en proceso (no solo recepción).

**Trigger para arrancar:**

- 3+ clientes activos en V1 con uso intensivo (verde en Sesión 2).
- Al menos 2 clientes pidieron acta de entrega imprimible.

### V3 — 1+ año

**Alcance esperado:**

- Decisiones #10 y #11.
- Activación de Blaze por cliente que requiera facturación SRI.
- App nativa Android para el mecánico (si se justifica frente al PWA).

---

## 11. Glosario del nicho

| Término | Significado |
|---|---|
| **OT** | Orden de Trabajo. Documento vivo del trabajo en un vehículo, desde recepción hasta entrega. |
| **Placa** | Identificador alfanumérico oficial del vehículo (ej. `PCY-1234`, `ABC-0123`). En TALLER se normaliza a uppercase sin guión. |
| **Mantenimiento preventivo** | Servicios programados por kilometraje o tiempo (cambio de aceite cada 5.000 km, cambio de filtros cada 10.000 km). |
| **Mano de obra** | Cobro por el trabajo del mecánico, separado del costo de repuestos. Se mide en horas o en tareas. |
| **Diagnóstico** | Evaluación inicial del vehículo antes de cotizar el trabajo. En TALLER es uno de los status de OT. |
| **Cotización aprobada** | Momento en que el cliente acepta el monto del trabajo. En TALLER es el paso de status `aprobacion` → `proceso`. |
| **Comprobante interno** | Recibo que entrega el taller al cliente, sin valor fiscal SRI. Distinto a factura electrónica. |

---

## 12. Las 3 pantallas más usadas (define qué denormalizar agresivamente)

Esta sección define qué denormalizar agresivamente.

### Pantalla 1: Cola de OTs activas del día (la más abierta)

**Quién la abre:**
- Recepcionista: ~50 veces/día.
- Dueño: ~10 veces/día.
- Cada mecánico individualmente: ~10 veces/día.

**Frecuencia total:** 80-100 aperturas/día por taller típico.

**Qué muestra:**

Lista de OTs activas (status ≠ `entregado` y ≠ `cancelado`) con:

- Número de OT, status badge.
- Placa, marca, modelo del vehículo.
- Nombre del cliente.
- Mecánico asignado.
- Tiempo desde apertura.

**Cuántos documentos lee:** ~30-50 OTs activas en taller activo. Con `usePaginatedQuery` y `pageSize: 20`, la primera carga lee 20.

**Campos denormalizados necesarios en `workOrders`:**

- `clientName` ← de `clients`
- `clientPhone` ← de `clients` (para botón WhatsApp directo desde la cola)
- `vehiclePlaca` ← de `vehicles`
- `vehicleMarca` ← de `vehicles`
- `vehicleModelo` ← de `vehicles`
- `mechanicName` ← de `users`

**Sin denormalización, cada apertura de la cola dispararía ~5 reads adicionales por OT × 30 OTs = 150 reads extra. Inviable en Spark.**

### Pantalla 2: Detalle de OT (la abre el mecánico mientras trabaja)

**Quién la abre:** mecánico asignado.

**Frecuencia:** 5-15 veces durante un trabajo (revisa, actualiza tareas, agrega repuestos, marca avance).

**Qué muestra:**

- Cabecera con vehículo + cliente.
- Lista de tareas con checkboxes de avance.
- Lista de repuestos con cantidades.
- Historial reciente del vehículo (últimas 3 OTs cerradas).
- Botón "actualizar status".

**Cuántos documentos lee:** 1 OT (la actual) + query con `.limit(3)` de OTs anteriores del mismo `vehicleId`.

**Campos denormalizados necesarios:**

- Los mismos que la cola en `workOrders`.
- En la sub-lista de "últimas 3 OTs del vehículo": también denormalizadas, igual estructura.

### Pantalla 3: Historial del cliente (al recibir un vehículo conocido)

**Quién la abre:** recepcionista, cada vez que entra un cliente recurrente al patio.

**Frecuencia:** ~5-15 veces/día (cada visita de cliente recurrente).

**Qué muestra:**

- Datos del cliente.
- Sus vehículos (puede tener más de uno).
- Últimas 10 OTs del cliente cerradas.
- Total gastado histórico y número de visitas.

**Cuántos documentos lee:** 1 `client` + N `vehicles` del cliente (típicamente 1-3) + query con `.limit(10)` de `workOrders` del cliente.

**Campos denormalizados necesarios en `clients`:**

- `lastVisitAt` ← actualizado al cerrar OT (Regla 1, se muestra en lista de clientes).
- `totalVisits` ← `increment(1)` al cerrar OT (Regla 5).
- `totalSpent` ← `increment(monto)` al cerrar OT (Regla 5).

**Campos en `vehicles`:**

- `clientName`, `clientPhone` ← para mostrar junto al vehículo sin re-leer `clients`.

---

## 13. Plan Inicio y planes de suscripción

### Plan Inicio

**$99 USD** — incluye:

- Configuración y deploy de TALLER en `[cliente].nuevaorbita.com`.
- Sesión presencial/videollamada de implementación (90 min).
- 2 sesiones de seguimiento (día 7 y día 30).
- Primer mes de operación.

TALLER es un WAP de complejidad media (5 módulos, equipo 1-8 personas, datos en Excel previos), por eso el Plan Inicio es $99 — más que BELLEZA ($75) y menos que PÓLIZA ($200).

### Planes de suscripción (después del Plan Inicio)

| Plan | Monto | Descuento | Equivalente mensual |
|---|---|---|---|
| Mensual | $45 USD | — | $45.00 |
| Trimestral | $121.50 USD | 10% | $40.50 |
| Anual | $459 USD | 15% | $38.25 |

Default: mensual. Se ofrecen las opciones de descuento al final de la Sesión 3.

### Primera transacción real (Sesión 1 del onboarding)

La acción que el cliente DEBE completar en la Sesión 1 para que cuente como "primera transacción real":

> **El recepcionista o el dueño abren una OT real para un vehículo real, completan al menos un servicio realizado por un mecánico real, y la cierran con un cobro real.** Tres acciones encadenadas:
>
> 1. **Abrir OT** → recepcionista registra el vehículo y el problema.
> 2. **Mecánico actualiza status** → al menos una tarea completada, status pasa a `listo`.
> 3. **Cerrar con cobro** → cajero/recepcionista registra el pago, status pasa a `entregado`.
>
> No cuenta como primera transacción real si solo se abre la OT y no se cierra. La trazabilidad completa de un vehículo es lo que demuestra valor en Sesión 1.

---

## 14. Colecciones archivables

### Default global

60 días de antigüedad mínima. TALLER usa el default para sus colecciones transaccionales.

### Colecciones archivables de TALLER

| Colección | dateField | Días antigüedad | En `<HistoricoViewer />` |
|---|---|---|---|
| `workOrders` | `createdAt` | 60 | **Sí** |
| `payments` | `paidAt` | 60 | **Sí** |
| `_audit` | `timestamp` | 60 | No (solo admin via Firestore Console) |
| `_whatsapp_events` | `sentAt` | 60 | No |

Cuando un cliente típico (15 vehículos/semana) acumula ~3 meses de uso, la cola se mantiene rápida porque solo carga las OTs activas — las cerradas hace más de 60 días viven en `_archive_workOrders_2026_03`, etc.

### Colecciones que NUNCA se archivan

- `clients` — catálogo. Un cliente puede volver después de 2 años, su historial debe estar vivo.
- `vehicles` — catálogo. Mismo argumento.
- `users` — catálogo de personal del taller.
- `config` — configuración global (si existe en V2+).

### Eliminación final

Después de **24 meses** en archivo, las colecciones `_archive_workOrders_*` y `_archive_payments_*` pueden eliminarse permanentemente con `scripts/purge-archive.js` (futuro, se construye cuando se necesite por primera vez — probablemente a fines de 2027).

`_audit` y `_whatsapp_events` archivados pueden eliminarse a los 24 meses también.

---

## Referencias

- Protocolo Nueva Órbita v2.2 (documento maestro en Project knowledge)
- `ONBOARDING.md` (protocolo de entrega del cliente — este repo)
- `CLAUDE.md` (contexto para Claude Code — este repo)
- `CHANGELOG.md` del Protocolo (historia de versiones)
