# ONBOARDING — TALLER

> Protocolo de entrega de TALLER a un cliente nuevo (dueño de taller mecánico automotriz independiente).
> Versión del Protocolo Nueva Órbita: **v2.2+**
>
> Tiempo total: 3 sesiones distribuidas en 30 días.
> Esfuerzo Alfredo: ~2.5 horas por cliente (90 min + 30 min + 30 min).

---

## Plan Inicio (lo que paga el cliente)

**$99 USD** — Plan Inicio (incluye):

- Configuración y deploy de TALLER en su subdominio (`[cliente].nuevaorbita.com`).
- Sesión presencial/videollamada de implementación (90 min).
- 2 sesiones de seguimiento (día 7 y día 30).
- Primer mes de operación.

**Pago:** transferencia bancaria antes del Día 1.

**Después del Plan Inicio, opciones de suscripción:**

| Plan | Monto | Descuento |
|---|---|---|
| Mensual | $45 USD | — |
| Trimestral | $121.50 USD | 10% |
| Anual | $459 USD | 15% |

Default: mensual. Se ofrecen las opciones de descuento al final de la Sesión 3.

---

## Pre-Día 1 (lo que haces TÚ antes de ver al cliente)

### Pre-1. Confirmación del pago

- Cliente transfiere $99 USD.
- Validas en tu banco.
- Anotas en la hoja "Presupuesto operacional Nueva Órbita" pestaña A: fila nueva del cliente.

### Pre-2. Setup técnico (te toma 30-45 min)

1. Crear proyecto Firebase del cliente: `taller-[cliente]-prod` (ej. `taller-mecanicasur-prod`).
2. Activar Firestore y Storage. Región `southamerica-east1`.
3. Activar Storage (las fotos del estado inicial del vehículo viven ahí — diferenciador comercial).
4. Copiar config Firebase a `web/.env.local.[cliente]`.
5. Bootstrap del primer owner: editar `scripts/generate-pin-hash.js` con un PIN temporal (ej. `1234`), ejecutar, copiar el hash + salt a Firestore Console manual en `users/[ownerId]`.
6. Desplegar reglas: `firebase deploy --only firestore:rules,storage`.
7. Ejecutar: `deploy-cliente.ps1 -Cliente [cliente] -Wap taller`.
8. Validar que `https://[cliente].nuevaorbita.com` carga y el login con PIN temporal funciona.
9. Cambiar el PIN temporal por uno definitivo en la Sesión 1 con el cliente.

### Pre-3. Pedido al cliente (mensaje 3 días antes)

```
Hola [Nombre], confirmamos nuestra sesión de implementación
de TALLER el [fecha] a las [hora].

Para que aprovechemos el tiempo, te pido que tengas listo:

1. Tu Excel de clientes con sus vehículos (si lo tienes). Lo que sea —
   nombre, teléfono, placa, marca, modelo. Aunque esté incompleto,
   sirve. Si no tienes Excel, no te preocupes, lo armamos en vivo.

2. Los nombres de las personas que van a usar la app:
   - Recepcionista(s)
   - Mecánicos (uno por uno con nombre y apellido)
   - Cajero/a si tienes una persona específica

3. Un vehículo real listo para recepcionar el día de la sesión.
   Cualquier carro que esté llegando ese día funciona. Ese será
   tu primer caso real en la app.

4. Tu tablet o celular cargado, y el WiFi del taller funcionando.

Si tienes el Excel ya armado, mándamelo por aquí para ir adelantando.

— Alfredo
```

---

## Sesión 1 — Día 1: Implementación

**Duración:** 60-90 min.
**Modalidad:** presencial si Guayaquil/Quito; videollamada si fuera.
**Objetivo:** que el cliente termine con **una OT real cerrada con cobro real** registrada en TALLER.

### Guion (sigue este orden)

**Minuto 0-5 — Bienvenida y revisión del pago.**

> "Antes de empezar, te confirmo que recibimos tu pago de $99. Vamos a dejar tu TALLER funcionando hoy mismo. Te voy a guiar paso a paso, no necesitas saber nada técnico."

**Minuto 5-15 — Tour rápido por la app en su dispositivo.**

