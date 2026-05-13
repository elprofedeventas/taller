// services/config.js
// Configuracion global del taller en config/taller (name, address, phone).
// Read libre (rules lo permiten). Write solo owner.

import { db } from './firestore';
import { withActor } from './auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

export async function setTallerConfig(session, { name, address, phone }) {
  if (session.role !== 'owner') {
    throw new Error('Solo el owner puede editar la configuracion del taller');
  }
  const data = withActor(session, {
    name: (name || '').trim(),
    address: (address || '').trim(),
    phone: (phone || '').trim()
  });
  await setDoc(tallerDocRef(), data, { merge: true });
}
