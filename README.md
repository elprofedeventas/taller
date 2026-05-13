# taller

Aplicacion web (PWA) de Nueva Orbita.

## Stack

- React 18 + Vite (frontend)
- Vercel (hosting)
- Firebase Firestore plan Spark (un proyecto por cliente)
- Firebase Storage
- Auth con PIN propio (no Firebase Auth)
- JavaScript + CSS Modules + Inter
- PWA instalable con vite-plugin-pwa
- xlsx (SheetJS) para import/export Excel

## Setup local

\\\ash
cd web
npm install
npm run dev
\\\

## Variables de entorno

Copiar web/.env.local.demo a web/.env.local.[cliente] y rellenar con valores
del proyecto Firebase del cliente.

Para arrancar en desarrollo, copiar el contenido del .env.local.[cliente]
deseado a web/.env.local.

El script deploy-cliente.ps1 maneja esto automaticamente en produccion.

## Bootstrap del primer cliente

1. Crear proyecto Firebase en console.firebase.google.com.
2. Activar Firestore (modo prueba) y Storage. Region: southamerica-east1.
3. Copiar config en web/.env.local.[cliente].
4. Ejecutar: node scripts/generate-pin-hash.js (despues de cambiar el PIN constante).
5. En Firestore Console -> users -> crear documento manual con pinSalt y pinHash impresos.
6. Desplegar reglas: firebase deploy --only firestore:rules
7. Desplegar a Vercel: \\NuevaOrbita\\scripts\\deploy-cliente.ps1 -Cliente [cliente] -Wap taller

## Archivado mensual (v2.2+)

Cuando el cliente llegue a AMARILLO en el semaforo Spark (Sheet pestana A):

1. Descargar serviceAccountKey.json del proyecto Firebase del cliente.
2. Editar CLIENTE_CONFIG en scripts/archive-month.js.
3. Ejecutar: node scripts/archive-month.js
4. BORRAR serviceAccountKey.json al terminar.

## Documentos de referencia

- [NOMBRE].md - describe el producto.
- CLAUDE.md - describe el repo (lo lee Claude Code).
- ONBOARDING.md - protocolo de entrega del producto al cliente.

## Licencia

Propietario: Alfredo Perez - Nueva Orbita.
