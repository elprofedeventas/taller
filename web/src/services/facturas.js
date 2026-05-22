// services/facturas.js
// Facturacion electronica SRI Ecuador.
// Flujo: lee config/taller (emisor + certificado .p12), genera
// secuencial atomico, persiste doc en facturas/, llama a la Vercel
// Function /api/facturar, actualiza el doc con el resultado SRI.
//
// Estados del doc en facturas/:
//   PENDIENTE   - se creo el doc pero aun no se envio al SRI.
//   AUTORIZADA  - el SRI la autorizo, tiene claveAcceso + numero.
//   RECHAZADA   - el SRI la devolvio, ver campo errorSRI.

import { db } from './firestore';
import { withActor } from './auth';
import { getTallerConfig } from './config';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit,
  runTransaction, serverTimestamp
} from 'firebase/firestore';

const COLLECTION = 'facturas';

function facturasCollection() {
  return collection(db, COLLECTION);
}

export async function getFactura(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listFacturasByOT(workOrderId, limitN = 5) {
  if (!workOrderId) return [];
  const q = query(
    facturasCollection(),
    where('workOrderId', '==', workOrderId),
    orderBy('createdAt', 'desc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Reserva el siguiente secuencial atomicamente. counters/facturas-EEE-PPP
 * contiene { ultimo: N }. Devuelve el numero como string de 9 digitos.
 */
async function obtenerSecuencial(session, estab, ptoEmi) {
  const ref = doc(db, 'counters', `facturas-${estab}-${ptoEmi}`);
  let num = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    num = snap.exists() ? (snap.data().ultimo || 0) + 1 : 1;
    tx.set(ref, withActor(session, { ultimo: num }), { merge: true });
  });
  return String(num).padStart(9, '0');
}

function validarConfig(config) {
  if (!config) {
    throw new Error('Falta configuracion del taller. Ve a Configuracion.');
  }
  const requiredSRI = ['ruc', 'razonSocial', 'dirMatriz', 'estab', 'ptoEmi'];
  for (const f of requiredSRI) {
    if (!config[f]) {
      throw new Error(`Falta el campo "${f}" en Configuracion del taller.`);
    }
  }
  if (!config.p12Encrypted || !config.p12Password) {
    throw new Error('Falta el certificado digital. Configura el .p12 en Configuracion.');
  }
}

/**
 * Emite una factura electronica SRI:
 *   1. Carga config/taller y valida (datos SRI + certificado).
 *   2. Reserva secuencial atomico.
 *   3. Crea doc PENDIENTE en facturas/.
 *   4. Llama POST /api/facturar (Vercel Function).
 *   5. Actualiza el doc con el resultado.
 *
 * Throws si falta algun dato. Devuelve { id, ...data } al exito.
 */
export async function emitirFactura(session, {
  receptor,
  items,
  formaPago = '01',
  descripcion = '',
  workOrderId = null,
  paymentId = null
}) {
  if (!receptor || !receptor.identificacion || !receptor.razonSocial) {
    throw new Error('Faltan datos del comprador (identificacion + razon social).');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Falta al menos un item para facturar.');
  }

  const config = await getTallerConfig();
  validarConfig(config);

  const secuencial = await obtenerSecuencial(session, config.estab, config.ptoEmi);

  const facturaRef = doc(facturasCollection());
  await setDoc(facturaRef, withActor(session, {
    estado: 'PENDIENTE',
    secuencial,
    estab: config.estab,
    ptoEmi: config.ptoEmi,
    receptor,
    items,
    formaPago,
    descripcion: descripcion || '',
    workOrderId,
    paymentId,
    createdAt: serverTimestamp(),
    createdBy: session.userId
  }));

  const emisorPayload = {
    ruc: config.ruc,
    razonSocial: config.razonSocial,
    nombreComercial: config.nombreComercial || config.razonSocial,
    dirMatriz: config.dirMatriz,
    dirEstablecimiento: config.dirEstablecimiento || config.dirMatriz,
    estab: config.estab,
    ptoEmi: config.ptoEmi,
    obligadoContabilidad: config.obligadoContabilidad || 'NO'
  };

  let data;
  try {
    // infoAdicional para el SRI: solo Descripcion si el usuario la cargo.
    // NO se envia email (decision del producto).
    const infoAdicional = [];
    if (descripcion && descripcion.trim()) {
      infoAdicional.push({ nombre: 'Descripcion', valor: descripcion.trim() });
    }

    const res = await fetch('/api/facturar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'facturar',
        emisor: emisorPayload,
        receptor,
        items,
        secuencial,
        formaPago,
        infoAdicional,
        p12Encrypted: config.p12Encrypted,
        p12Password: config.p12Password
      })
    });

    // Detecta respuestas no-JSON antes de res.json() para dar un mensaje util.
    // Caso comun: npm run dev (Vite) no sirve Vercel Functions y el SPA
    // fallback devuelve HTML; res.json() explota con "Unexpected end of JSON".
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      const raw = await res.text().catch(() => '');
      const esLocal = typeof window !== 'undefined' && /^localhost|^127\./.test(window.location.hostname);
      const hint = esLocal
        ? ' En localhost, las Vercel Functions no corren con "npm run dev". Usa "vercel dev" desde web/.'
        : '';
      throw new Error(
        `/api/facturar no respondio JSON (status ${res.status}).${hint} ` +
        `Respuesta: ${raw.slice(0, 200)}`
      );
    }

    data = await res.json();

    if (!res.ok || !data.ok) {
      const errorSRI = {
        error: data?.error || 'Error desconocido',
        estado: data?.estado || null,
        mensajes: Array.isArray(data?.mensajes) ? data.mensajes : [],
        detalle: data?.detalle || null,
        detalleRaw: data?.detalleRaw || null
      };
      await updateDoc(facturaRef, withActor(session, {
        estado: 'RECHAZADA',
        errorSRI
      }));
      const err = new Error(data?.error || 'El SRI rechazo el comprobante.');
      err.mensajes = errorSRI.mensajes;
      err.detalle = errorSRI.detalle;
      err.estado = errorSRI.estado;
      throw err;
    }
  } catch (e) {
    // Si fetch fallo (red, timeout), dejamos el doc en PENDIENTE.
    if (!data) {
      await updateDoc(facturaRef, withActor(session, {
        estado: 'PENDIENTE',
        errorSRI: 'Sin respuesta de /api/facturar: ' + e.message
      }));
    }
    throw e;
  }

  await updateDoc(facturaRef, withActor(session, {
    estado: 'AUTORIZADA',
    claveAcceso: data.claveAcceso,
    numeroAutorizacion: data.numeroAutorizacion,
    fechaAutorizacion: data.fechaAutorizacion,
    fechaEmision: data.fechaEmision,
    numeroFactura: data.numeroFactura,
    totales: data.totales,
    xmlFirmado: data.xmlFirmado,
    autorizadoEn: serverTimestamp()
  }));

  return { id: facturaRef.id, ...data };
}
