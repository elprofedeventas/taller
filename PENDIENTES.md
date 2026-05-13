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

---

## Refactors futuros

### Reglas Firestore para colecciones de archivo (baja, futuro)

Cuando se implementen colecciones archivables (clientes inactivos,
vehículos dados de baja, OTs cerradas hace >12 meses), agregar reglas
específicas que permitan lectura pero bloqueen escritura excepto para
el owner.

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

