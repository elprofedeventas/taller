// services/config.js
// Configuracion global del taller en config/taller.
//   Campos basicos: name, address, phone.
//   Campos SRI (opcionales, solo si emite factura electronica):
//     ruc, razonSocial, nombreComercial, dirMatriz, dirEstablecimiento,
//     estab, ptoEmi, obligadoContabilidad.
//   Campos del certificado .p12 (gestionados aparte por setTallerCertificate):
//     p12Encrypted, p12Password, p12Nombre, p12FechaExpiracion, p12ConfiguradoEn.
//
// Read libre (rules lo permiten). Write solo owner.

import { db } from './firestore';
import { withActor } from './auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const TALLER_DOC_PATH = ['config', 'taller'];

function tallerDocRef() {
  return doc(db, ...TALLER_DOC_PATH);
}

export async function getTallerConfig() {
  const snap = await getDoc(tallerDocRef());
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  return null;
}

// Campos editables desde la pantalla Configuracion (no incluye los del certificado).
const EDITABLE_FIELDS = [
  'name', 'address', 'phone',
  'ruc', 'razonSocial', 'nombreComercial',
  'dirMatriz', 'dirEstablecimiento',
  'estab', 'ptoEmi',
  'obligadoContabilidad'
];

export async function setTallerConfig(session, fields) {
  if (session.role !== 'owner') {
    throw new Error('Solo el owner puede editar la configuracion del taller');
  }

  const data = {};
  for (const key of EDITABLE_FIELDS) {
    if (fields[key] !== undefined) {
      data[key] = String(fields[key] || '').trim();
    }
  }

  await setDoc(tallerDocRef(), withActor(session, data), { merge: true });
}

/**
 * Actualiza los campos del certificado .p12. Solo el owner.
 * Se invoca desde SeccionCertificado tras encriptar el .p12.
 */
export async function setTallerCertificate(session, {
  p12Encrypted,
  p12Password,
  p12Nombre,
  p12FechaExpiracion
}) {
  if (session.role !== 'owner') {
    throw new Error('Solo el owner puede editar el certificado');
  }

  const data = withActor(session, {
    p12Encrypted: p12Encrypted || null,
    p12Password: p12Password || null,
    p12Nombre: p12Nombre || null,
    p12FechaExpiracion: p12FechaExpiracion || null,
    p12ConfiguradoEn: serverTimestamp()
  });

  await setDoc(tallerDocRef(), data, { merge: true });
}
