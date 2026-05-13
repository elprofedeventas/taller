// services/vehiculos.js
// CRUD + busqueda de vehiculos. Toda escritura pasa por withActor.
// Denorm Regla 1: clientName y clientPhone vienen del cliente y
// se copian aqui para evitar lectura adicional en cola/listas.

import { db } from './firestore';
import { withActor } from './auth';
import { normalizePlaca } from '../utils/normalizePlaca';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, writeBatch
} from 'firebase/firestore';

const COLLECTION = 'vehicles';

function vehiclesCollection() {
  return collection(db, COLLECTION);
}

export async function getVehicle(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listVehiclesByClient(clientId) {
  const q = query(
    vehiclesCollection(),
    where('clientId', '==', clientId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function searchByPlaca(rawPlaca) {
  const placa = normalizePlaca(rawPlaca);
  if (!placa) return [];
  const q = query(
    vehiclesCollection(),
    where('placa', '==', placa),
    limit(5)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function buildVehicleCreateData(session, {
  clientId, clientName, clientPhone,
  placa, marca, modelo,
  year = null, color = null, lastKm = null
}) {
  return withActor(session, {
    placa: normalizePlaca(placa),
    marca: marca.trim(),
    modelo: modelo.trim(),
    year: year ? Number(year) : null,
    color: color ? String(color).trim() : null,
    lastKm: lastKm !== null && lastKm !== '' ? Number(lastKm) : null,
    clientId,
    clientName,
    clientPhone,
    createdAt: serverTimestamp(),
    createdBy: session.userId
  });
}

export async function createVehicle(session, data) {
  const docData = buildVehicleCreateData(session, data);
  const ref = await addDoc(vehiclesCollection(), docData);
  return { id: ref.id, ...docData };
}

/**
 * Crea N vehiculos en batches de hasta 500 (limite Firestore).
 * Cada item del array es { clientId, clientName, clientPhone, placa, ... }.
 */
export async function createVehiclesBatch(session, vehicles) {
  const created = [];
  for (let i = 0; i < vehicles.length; i += 500) {
    const chunk = vehicles.slice(i, i + 500);
    const batch = writeBatch(db);
    const refs = [];
    for (const v of chunk) {
      const ref = doc(vehiclesCollection());
      batch.set(ref, buildVehicleCreateData(session, v));
      refs.push(ref);
    }
    await batch.commit();
    refs.forEach(r => created.push({ id: r.id }));
  }
  return created;
}

export async function updateVehicle(session, id, fields) {
  const update = {};
  if (fields.placa !== undefined) update.placa = normalizePlaca(fields.placa);
  if (fields.marca !== undefined) update.marca = String(fields.marca).trim();
  if (fields.modelo !== undefined) update.modelo = String(fields.modelo).trim();
  if (fields.year !== undefined) update.year = fields.year ? Number(fields.year) : null;
  if (fields.color !== undefined) update.color = fields.color ? String(fields.color).trim() : null;
  if (fields.lastKm !== undefined) {
    update.lastKm = fields.lastKm !== null && fields.lastKm !== '' ? Number(fields.lastKm) : null;
  }
  await updateDoc(doc(db, COLLECTION, id), withActor(session, update));
}
