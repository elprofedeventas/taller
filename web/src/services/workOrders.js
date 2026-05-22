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
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
  runTransaction, Timestamp
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

/**
 * Reserva el siguiente numero correlativo de OT para el anio actual usando
 * un counter atomico (counters/workOrders-{anio}). Devuelve el formato
 * legible "OT-2026-0000001" y el secuencial entero.
 */
async function obtenerSiguienteNumeroOT(session) {
  const anio = new Date().getFullYear();
  const counterRef = doc(db, 'counters', `workOrders-${anio}`);
  let num = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    num = snap.exists() ? (snap.data().ultimo || 0) + 1 : 1;
    tx.set(counterRef, withActor(session, { ultimo: num }), { merge: true });
  });
  return {
    secuencial: num,
    numero: `OT-${anio}-${String(num).padStart(7, '0')}`
  };
}

export async function createOT(session, {
  clientId, clientName, clientPhone,
  clientIdentificacion = '', clientTipoId = '05',
  clientEmail = '', clientDireccion = '',
  vehicleId, vehiclePlaca, vehicleMarca, vehicleModelo,
  problema
}) {
  // statusHistory: dentro de arrays Firestore NO acepta serverTimestamp(),
  // usar Timestamp.now() client-side. El statusChangedAt top-level si usa
  // serverTimestamp() para mantener consistencia con el reloj del servidor.
  const initialHistoryEntry = {
    status: 'recibido',
    at: Timestamp.now(),
    by: session.userId,
    byName: session.userName || session.name || ''
  };
  const { secuencial, numero } = await obtenerSiguienteNumeroOT(session);
  const data = withActor(session, {
    numeroOT: numero,
    secuencialOT: secuencial,
    status: 'recibido',
    statusChangedAt: serverTimestamp(),
    statusHistory: [initialHistoryEntry],
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
    clientIdentificacion,
    clientTipoId,
    clientEmail,
    clientDireccion,
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
 * Cambia el status de una OT en transaccion atomica:
 *   - Setea status nuevo + statusChangedAt = serverTimestamp().
 *   - Appendea a statusHistory un nuevo entry {status, at, by, byName}.
 *   - Si el nuevo status es terminal (entregado/cancelado), setea closedAt.
 * Idempotente: si la OT ya esta en ese status, no hace nada.
 *
 * Usar este helper en lugar de updateOT({status: ...}) para que el historial
 * quede registrado y el tablero Kanban pueda calcular tiempo por etapa.
 */
export async function changeOTStatus(session, otId, newStatus) {
  const ref = doc(db, COLLECTION, otId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('OT no encontrada');
    const current = snap.data();
    if (current.status === newStatus) return;

    const entry = {
      status: newStatus,
      at: Timestamp.now(),
      by: session.userId,
      byName: session.userName || session.name || ''
    };

    const patch = withActor(session, {
      status: newStatus,
      statusChangedAt: serverTimestamp(),
      statusHistory: [...(current.statusHistory || []), entry]
    });

    if (newStatus === 'entregado' || newStatus === 'cancelado') {
      patch.closedAt = serverTimestamp();
    }

    tx.update(ref, patch);
  });
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
 * Lista las ultimas N OTs de un cliente (todas, no solo activas).
 * Usado en ClienteDetail para mostrar historial.
 */
export async function listOTsByClient(clientId, limitN = 10) {
  if (!clientId) return [];
  const q = query(
    workOrdersCollection(),
    where('clientId', '==', clientId),
    orderBy('createdAt', 'desc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Lista las ultimas N OTs de un vehiculo (todas, no solo activas).
 * Usado en VehiculoDetail para mostrar historial.
 */
export async function listOTsByVehicle(vehicleId, limitN = 10) {
  if (!vehicleId) return [];
  const q = query(
    workOrdersCollection(),
    where('vehicleId', '==', vehicleId),
    orderBy('createdAt', 'desc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
