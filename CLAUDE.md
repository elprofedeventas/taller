# CLAUDE.md

> Archivo leido por Claude Code al inicio de cada sesion en este repo.
> Mantenerlo actualizado cuando cambien decisiones tecnicas importantes.

## Proyecto

**Nombre:** TALLER
**Stack:** React + Vite + Vercel + Firebase Firestore Spark + PIN propio
**Documento maestro del producto:** taller.md
**Documento de onboarding:** ONBOARDING.md
**Version del Protocolo Nueva Orbita:** v2.2

## Reglas innegociables (heredan del Protocolo Nueva Orbita v2.2)

1. Vercel CLI y Firebase CLI son GLOBALES. NUNCA hacer 'npm install vercel' ni 'npm install firebase-tools'.
2. Sin TypeScript, sin Tailwind, sin librerias UI grandes, sin Firebase Auth, sin Cloud Functions, sin localStorage.
3. Componentes nunca tocan Firestore directo. Siempre via services/.
4. Toda escritura a Firestore pasa por withActor(session, data).
5. Listeners de Firestore tienen cleanup en useEffect.
6. firestore.rules se actualiza en la misma sesion que se crea/modifica una coleccion.
7. UI sin emojis en produccion. Espanol neutro, sin regionalismos.
8. Cada npm install requiere confirmacion previa.
9. Aplicar las 6 reglas de denormalizacion (Protocolo seccion 10).
10. No tocar archivos no pedidos. No "limpiar" codigo existente sin que se pida.
11. Toda lista usa usePaginatedQuery o equivalente con .limit().
12. Escrituras masivas en batch de maximo 500 documentos.

## Workflow especial

Cuando Alfredo sube un archivo base con la frase "Actualiza este archivo con todos los cambios que hemos hecho en esta sesion", primero verificar que cambios faltan, sumar todos esos cambios, y entregar un solo archivo completo.

## Frase de freno

Si Claude Code se sale de [NOMBRE].md, Alfredo usa:
> "Para. Relee [NOMBRE].md seccion X. Dime que te saltaste y propon como corregirlo."

## Estructura del repo

\\\
web/                     frontend Vite + React
  src/
    components/          UI reutilizable
      ConnectionStatus.jsx
      ExcelImporter.jsx
      ExcelExporter.jsx
      WhatsAppButton.jsx
      HistoricoViewer.jsx
    modules/             un folder por modulo del producto
    services/
      firestore.js       cliente con persistencia offline
      auth.js            login con PIN, withActor, audit log, deteccion pausa
      excel.js           import/export Excel via SheetJS
      whatsapp.js        Click-to-Chat con plantillas y registro
    hooks/
      useAuth.js
      useOnlineStatus.js
      usePaginatedQuery.js   v2.2+, OBLIGATORIO en toda lista
    styles/              variables CSS, reset
    utils/
  public/                iconos PWA
scripts/
  generate-pin-hash.js   bootstrap manual de owner
  archive-month.js       archivado mensual (Admin SDK, v2.2+)
firestore.rules          5 capas + _whatsapp_events + _archive_index
firestore.indexes.json
firebase.json
storage.rules
\\\

## Comandos del proyecto

- cd web && npm run dev - desarrollo local (sin service worker)
- cd web && npm run build - build de produccion (con PWA)
- cd web && npm run preview - preview con PWA activa
- vercel - deploy preview (CLI global)
- vercel --prod - deploy a produccion
- firebase deploy --only firestore:rules - desplegar reglas
- \\NuevaOrbita\\scripts\\deploy-cliente.ps1 -Cliente [c] -Wap [w] - deploy automatico

## Firebase (por cliente)

Cada cliente final tiene su propio proyecto Firebase. Anotar aqui los proyectos activos:

| Cliente | Proyecto Firebase | Region | URL Consola |
|---------|------------------|--------|-------------|
| demo | taller-11d50 | southamerica-east1 | https://console.firebase.google.com/project/taller-11d50 |

## Variables de entorno por cliente

Cada cliente tiene su propio web/.env.local.[cliente] con sus credenciales Firebase.
Documentar en hoja Google Sheet "Presupuesto operacional Nueva Orbita" del Drive de Alfredo.

## Subdominios (v2.2+)

- Cliente real: https://[cliente].nuevaorbita.com
- Demo publica: https://taller.nuevaorbita.com
- Wildcard DNS: configurado en Bluehost una vez (*.nuevaorbita.com -> cname.vercel-dns.com)

## Archivado mensual (v2.2+)

Trigger primario: cliente en AMARILLO en pestana A de la Sheet.
Procedimiento: 1) descargar serviceAccountKey.json, 2) editar CLIENTE_CONFIG en scripts/archive-month.js,
3) node scripts/archive-month.js, 4) BORRAR serviceAccountKey.json.

## Pendientes

Ver PENDIENTES.md si existe, o el Project hijo de claude.ai correspondiente.
