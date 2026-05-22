// services/users.js
// Lectura y actualizacion de usuarios para la UI.
// Las operaciones que tocan PIN (createUser, changeUserPin) viven en
// services/auth.js junto con hashPin/generateSalt.

import { db } from './firestore';
import { withActor } from './auth';
import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, where
} from 'firebase/firestore';

const COLLECTION = 'users';

function usersCollection() {
  return collection(db, COLLECTION);
}

export async function listAllUsers() {
  const snap = await getDocs(usersCollection());
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * Lista mecanicos activos del taller. Filter de active en cliente
 * para evitar composite index. El equipo tipico es 1-8 mecanicos.
 */
export async function listMechanics() {
  const q = query(usersCollection(), where('role', '==', 'mechanic'));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.active !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getUser(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Actualiza campos del usuario. Las reglas Firestore validan:
 *   - owner puede modificar cualquier campo.
 *   - el propio usuario puede modificar su nombre, no role/active/locationId.
 * No actualiza PIN: usar changeUserPin de services/auth.js.
 */
export async function updateUser(session, id, fields) {
  const patch = {};
  if (fields.name !== undefined) patch.name = String(fields.name).trim();
  if (fields.role !== undefined) patch.role = fields.role;
  if (fields.active !== undefined) patch.active = !!fields.active;
  if (fields.locationId !== undefined) patch.locationId = fields.locationId || null;
  if (fields.costoHora !== undefined) patch.costoHora = Number(fields.costoHora) || 0;

  await updateDoc(doc(db, COLLECTION, id), withActor(session, patch));
}