- Abrir `https://[cliente].nuevaorbita.com` en su tablet/celular.
- "Instalar" como app (Agregar a pantalla de inicio). Mostrar que se ve como app nativa.
- Mostrar el login con PIN.
- Login con el PIN temporal.
- Tour de las 5 pantallas principales:
  1. **Cola de OTs** (la pantalla más usada — explicar que aquí van a vivir).
  2. **Recepción** (cómo se abre una OT nueva).
  3. **Detalle de OT** (qué ve el mecánico).
  4. **Caja** (cómo se cobra al cerrar).
  5. **Panel del dueño** (los 4 KPIs).

**Minuto 15-30 — Cambio de PIN del owner + creación de usuarios.**

- El cliente elige su PIN definitivo de 4 dígitos memorables.
- Tú lo cambias en Firestore Console (o desde la app si ya existe esa función).
- Crear los usuarios secundarios uno por uno. **El cliente elige cada PIN.**
- Para cada usuario, asignar rol:
  - Recepcionista(s) → rol `recepcionista`.
  - Mecánicos → rol `mechanic`.
  - Cajero/a → rol `cajero`.
  - Si hay alguien que necesita ver el panel pero no es el dueño → rol `manager`.
- **Anotar en hoja de papel** los nombres, roles y PINs.
- Entregar al cliente esa hoja: "Esta es tu lista de PINs. Guárdala en lugar seguro. Si alguien la pierde, podemos generar PINs nuevos."

**Minuto 30-50 — Import de clientes y vehículos.**

- Recibir el Excel del cliente (si lo trajo).
- Abrir pantalla de Import en la app (`<ExcelImporter />`).
- Mapear columnas:
  - **`clients`**: Nombre (obligatoria), Teléfono (obligatoria), Email (opcional).
  - **`vehicles`**: Placa (obligatoria), Marca (obligatoria), Modelo (obligatoria), Año (opcional), Cliente vinculado por nombre o teléfono (obligatoria).
- Validar preview en pantalla con el cliente: "¿Está bien así? ¿Reconoces estos nombres?"
- Confirmar import.
- Mostrar los datos ya cargados en la pantalla de Clientes.
- **Si no trajo Excel:** crear 3-5 clientes y vehículos manuales en vivo. No es bloqueador.

**Minuto 50-80 — La primera transacción real (lo más importante).**

Esta es la parte crítica de Sesión 1. El cliente registra **una OT completa de principio a fin** con un vehículo real que está en el patio ese día, tú observando.

Tres acciones encadenadas:

> **Acción 1 — El recepcionista abre la OT.**
>
> El cliente (o su recepcionista, si está) toma el celular y:
> 1. Va a "Recepción".
> 2. Busca el cliente por placa o teléfono (si es recurrente) o lo crea (si es nuevo).
> 3. Captura el problema reportado: "no enciende", "fuga de aceite", "ruido al frenar"...
> 4. Toma 3-4 fotos del estado inicial del vehículo (rayones, abolladuras, kilometraje del tablero).
> 5. Genera la OT (se le asigna un número `OT-2026-05-XXX`).
>
> **Acción 2 — El mecánico actualiza la OT.**
>
> Ahora el mecánico (si está en el taller) o el cliente actuando como mecánico:
> 1. Hace login con su PIN.
> 2. Abre la OT desde la cola.
> 3. Agrega al menos UNA tarea de mano de obra (ej. "Cambio de aceite, $20").
> 4. Agrega al menos UN repuesto (ej. "Aceite 10W-30, 1 galón, $25").
> 5. Cambia status: `recibido` → `diagnostico` → `aprobacion` → `proceso` → `listo`.
>
> **Acción 3 — Cerrar con cobro.**
>
> El cliente (como cajero o recepcionista):
> 1. Abre la OT en status `listo`.
> 2. Entra a la pantalla de Caja.
> 3. Confirma el monto total.
> 4. Elige forma de pago (efectivo, transferencia, o tarjeta).
> 5. Registra el cobro. Status pasa a `entregado`.
> 6. Imprime el comprobante interno (opcional, pero mostrar la función).

**Tú no tocas la app en esta parte.** El cliente hace todo. Tú respondes "¿y ahora qué?" cuando él pregunte. Si se traba, dejas 30 segundos antes de ayudar — que descubra él mismo.

**Minuto 80-90 — Cierre con próximas fechas y prueba WhatsApp.**

