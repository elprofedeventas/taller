// scripts/archive-month.js
// Archivado mensual de colecciones marcadas como archivables.
// Patron estandar Nueva Orbita v2.2+
//
// Uso:
//   1. Descargar serviceAccountKey.json del proyecto Firebase del cliente:
//      Firebase Console -> Project Settings -> Service Accounts ->
//      Generate new private key. Guardar en raiz del repo (NO commitear).
//
//   2. Instalar firebase-admin si no esta: npm install firebase-admin
//
//   3. Editar la constante CLIENTE_CONFIG abajo con los datos del cliente.
//
//   4. Ejecutar: node scripts/archive-month.js
//
//   5. BORRAR serviceAccountKey.json al terminar (seguridad).

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// ===========================================================
// CONFIGURACION POR EJECUCION (editar antes de cada run)
// ===========================================================
const CLIENTE_CONFIG = {
  cliente: 'laostra',                 // ID corto del cliente (coincidir con Sheet)
  proyectoFirebase: 'resto-laostra-prod',
  diasMinimos: 60,                     // default global; cada WAP puede override

  // Colecciones a archivar (vienen del [NOMBRE].md del WAP, pregunta 22).
  // Cada coleccion declara su campo de fecha de creacion.
  colecciones: [
    { nombre: 'orders', dateField: 'createdAt' },
    { nombre: '_audit', dateField: 'timestamp' },
    { nombre: '_whatsapp_events', dateField: 'sentAt' }
    // Ejemplos por WAP:
    //   RESTO: orders, _audit, _whatsapp_events
    //   BELLEZA: appointments, _audit, _whatsapp_events
    //   POLIZA: policies (dateField='renewalDate', diasMinimos=730)
  ]
};

// ===========================================================
// LOGICA DEL SCRIPT (no tocar)
// ===========================================================

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function archivarColeccion({ nombre, dateField }) {
  const ahora = new Date();
  const cutoff = new Date(ahora.getTime() - CLIENTE_CONFIG.diasMinimos * 24 * 60 * 60 * 1000);

  console.log('\n[' + nombre + '] Buscando documentos anteriores a ' + cutoff.toISOString() + '...');

  const snap = await db.collection(nombre)
    .where(dateField, '<', cutoff)
    .get();

  if (snap.empty) {
    console.log('[' + nombre + '] No hay documentos para archivar.');
    return { archivados: 0, errores: 0 };
  }

  console.log('[' + nombre + '] ' + snap.size + ' documentos candidatos a archivado.');

  // Agrupar por YYYY_MM segun fecha del documento
  const grupos = {};
  snap.docs.forEach(doc => {
    const data = doc.data();
    const fecha = data[dateField].toDate();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const key = year + '_' + month;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push({ id: doc.id, data });
  });

  let archivados = 0;
  let errores = 0;

  for (const [periodo, docs] of Object.entries(grupos)) {
    const archiveCollName = '_archive_' + nombre + '_' + periodo;
    console.log('[' + nombre + '] Archivando ' + docs.length + ' docs en ' + archiveCollName + '...');

    // Procesar en batches de 500 (limite Firestore)
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      const slice = docs.slice(i, i + 500);

      slice.forEach(({ id, data }) => {
        const archiveRef = db.collection(archiveCollName).doc(id);
        batch.set(archiveRef, {
          ...data,
          _archivedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const originalRef = db.collection(nombre).doc(id);
        batch.delete(originalRef);
      });

      try {
        await batch.commit();
        archivados += slice.length;
        console.log('[' + nombre + '] Batch ' + (Math.floor(i / 500) + 1) + ' completado.');
      } catch (err) {
        console.error('[' + nombre + '] Error en batch: ' + err.message);
        errores += slice.length;
      }
    }

    // Registrar en el indice
    try {
      const indexRef = db.collection('_archive_index').doc(nombre + '_' + periodo);
      await indexRef.set({
        entidad: nombre,
        periodo: periodo,
        docsCount: docs.length,
        archivedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('[' + nombre + '] Indice actualizado: ' + nombre + '_' + periodo);
    } catch (err) {
      console.warn('[' + nombre + '] No se pudo actualizar indice: ' + err.message);
    }
  }

  return { archivados, errores };
}

async function main() {
  console.log('============================================================');
  console.log(' Archivado mensual Nueva Orbita v2.2');
  console.log('============================================================');
  console.log(' Cliente:           ' + CLIENTE_CONFIG.cliente);
  console.log(' Proyecto Firebase: ' + CLIENTE_CONFIG.proyectoFirebase);
  console.log(' Antiguedad minima: ' + CLIENTE_CONFIG.diasMinimos + ' dias');
  console.log(' Colecciones:       ' + CLIENTE_CONFIG.colecciones.map(c => c.nombre).join(', '));
  console.log('============================================================\n');

  const totales = { archivados: 0, errores: 0 };

  for (const coleccion of CLIENTE_CONFIG.colecciones) {
    try {
      const resultado = await archivarColeccion(coleccion);
      totales.archivados += resultado.archivados;
      totales.errores += resultado.errores;
    } catch (err) {
      console.error('Error fatal en ' + coleccion.nombre + ': ' + err.message);
      totales.errores += 1;
    }
  }

  console.log('\n============================================================');
  console.log(' Archivado completado.');
  console.log(' Total documentos archivados: ' + totales.archivados);
  console.log(' Total errores:               ' + totales.errores);
  console.log('============================================================\n');

  console.log('Pasos siguientes:');
  console.log('  1. Verificar en Firebase Console que las colecciones _archive_* existen.');
  console.log('  2. Validar reads/dia en Firestore Usage (debe bajar visiblemente).');
  console.log('  3. Actualizar Sheet "Presupuesto operacional" pestana A:');
  console.log('     - Columna "Ultima fecha de archivado": ' + new Date().toISOString().split('T')[0]);
  console.log('  4. BORRAR serviceAccountKey.json del repo (seguridad).');
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
