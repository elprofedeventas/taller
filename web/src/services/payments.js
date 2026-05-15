// services/payments.js
// Cobro atomico: crea payment + actualiza OT + incrementa contadores
// en cliente. Todo en runTransaction para garantizar atomicidad y
// prevenir doble cobro si dos cajeros confirman simultaneamente.
//
// Reglas Firestore validan que el rol tenga permiso de create payment
// y update workOrders/clients. Recepcionista/manager/owner pueden.

import { db } from './firestore';
import { withActor } from './auth';
import {
  collection, doc, getDoc,
  runTransaction, increment, serverTimestamp
} from 'firebase/firestore';

const COLLECTION = 'payments';
const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta'];

export async function getPayment(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Crea el cobro de una OT en status 'listo' usando runTransaction:
 *   1. Lee el workOrder DENTRO de la transaccion.
 *   2. Verifica que status === 'listo' (aborta si no).
 *   3. Crea doc en payments.
 *   4. Update workOrders: status='entregado', closedAt=serverTimestamp.
 *   5. Update clients: totalVisits+1, totalSpent+monto, lastVisitAt.
 *
 * Si entre la lectura y el commit otro cajero ya cobro la misma OT,
 * Firestore reintentara la transaccion; en el segundo intento leera
 * status='entregado' y abortara con error explicito.
 */
export async function createPayment(session, { ot, monto, formaPago }) {
  const m = Number(monto);
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error('Monto invalido. Debe ser mayor a 0.');
  }
  if (!FORMAS_PAGO.includes(formaPago)) {
    throw new Error('Forma de pago invalida.');
  }

  const otRef = doc(db, 'workOrders', ot.id);
  const clientRef = doc(db, 'clients', ot.clientId);
  const paymentRef = doc(collection(db, COLLECTION));

  await runTransaction(db, async (transaction) => {
    const fresh = await transaction.get(otRef);
    if (!fresh.exists()) {
      throw new Error('OT no encontrada.');
    }
    const data = fresh.data();
    if (data.status !== 'listo') {
      throw new Error(
        `La OT ya no esta en estado "Listo" (actual: ${data.status}). ` +
        'Refresca la pantalla.'
      );
    }

    transaction.set(paymentRef, withActor(session, {
      workOrderId: ot.id,
      monto: m,
      formaPago,
      paidAt: serverTimestamp(),
      receivedBy: session.userId,
      receivedByName: session.name,
      clientName: ot.clientName,
      vehiclePlaca: ot.vehiclePlaca
    }));

    transaction.update(otRef, withActor(session, {
      status: 'entregado',
      closedAt: serverTimestamp()
    }));

    transaction.update(clientRef, withActor(session, {
      totalVisits: increment(1),
      totalSpent: increment(m),
      lastVisitAt: serverTimestamp()
    }));
  });

  return { id: paymentRef.id };
}