- Probar el botón de WhatsApp en la OT recién cerrada con plantilla `vehiculo_listo` (mandárselo al propio cliente para que vea cómo funciona).
- "El próximo lunes [fecha Día 7] te llamo 30 minutos por video para ver cómo te fue. Y en 30 días [fecha Día 30] nos vemos otra vez para ver el primer mes completo."
- Agendar las dos fechas en tu Google Calendar.
- "Si necesitas algo entre estas fechas, escríbeme por WhatsApp. Te respondo el mismo día."

### Checklist al cerrar Sesión 1

- [ ] Pago de $99 confirmado en banco.
- [ ] TALLER desplegado y accesible desde `https://[cliente].nuevaorbita.com`.
- [ ] PIN del owner cambiado a uno definitivo elegido por el cliente.
- [ ] Lista de usuarios secundarios creados con sus PINs (en papel entregado al cliente).
- [ ] Clientes y vehículos importados desde Excel (o creados manualmente en vivo).
- [ ] **UNA OT real cerrada con cobro real** (las 3 acciones encadenadas).
- [ ] Al menos 3 fotos del estado inicial subidas a Firebase Storage en esa OT.
- [ ] Al menos 1 mensaje WhatsApp enviado desde la app (probado con cliente real o consigo mismo).
- [ ] Cliente agregado a la pestaña A de "Presupuesto operacional Nueva Órbita".
- [ ] Sesión 2 (día 7) y Sesión 3 (día 30) agendadas en tu calendario.

---

## Sesión 2 — Día 7: Validación

**Duración:** 20-30 min.
**Modalidad:** videollamada.
**Objetivo:** detectar bloqueos antes de que se vuelvan razón de cancelación.

### Pre-trabajo (15 min antes de la llamada)

1. Abrir Firestore Console del cliente.
2. Revisar colección `_audit`:
   - ¿Cuántos `LOGIN_SUCCESS` hay desde Día 1?
   - ¿De qué `actorId` vienen? ¿Solo el owner o también recepcionistas y mecánicos?
3. Revisar colección `workOrders`:
   - ¿Cuántas OTs nuevas se crearon en 7 días?
   - ¿Cuántas se cerraron con cobro?
   - ¿Hay OTs estancadas en status `recibido` por más de 3 días? (Señal de uso a medias.)
4. Revisar `payments`:
   - ¿Cuántos cobros registrados? Suma total del período.
5. Revisar `_whatsapp_events`:
   - ¿Cliente envió WhatsApps desde la WAP?
6. Clasificar al cliente:
   - **Verde:** 5+ OTs creadas Y la mayoría cerradas con cobro. Mecánicos haciendo login. Cliente sano.
   - **Amarillo:** 1-4 OTs creadas, algunas estancadas. Solo el owner hace login. Necesita más confianza del equipo.
   - **Rojo:** 0 OTs o solo OTs vacías que nadie cerró. Riesgo de churn alto.

### Guion según clasificación

**Si VERDE:**

> "Veo que ya están usando TALLER intensivamente. Cerraste [N] OTs esta semana, eso es buenísimo para arrancar. ¿Hay algo que te frustre o que te gustaría que también hiciera?"

- Anotar 1-3 sugerencias.
- Decidir en vivo si van a V1 (próxima actualización), V2 (siguiente versión).
- Comunicar la decisión claramente al cliente: "Eso es V2, te aviso cuando arranquemos."

**Si AMARILLO:**

> "Veo que han creado algunas OTs pero todavía no usan la app a fondo. Cuéntame: ¿qué pantalla te confunde? ¿en qué momento del día se les hace más difícil usarla?"

- Identificar la fricción concreta. Causas típicas en taller:
  - "El mecánico no quiere usar el celular sucio bajo el carro" → sugerir tablet de bajo costo dedicada al taller, o usar la app solo al recibir/entregar.
  - "Mi recepcionista escribe todo en cuaderno todavía" → hacer mini-sesión de 10 min con esa persona específicamente.
  - "Las fotos tardan en subir" → revisar WiFi del taller, o explicar que se suben offline y se completan cuando vuelve la señal.
- Si es UX confusa: hacer una mini-sesión de 10 min con la pantalla específica.
- Si es resistencia de un miembro del equipo: agendar 15 min con esa persona específicamente.

**Si ROJO:**

> "Notamos que esta semana no han podido entrar a usar TALLER. Es normal arrancar con dudas, pero te quiero ayudar a desbloquearlo antes de que se vuelva un problema mayor."

