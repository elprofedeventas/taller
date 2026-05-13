// services/payments.js
// Cobro atomico: crea payment + actualiza OT + incrementa contadores
// en cliente. Todo en un writeBatch para atomicidad.
//
// Reglas Firestore validan que el rol tenga permiso de create payment
// y update workOrders/clients. Recepcionista/manager/owner pueden.

import { db } from './firestore';
import { withActor } from './auth';
import { getOT } from './workOrders';
import {
  collection, doc, getDoc,
  writeBatch, increment, serverTimestamp
} from 'firebase/firestore';

const COLLECTION = 'payments';
const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta'];

export async function getPayment(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Crea el cobro de una OT en status 'listo':
 *   1. Crea doc en payments.
 *   2. Update workOrders: status='entregado', closedAt=serverTimestamp.
 *   3. Update clients: totalVisits+1, totalSpent+monto, lastVisitAt.
 * Re-lee la OT antes del batch para evitar race con otro cajero que
 * ya haya cobrado entre el load y el commit.
 */
export async function createPayment(session, { ot, monto, formaPago }) {
  const m = Number(monto);
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error('Monto invalido. Debe ser mayor a 0.');
  }
  if (!FORMAS_PAGO.includes(formaPago)) {
    throw new Error('Forma de pago invalida.');
  }

  // Re-validar status server-side para evitar doble cobro.
  const fresh = await getOT(ot.id);
  if (!fresh) {
    throw new Error('OT no encontrada.');
  }
  if (fresh.status !== 'listo') {
    throw new Error('La OT ya no esta en estado "Listo". Refresca y vuelve a intentar.');
  }

  const batch = writeBatch(db);

  const paymentRef = doc(collection(db, COLLECTION));
  batch.set(paymentRef, withActor(session, {
    workOrderId: ot.id,
    monto: m,
    formaPago,
    paidAt: serverTimestamp(),
    receivedBy: session.userId,
    receivedByName: session.name,
    clientName: ot.clientName,
    vehiclePlaca: ot.vehiclePlaca
  }));

  const otRef = doc(db, 'workOrders', ot.id);
  batch.update(otRef, withActor(session, {
    status: 'entregado',
    closedAt: serverTimestamp()
  }));

  const clientRef = doc(db, 'clients', ot.clientId);
  batch.update(clientRef, withActor(session, {
    totalVisits: increment(1),
    totalSpent: increment(m),
    lastVisitAt: serverTimestamp()
  }));

  await batch.commit();
  return { id: paymentRef.id };
}
