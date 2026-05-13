// services/workOrders.js
// CRUD de ordenes de trabajo (OT). Toda escritura pasa por withActor.
// Denorm Regla 1: clientName/clientPhone/vehiclePlaca/vehicleMarca/
// vehicleModelo se copian al crear y deben mantenerse sincronizadas
// al editar cliente/vehiculo (ver PENDIENTES.md).
//
// V1: la OT se crea en status 'recibido'. Cambios de status se hacen
// en OTDetail. El paso 'listo' -> 'entregado' lo hace modulo Caja
// junto al registro del payment.
//
// ID del doc: auto Firestore. Numeracion legible OT-YYYY-MM-NNN se
// difiere a V2 (ver PENDIENTES.md).
//
// TOTALES FINANCIEROS (totalLabor, totalParts, totalGeneral):
// las reglas Firestore impiden que mechanic y recepcionista los
// modifiquen. La UI calcula los totales runtime desde tasks/parts
// con calculateTotals; el doc solo se actualiza cuando manager/owner
// (o el flujo de Caja) los persiste. Ver decision D.O.NEW.

import { db } from './firestore';
import { withActor } from './auth';
import {
  collection, doc, getDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';

const COLLECTION = 'workOrders';
const ACTIVE_STATUSES = ['recibido', 'diagnostico', 'aprobacion', 'proceso', 'listo'];

export const STATUS_ORDER = ['recibido', 'diagnostico', 'aprobacion', 'proceso', 'listo', 'entregado'];

export const STATUS_LABEL = {
  recibido: 'Recibido',
  diagnostico: 'Diagnostico',
  aprobacion: 'Aprobacion',
  proceso: 'Proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

function workOrdersCollection() {
  return collection(db, COLLECTION);
}

export async function getOT(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createOT(session, {
  clientId, clientName, clientPhone,
  vehicleId, vehiclePlaca, vehicleMarca, vehicleModelo,
  problema
}) {
  const data = withActor(session, {
    status: 'recibido',
    openedAt: serverTimestamp(),
    closedAt: null,
    problema: (problema || '').trim(),
    tasks: [],
    parts: [],
    totalLabor: 0,
    totalParts: 0,
    totalGeneral: 0,
    clientId,
    clientName,
    clientPhone,
    vehicleId,
    vehiclePlaca,
    vehicleMarca,
    vehicleModelo,
    mechanicId: null,
    mechanicName: null,
    photoUrls: [],
    createdAt: serverTimestamp(),
    createdBy: session.userId
  });
  const ref = await addDoc(workOrdersCollection(), data);
  return { id: ref.id, ...data };
}

/**
 * Update parcial. El cliente compone el patch segun lo que cambia
 * y segun lo que el rol puede tocar (ver reglas Firestore).
 */
export async function updateOT(session, id, patch) {
  await updateDoc(doc(db, COLLECTION, id), withActor(session, patch));
}

/**
 * Query base para ColaOT.
 *   - Sin mechanicId: trae todas las activas.
 *   - Con mechanicId: filtra por mecanico asignado (rol mechanic).
 * El filtro de status != entregado y != cancelado se hace con
 * where('status', 'in', ACTIVE_STATUSES).
 */
export function activeOTsQuery({ mechanicId } = {}) {
  if (mechanicId) {
    return query(
      workOrdersCollection(),
      where('mechanicId', '==', mechanicId),
      where('status', 'in', ACTIVE_STATUSES),
      orderBy('createdAt', 'desc')
    );
  }
  return query(
    workOrdersCollection(),
    where('status', 'in', ACTIVE_STATUSES),
    orderBy('createdAt', 'desc')
  );
}

/**
 * Query base para CajaList: OTs en status 'listo' (esperando cobro).
 * Reutiliza el indice composite [status, createdAt].
 */
export function readyForCobroQuery() {
  return query(
    workOrdersCollection(),
    where('status', '==', 'listo'),
    orderBy('createdAt', 'desc')
  );
}

/**
 * Calcula totalLabor, totalParts y totalGeneral desde las listas
 * tasks y parts. Cada item espera la propiedad numerica .total.
 */
export function calculateTotals(tasks, parts) {
  const totalLabor = (tasks || []).reduce((s, t) => s + Number(t.total || 0), 0);
  const totalParts = (parts || []).reduce((s, p) => s + Number(p.total || 0), 0);
  return {
    totalLabor: round2(totalLabor),
    totalParts: round2(totalParts),
    totalGeneral: round2(totalLabor + totalParts)
  };
}

export function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Devuelve el siguiente status en la secuencia, o null si no hay.
 * 'listo' -> null porque 'entregado' lo dispara modulo Caja.
 */
export function nextStatus(current) {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx < 0 || idx >= STATUS_ORDER.length - 2) return null;
  return STATUS_ORDER[idx + 1];
}