- Pregunta directa: "¿Qué fue lo que te frenó?"
- Causas típicas en taller:
  - "Se nos olvidaron los PINs" → recordatorio y guardarlos en lugar seguro.
  - "No tuvimos tiempo, esta semana entraron 20 carros" → reagendar onboarding intensivo de 60 min específicamente con el recepcionista.
  - "Mi gente prefiere el cuaderno" → conversación con el equipo, no solo el dueño. Sesión específica con quien hace recepción.
  - "Se cayó el WiFi del taller" → explicar la persistencia offline, mostrar el banner de cambios pendientes.

### Checklist al cerrar Sesión 2

- [ ] Clasificación del cliente registrada en pestaña A de la Sheet (Verde/Amarillo/Rojo).
- [ ] Si AMARILLO: plan de acción específico anotado en pestaña C de la Sheet.
- [ ] Si ROJO: nueva sesión intensiva agendada antes del Día 14.
- [ ] Si el cliente NO USA TALLER al Día 14 a pesar de la nueva sesión: pausar (cambiar `users/[ownerId].active = false`, `pausedReason: 'NO_USE'` en Firestore Console) y enviar plantilla `pausa_no_uso` por WhatsApp.

---

## Sesión 3 — Día 30: Primer mes

**Duración:** 30 min.
**Modalidad:** videollamada o presencial.
**Objetivo:** consolidar el primer mes y abrir conversación de continuidad.

### Pre-trabajo (10 min antes)

1. Firestore Console → colección `workOrders` del cliente:
   - Total de OTs creadas del mes.
   - Total cerradas con cobro.
   - Promedio diario.
   - Pico de actividad (qué día tuvo más OTs).
2. Firestore Console → `payments`:
   - Suma total cobrada en el mes.
   - Breakdown por forma de pago.
3. `_audit`:
   - ¿Qué usuarios activos hay? (Owner solo, o también recepcionistas, mecánicos, cajeros.)
4. `_whatsapp_events`:
   - Cuántos mensajes envió el cliente desde la app y de qué plantillas.

### Guion

**Minuto 0-5 — Confirmación de continuidad y opciones de plan.**

> "Hoy se cumple tu primer mes con TALLER. Antes de avanzar, ¿quieres seguir?
>
> Si la respuesta es sí, tienes tres opciones:
>
> - **Mensual:** $45 USD cada mes.
> - **Trimestral:** $121.50 USD cada 3 meses (10% de descuento, te ahorras $13.50 cada 3 meses).
> - **Anual:** $459 USD una vez al año (15% de descuento, te ahorras $81 al año — equivale a casi 2 meses gratis).
>
> ¿Cuál prefieres?"

Si el cliente duda: pregunta directa "¿qué te haría dudar?". Suele ser presupuesto, no producto. Si es presupuesto, ofrece pausar 1 mes antes de cancelar.

**Minuto 5-20 — Abrir TALLER juntos y revisar el mes.**

- Compartir pantalla (si videollamada) o sentarse al lado (presencial).
- Abrir el **Panel del dueño**.
- Recorrer los 4 KPIs del mes con el cliente:
  - "Mira, en este mes registraste **[N] OTs** y cerraste **[M] con cobro**."
  - "Ingresaste **$[X]** en total. Tu día más fuerte fue el **[día]** con $[Y]."
  - "Tu mecánico más productivo fue **[Nombre]** con [P] OTs cerradas."
  - "Tienes **[R] clientes recurrentes** vs **[N] clientes nuevos** este mes."
- **Pregunta clave**: "¿Algo de esto te sorprende?"
- Esta pregunta abre el espacio para escuchar fricción real o para que el dueño descubra un dato del negocio que no conocía.

**Minuto 20-25 — Próximos pasos del cliente.**

- "Para este mes que arranca, ¿qué quieres mejorar?"
- Anotar 1-2 cosas que él quiere lograr.
- Si requieren features nuevas:
  - Recordatorios de mantenimiento → V2.
  - Catálogo de servicios con precios fijos → V2.
  - Inventario de repuestos con alertas → V3.
  - Factura SRI electrónica → V3 (implica Blaze, costo adicional).
- Decidir en vivo a qué versión va cada cosa.

**Minuto 25-30 — Cierre + opciones.**

Frase estándar al final:

