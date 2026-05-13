# PROMPT_INICIAL.md — TALLER

> Pegar este texto en Claude Code al iniciar una sesión nueva para construir TALLER.
> Generado por wap-builder el 2026-05-12 sobre el Protocolo Nueva Órbita v2.2.

---

## Mensaje para Claude Code

Hola Claude. Vamos a construir **TALLER**, una Web App (PWA) de Nueva Órbita para talleres mecánicos automotrices independientes en Ecuador.

Antes de tocar nada, necesito que hagas tres cosas en este orden:

### 1. Leer la documentación del proyecto

Lee en este orden:

1. **`TALLER.md`** — documento de referencia del producto. 14 secciones que definen qué es, cómo está modelado, los 5 módulos, las decisiones de producto cerradas, el roadmap, y las reglas para ti.
2. **`CLAUDE.md`** — contexto del repo. Cómo está estructurado, qué comandos usar, qué cliente está activo.
3. **`ONBOARDING.md`** — protocolo de entrega al cliente. Te da contexto sobre cómo se va a usar el producto en la vida real (recepción de vehículo → OT → cobro).

### 2. Confirmar contexto en máximo 10 líneas

Después de leer, dame una respuesta de **máximo 10 líneas** con:

- **1 línea:** qué entendiste del producto (filosofía + cliente objetivo).
- **1 línea:** stack confirmado (debe ser React + Vite + Vercel + Firestore Spark + PIN propio).
- **3 líneas:** las 3 reglas más importantes que NO debes romper.
- **1 línea:** en qué fase del roadmap arrancamos (V1 según sección 10).
- **El resto:** qué necesitas que yo confirme antes de generar el primer archivo.

Si tu respuesta supera 10 líneas, vuelve a empezar — es señal de que no estás siendo conciso.

### 3. Esperar mi confirmación antes de generar código

Después de tu respuesta de 10 líneas, **NO generes ningún archivo todavía**. Te indicaré por dónde empezamos.

---

## Reglas operativas para toda la sesión

### Siempre

- Pasar por `services/` para todas las lecturas/escrituras Firebase.
- Pasar por `withActor(session, data)` para toda escritura.
- Cerrar listeners en `useEffect` cleanup.
- Aplicar las 6 reglas de denormalización del Protocolo (sección 3 de TALLER.md tiene la denormalización ya definida).
- Actualizar `firestore.rules` cuando se cree/modifique una colección.
- Usar `usePaginatedQuery` o equivalente con `.limit()` en toda lista.
- Escrituras masivas en `batch` de máximo 500 documentos.
- Listar al final de cada cambio los archivos modificados, uno por línea.

### Nunca

- Tocar archivos no pedidos explícitamente.
- "Limpiar" o "refactorizar" código existente sin que yo lo pida.
- Agregar librerías sin preguntar primero.
- Crear archivos de prueba sin que yo lo pida.
- Cambiar estructura de carpetas sin preguntar.
- Usar TypeScript, Tailwind, Material/Chakra/Ant Design, Firebase Auth, Cloud Functions, localStorage.
- Usar emojis en UI de producción.
- Usar regionalismos (`carrito`, `padrísimo`, `checá`, `vos`, `decís`).
- Inventar — siempre preguntar.

### 3 reglas críticas específicas de TALLER

1. **El mecánico SOLO ve y modifica sus propias OTs.** Las reglas Firestore de `workOrders` validan `resource.data.mechanicId == actorId()` para el rol `mechanic`. Si vas a tocar la query de listar OTs o las reglas, valida esto sin excepción. Un mecánico viendo OTs de otro es una fuga de privacidad de cliente.

2. **La cola de OTs (`ColaOT`) es la pantalla más golpeada del producto** — 80-100 aperturas/día por taller. Todos los campos que se muestran en la cola DEBEN estar denormalizados dentro del documento `workOrders`: `clientName`, `clientPhone`, `vehiclePlaca`, `vehicleMarca`, `vehicleModelo`, `mechanicName`. Nunca hagas `getDoc` adicional desde el componente de la cola. Es lo que mantiene el WAP dentro de los 50K reads/día del plan Spark.

3. **Las fotos del estado inicial del vehículo se suben a Firebase Storage durante la recepción.** Esto NO es opcional — es el diferenciador comercial del producto (protección contra reclamos "me lo entregaron rayado"). Si vas a tocar el módulo Recepción, la subida de fotos debe seguir funcionando incluso en offline (cola de escrituras de Storage). Validar en cada deploy que `storage.rules` permite write desde roles `recepcionista | manager | owner`.

### Frase de freno

Si te sales de `TALLER.md`, voy a usar esta frase:

> *"Para. Relee TALLER.md sección X. Dime qué te saltaste y propón cómo corregirlo."*

Cuando la veas, deténte, vuelve a leer la sección que te indique, y proponme cómo corregir lo que se desvió.

---

## Alcance V1 (resumen)

Los 5 módulos en su versión mínima:

1. **Recepción** — registro de vehículo + fotos a Storage + creación de OT.
2. **OT** — documento vivo con tareas, repuestos, status (`recibido` → `diagnostico` → `aprobacion` → `proceso` → `listo` → `entregado`).
3. **Clientes y vehículos** — catálogo con historial e `increment()` en contadores.
4. **Caja** — cobro manual (efectivo/transferencia/tarjeta) + comprobante interno (sin SRI).
5. **Panel del dueño** — 4 KPIs del mes.

Más las 4 capacidades estándar v2.2: Import Excel, Export Excel, WhatsApp Click-to-Chat, Histórico.

**Excluido de V1:** recordatorios automáticos, catálogo de servicios estandarizado, inventario de repuestos, SRI, multi-local. Detalle completo en `TALLER.md` sección 10 (Roadmap).

---

## Cierre

Cuando confirmes tu contexto en las 10 líneas, **te indicaré por dónde empezamos**. Vamos paso a paso.

— Alfredo Pérez, Nueva Órbita
