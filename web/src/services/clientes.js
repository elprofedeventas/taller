// services/clientes.js
// CRUD + busqueda de clientes. Toda escritura pasa por withActor.
// Denorm: clientName/clientPhone se propagan a vehicles al editar
// (Regla 5 del Protocolo).
//
// Busqueda por nombre: array-contains contra nameTokensPrefixes,
// que incluye todos los prefijos de todos los tokens del nombre.
// Permite buscar cualquier palabra (nombre, apellido, intermedia)
// con prefix match. Ej. "Juan Carlos Perez Gonzalez" indexa "j",
// "ju", "jua", "juan", "c", "ca", "car", "carl", "carlos", "p",
// "pe", "per", "pere", "perez", "g", "go", ..., "gonzalez".

import { db } from './firestore';
import { withActor } from './auth';
import { searchByPlaca } from './vehiculos';
import { normalizePhone } from '../utils/normalizePhone';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, writeBatch
} from 'firebase/firestore';

const COLLECTION = 'clients';

function clientsCollection() {
  return collection(db, COLLECTION);
}

/**
 * Calcula los campos denormalizados de busqueda por nombre.
 *   - name: trimmed, tal cual lo ingresa el usuario.
 *   - nameLower: completo en lowercase, reservado para futuras busquedas.
 *   - nameTokens: lista de tokens lowercase, sin duplicados.
 *   - nameTokensPrefixes: todos los prefijos de cada token (sin duplicar).
 */
function buildNameSearchFields(name) {
  const trimmed = (name || '').trim();
  const tokenSet = new Set(
    trimmed.split(/\s+/).filter(Boolean).map(t => t.toLowerCase())
  );
  const tokens = Array.from(tokenSet);
  const prefixSet = new Set();
  for (const t of tokens) {
    for (let i = 1; i <= t.length; i++) {
      prefixSet.add(t.slice(0, i));
    }
  }
  return {
    name: trimmed,
    nameLower: trimmed.toLowerCase(),
    nameTokens: tokens,
    nameTokensPrefixes: Array.from(prefixSet)
  };
}

export async function getClient(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function searchByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];
  const q = query(
    clientsCollection(),
    where('phone', '==', phone),
    limit(5)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Busca clientes cuyo nombre contenga algun token que empiece con
 * el prefix dado. Una sola query usando array-contains.
 */
export async function searchByName(prefix) {
  const lower = (prefix || '').toLowerCase().trim();
  if (!lower) return [];
  const q = query(
    clientsCollection(),
    where('nameTokensPrefixes', 'array-contains', lower),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Busqueda combinada para ClientesList: lanza queries en paralelo
 * (nombre, telefono, placa) y deduplica por clientId.
 */
export async function searchClients(rawQuery) {
  const q = (rawQuery || '').trim();
  if (!q) return [];

  const [byName, byPhone, byPlacaVehicles] = await Promise.all([
    searchByName(q),
    searchByPhone(q),
    searchByPlaca(q)
  ]);

  // Hidrata clientes a partir de placas matcheadas (via clientId de cada vehiculo).
  const placaClientIds = [...new Set(byPlacaVehicles.map(v => v.clientId).filter(Boolean))];
  const byPlacaClients = await Promise.all(placaClientIds.map(id => getClient(id)));

  return dedupById([...byName, ...byPhone, ...byPlacaClients.filter(Boolean)]);
}

function dedupById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function buildClientCreateData(session, { name, phone, email = null }) {
  const nameFields = buildNameSearchFields(name);
  return withActor(session, {
    ...nameFields,
    phone: normalizePhone(phone),
    email: email || null,
    firstVisitAt: serverTimestamp(),
    lastVisitAt: null,
    totalVisits: 0,
    totalSpent: 0,
    createdAt: serverTimestamp(),
    createdBy: session.userId
  });
}

export async function createClient(session, data) {
  const docData = buildClientCreateData(session, data);
  const ref = await addDoc(clientsCollection(), docData);
  return { id: ref.id, ...docData };
}

/**
 * Crea N clientes en batches de hasta 500 (limite Firestore).
 * Cada item del array es { name, phone, email? }.
 */
export async function createClientsBatch(session, clients) {
  const created = [];
  for (let i = 0; i < clients.length; i += 500) {
    const chunk = clients.slice(i, i + 500);
    const batch = writeBatch(db);
    const refs = [];
    for (const c of chunk) {
      const ref = doc(clientsCollection());
      batch.set(ref, buildClientCreateData(session, c));
      refs.push(ref);
    }
    await batch.commit();
    refs.forEach(r => created.push({ id: r.id }));
  }
  return created;
}

export async function updateClient(session, id, { name, phone, email }) {
  const before = await getClient(id);
  if (!before) throw new Error('Cliente no encontrado');

  const nameFields = buildNameSearchFields(name);
  const normalizedPhone = normalizePhone(phone);

  await updateDoc(doc(db, COLLECTION, id), withActor(session, {
    ...nameFields,
    phone: normalizedPhone,
    email: email || null
  }));

  // Propagar denorm si cambio name o phone (Regla 5).
  // Pendiente: propagar tambien a workOrders activas cuando exista
  // modulo OT (ver PENDIENTES.md).
  const nameChanged = before.name !== nameFields.name;
  const phoneChanged = before.phone !== normalizedPhone;
  if (nameChanged || phoneChanged) {
    await propagateClientDenormToVehicles(session, id, {
      clientName: nameFields.name,
      clientPhone: normalizedPhone
    });
  }
}

async function propagateClientDenormToVehicles(session, clientId, denorm) {
  const vehiclesQ = query(
    collection(db, 'vehicles'),
    where('clientId', '==', clientId)
  );
  const snap = await getDocs(vehiclesQ);
  if (snap.empty) return;

  // Batch maximo 500 docs (Protocolo). Un cliente raramente tiene >5 vehiculos.
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(d.ref, withActor(session, denorm));
  });
  await batch.commit();
}