> "Si quieres, te puedo armar un reporte en PDF con los datos de tu primer mes para que se lo pases a tu contador o a tu socio. Toma como un día prepararlo bien. Avísame si lo quieres."

Si el cliente lo pide: convertirlo en plantilla del repo (ver sección "Reporte primer mes" abajo). Toma 4-6 horas tu trabajo, sirve como filtro de clientes sofisticados.

Si es momento de venta cruzada (cliente sano + uso intenso + tiene otros negocios o referidos): plantar la semilla.

> "Una cosa más. Si en algún momento conoces otro dueño de taller que esté como tú estabas hace un mes, mándame el contacto. Le hago una demo de 30 min sin compromiso."

Y si el cliente mismo tiene un segundo taller o pertenece a un nicho complementario:

> "Sé que tienes [otro negocio]. Tengo herramientas parecidas para [nicho]. Cuando quieras, te armo una demo."

### Checklist al cerrar Sesión 3

- [ ] Continuidad confirmada o cancelación procesada.
- [ ] Plan elegido (mensual/trimestral/anual) registrado en pestaña E de la Sheet.
- [ ] Si continúa: cobro de la primera cuota activado para el Día 31.
- [ ] 1-2 features deseadas por el cliente registradas (a V1, V2 o V3).
- [ ] Si pidió reporte PDF: agendar 1 día de tu agenda para armarlo.
- [ ] Si hay venta cruzada potencial: anotar contacto en tu CRM personal.

---

## Reporte primer mes (solo bajo demanda)

Si el cliente lo pide en la Sesión 3, ejecutas esto:

1. Generar export Excel con `<ExcelExporter />` del mes del cliente (`workOrders` + `payments`).
2. Procesar manualmente con la plantilla Excel "Reporte cliente NV TALLER" (en Drive, separada).
3. Exportar a PDF (Save As → PDF).
4. Personalizar la portada con nombre del taller, logo si lo tienen, foto del local.
5. Incluir secciones: ingresos del mes, top servicios, top clientes, mecánicos productivos, comparativo recurrentes vs nuevos.
6. Enviar por email + WhatsApp.

Tiempo total: 4-6 horas por cliente. Solo lo haces si lo pide.

---

## Política de pausa por no uso o no pago

### Si el cliente no usa TALLER al Día 14 a pesar de la sesión intensiva

- Pausar el owner en Firestore Console: `users/[ownerId].active = false`, `pausedReason: 'NO_USE'`, `pausedAt: serverTimestamp()`, `pausedBy: 'alfredo'`.
- Enviar plantilla WhatsApp `pausa_no_uso` documentada en el repo.
- El cliente NO recibe reembolso del Plan Inicio.
- Datos quedan guardados 90 días para posible reactivación.

### Si el cliente entra en mora de suscripción

Secuencia 1/3/7/14 estándar del Protocolo:

- Día 1: enviar `dia_1_cobro`.
- Día 3: enviar `dia_3_recordatorio`.
- Día 7: enviar `dia_7_insistir`.
- Día 14: pausar (`pausedReason: 'PAYMENT_OVERDUE'`) + enviar `dia_14_pausa`.

Al pausarse, el cliente ve mensaje específico en pantalla de login con botón directo a WhatsApp de Alfredo.

---

## KPIs de onboarding TALLER (tu medición interna)

Una vez al mes revisas estos números:

| KPI | Objetivo | Cómo medir |
|---|---|---|
| Tasa de activación (Día 7) | 80%+ verde/amarillo | Clientes verdes+amarillos / total clientes Día 7 |
| Tasa de churn primer mes | < 15% | Cancelados Día 30 / activados Día 1 |
| Tiempo Día 1 → primera OT cerrada con cobro | < 90 min | Diff timestamp pago Plan Inicio vs primer `payments` registrado |
| OTs creadas semana 1 | 5+ promedio | Total `workOrders` Día 1-7 / clientes Día 7 |
| Tasa de venta cruzada a 90 días | 10%+ | Clientes con 2+ WAPs / total clientes |

Si alguno está fuera de rango por 2 meses consecutivos: revisar el protocolo y ajustar.

---

## Datos bancarios

Bloque único guardado en el Google Doc `Datos bancarios Nueva Órbita`. Se pega en cada plantilla WhatsApp con `{datosBancarios}`. Cuando cambien las cuentas, se cambia en un solo lugar.
