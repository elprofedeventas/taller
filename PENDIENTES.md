# PENDIENTES.md — TALLER

Estado vivo de tareas pendientes, decisiones diferidas y observaciones
técnicas que no bloquean la sesión actual pero deben resolverse antes
de deploy a producción o en sesiones futuras.

---

## Configuración pendiente

### Reemplazar placeholder WhatsApp en Login.jsx (alta)

`Login.jsx` tiene hardcodeado:

```
const WHATSAPP_URL = 'https://wa.me/593999999999?text=Hola%20Alfredo%2C%20mi%20cuenta%20de%20TALLER%20est%C3%A1%20pausada.';
```

Aparece solo en el mensaje de error "Cuenta pausada por pago pendiente"
(botón "Contactar por WhatsApp"). No bloquea desarrollo ni los tests,
pero **bloquea deploy a producción**: si una cuenta real se pausa y
el cajero hace tap en el botón, llegará a un número falso.

Decisión pendiente: ¿usar un único número del owner de TALLER (Alfredo)
para todos los clientes, o leerlo de la colección `config` del Sheet
del cliente para que cada taller tenga su propio canal de contacto?

---

## Documentación pendiente

### Eliminar rol cajero de TALLER.md y ONBOARDING.md (media)

El rol "cajero" fue descartado en la etapa de preparación pero aún
aparece mencionado en TALLER.md y ONBOARDING.md. Limpiar referencias
antes de mostrar al prospecto.

### Diferir fotos/Storage a V2 (media)

Marcar explícitamente en TALLER.md, ONBOARDING.md y PROMPT_INICIAL.md
que Storage (fotos de vehículos, fotos de OT) queda diferido a V2.
Hoy el código no lo usa, pero la documentación sugiere lo contrario.

### Agregar campos denormalizados de búsqueda al modelo de `clients` en TALLER.md (media)

Durante el módulo Clientes/Vehículos se agregaron tres campos
denormalizados al doc de `clients` para soportar búsqueda
case-insensitive prefix-match por cualquier palabra del nombre:

- `nameLower` = `name.toLowerCase()` (nombre completo, reservado para
  futuras búsquedas o reports).
- `nameTokens` = array de todos los tokens del nombre en lowercase.
  Ej. "Juan Carlos Pérez González" → `["juan", "carlos", "pérez", "gonzález"]`.
- `nameTokensPrefixes` = array con todos los prefijos de cada token.
  Ej. `["j", "ju", "jua", "juan", "c", "ca", ..., "carlos", "p", "pé",
  "pér", "pére", "pérez", "g", "go", ..., "gonzález"]`.

`ClientesList` busca con
`where('nameTokensPrefixes', 'array-contains', q.toLowerCase())`.
Una sola query. Encuentra cualquier token (primero, intermedio o
último) y cubre búsqueda incremental ("Pér" → Pérez).

Los tres se mantienen actualizados al crear y editar cliente
(`services/clientes.js:buildNameSearchFields`). Falta documentarlos
en TALLER.md sección 3 como campos obligatorios del modelo. El
cambio ya está reflejado en `firestore.rules` (los tres están en
los keys obligatorios de `clients` create) — recordar volver a
desplegar con `firebase deploy --only firestore:rules` antes del
próximo deploy de la app.

**Costo de almacenamiento:** ~1 prefijo por carácter de cada token.
Un nombre típico de 2 tokens (~13 chars total) genera ~13 prefijos.
Nombre largo de 4-5 tokens, ~30 prefijos. Despreciable en Spark.

**Backfill manual del doc existente (Alfredo Pérez):** abrir la app,
buscar cliente por placa o teléfono, click "Editar", click "Guardar
cambios" sin tocar nada. Eso dispara `updateClient` y agrega
`nameTokens`/`nameTokensPrefixes` al doc.

---

## Refactors futuros

### Numeracion legible secuencial de OT (baja)

