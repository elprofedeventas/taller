// services/panel.js
// Calcula los 4 KPIs del Panel del dueno para un mes dado:
//   1. Ingresos del mes (suma payments.monto donde paidAt in mes).
//   2. OTs activas (count workOrders donde status in ACTIVE_STATUSES).
//   3. Top mecanicos productivos (workOrders entregado con closedAt in mes).
//   4. Clientes recurrentes vs nuevos (de los clientIds del mes,
//      cuantos tienen firstVisitAt antes del mes vs en el mes).

import { db } from './firestore';
import { getClient } from './clientes';
import {
  collection, getDocs, query, where, orderBy, Timestamp
} from 'firebase/firestore';

const ACTIVE_STATUSES = ['recibido', 'diagnostico', 'aprobacion', 'proceso', 'listo'];

export function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthRange(year, month) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start, end };
}

/**
 * Carga los 4 KPIs del Panel para un mes especifico.
 * Dispara 3 queries Firestore en paralelo + N getClient (1 por
 * cliente unico del mes). Costo tipico: ~80-300 reads por carga.
 */
export async function loadPanelKPIs({ year, month }) {
  const { start, end } = monthRange(year, month);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const paymentsQ = query(
    collection(db, 'payments'),
    where('paidAt', '>=', startTs),
    where('paidAt', '<', endTs),
    orderBy('paidAt', 'desc')
  );
  const activeOTsQ = query(
    collection(db, 'workOrders'),
    where('status', 'in', ACTIVE_STATUSES)
  );
  const closedOTsQ = query(
    collection(db, 'workOrders'),
    where('status', '==', 'entregado'),
    where('closedAt', '>=', startTs),
    where('closedAt', '<', endTs)
  );

  const [paymentsSnap, activeSnap, closedSnap] = await Promise.all([
    getDocs(paymentsQ),
    getDocs(activeOTsQ),
    getDocs(closedOTsQ)
  ]);

  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const totalRevenue = payments.reduce((s, p) => s + Number(p.monto || 0), 0);

  const activeCount = activeSnap.size;

  const closedOTs = closedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const closedCount = closedOTs.length;

  // Top mecanicos por OTs cerradas del mes
  const mechanicCounts = {};
  for (const ot of closedOTs) {
    if (!ot.mechanicId) continue;
    if (!mechanicCounts[ot.mechanicId]) {
      mechanicCounts[ot.mechanicId] = {
        mechanicId: ot.mechanicId,
        mechanicName: ot.mechanicName || '(sin nombre)',
        count: 0
      };
    }
    mechanicCounts[ot.mechanicId].count += 1;
  }
  const topMechanics = Object.values(mechanicCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Clientes recurrentes vs nuevos del mes
  const uniqueClientIds = [...new Set(closedOTs.map(o => o.clientId).filter(Boolean))];
  const clientResults = await Promise.all(uniqueClientIds.map(id => getClient(id)));

  let newClientCount = 0;
  let returningClientCount = 0;
  for (const c of clientResults) {
    if (!c) continue;
    const fv = c.firstVisitAt;
    if (fv && typeof fv.toDate === 'function') {
      const fvDate = fv.toDate();
      if (fvDate >= start) newClientCount += 1;
      else returningClientCount += 1;
    } else {
      newClientCount += 1;
    }
  }

  return {
    period: { year, month },
    totalRevenue,
    paymentsCount: payments.length,
    activeCount,
    closedCount,
    topMechanics,
    newClientCount,
    returningClientCount
  };
}