`services/workOrders.js:createOT` actualmente usa el auto-ID de
Firestore como identificador del doc. TALLER.md §8 sugiere el
formato legible `OT-YYYY-MM-NNN` (ej. `OT-2026-05-001`). Para
construir el secuencial real (NNN) sin colisiones, hay dos
caminos:

1. **Contador transaccional en `config/counters`:** doc por mes
   (`counters/workOrders-2026-05` con `next: 42`). En `createOT`
   correr `runTransaction` que lee, incrementa y escribe. Genera
   el `otNumber` legible y lo denormaliza al doc de la OT.
2. **`otNumber` derivado del auto-ID:** ej. `OT-2026-05-${primeros 6 chars del autoID}`. Legible y único, pero
   no secuencial. Más simple, sin transacción.

Implementar cuando un taller cliente lo pida. Mientras tanto, la
UI muestra el auto-ID al final del placeholder "OT creada".

### Reglas Firestore para colecciones de archivo (baja, futuro)

Cuando se implementen colecciones archivables (clientes inactivos,
vehículos dados de baja, OTs cerradas hace >12 meses), agregar reglas
específicas que permitan lectura pero bloqueen escritura excepto para
el owner.

### Propagar denorm de cliente a `workOrders` activas cuando exista módulo OT (media)

`services/clientes.js` ya propaga `clientName`/`clientPhone` a `vehicles`
al editar el cliente (Regla 5 del Protocolo). Falta propagar también a
`workOrders` activas (status ≠ `entregado` y ≠ `cancelado`) para que la
ColaOT y los detalles muestren datos actuales. Las OTs cerradas y
canceladas no se tocan: son históricas y conservan el nombre/teléfono
del cliente en ese momento. Implementar dentro de `updateClient` cuando
el módulo OT exista, mismo patrón de batch que
`propagateClientDenormToVehicles`.

### Refactor useAuth.js a estado compartido en v2.3 Protocolo (media)

useAuth.js mantiene estado local. En v2.3 del Protocolo se moverá a
estado compartido (Context API o similar) para que múltiples módulos
puedan leer la sesión sin prop drilling.

**Nota técnica relacionada (Login.jsx):** el patrón actual usa una ref
booleana `attempting` como flag de reentrada para evitar que el
auto-submit dispare un segundo intento mientras el primero está
procesándose. Esto funciona porque `auth.login` siempre cede al event
loop (hace `await` sobre `getDocs`). Si en el refactor v2.3 `auth.login`
se vuelve potencialmente síncrona (ej. validación temprana del formato
del PIN con return inmediato sin await), el flag podría quedar en
`true` indefinidamente y trabar el segundo intento. Revisar este
efecto al hacer el refactor.

---

## Módulos completados

### Login (sesión 2 — completado el 2026-05-13)

Los 7 tests pasaron:

1. Visual ✓
2. Teclado físico ✓
3. PIN incorrecto ✓
4. PIN correcto ✓
5. Cerrar sesión ✓
6. Auditoría en `_audit` ✓
7. Offline ✓

Decisiones técnicas tomadas durante el cierre:

- **Timeout offline:** la lectura de `users` en `services/auth.js#login`
  está envuelta en `Promise.race` contra `setTimeout(5000)`. Si Firestore
  no responde en 5s, se lanza `Error('OFFLINE')`. El audit log
  (`logEvent`, `logFailedLogin`) se deja encolar offline para
  sincronizar al reconectar.
- **Manejo de error en Login.jsx:** `mapError` reconoce el string
  `'OFFLINE'` y lo mapea a `'offline'`, con mensaje "Sin conexión.
  Verifica tu red e intenta de nuevo." Sigue el mismo patrón que
  `ACCOUNT_PAUSED_PAYMENT` y `ACCOUNT_INACTIVE`.
- **Comportamiento offline con cache poblada:** Firestore puede resolver
  `getDocs` desde cache local antes de que el timeout dispare. Esto
  permite que un cajero que ya entró hoy pueda volver a entrar aunque
  se caiga la red del taller. Es comportamiento deseado, no bug.
