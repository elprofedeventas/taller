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

  // Top mecanicos por OTs cerradas del mes. Acumulan tambien facturacion
  // y margen bruto (cuando esos campos estan persistidos en la OT).
  const mechanicCounts = {};
  for (const ot of closedOTs) {
    if (!ot.mechanicId) continue;
    if (!mechanicCounts[ot.mechanicId]) {
      mechanicCounts[ot.mechanicId] = {
        mechanicId: ot.mechanicId,
        mechanicName: ot.mechanicName || '(sin nombre)',
        count: 0,
        facturado: 0,
        margen: 0
      };
    }
    mechanicCounts[ot.mechanicId].count += 1;
    mechanicCounts[ot.mechanicId].facturado += Number(ot.totalGeneral || 0);
    mechanicCounts[ot.mechanicId].margen += Number(ot.margenBruto || 0);
  }
  const topMechanics = Object.values(mechanicCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Margen bruto agregado del mes: solo suma OTs entregadas con margenBruto
  // persistido (> 0). OTs sin datos de costo se ignoran en este KPI.
  const margenBrutoMes = closedOTs.reduce(
    (s, ot) => s + Number(ot.margenBruto || 0), 0
  );
  const facturadoCerradoMes = closedOTs.reduce(
    (s, ot) => s + Number(ot.totalGeneral || 0), 0
  );
  const margenPorcentajeMes = facturadoCerradoMes > 0
    ? Math.round((margenBrutoMes / facturadoCerradoMes) * 100)
    : 0;
  const otsConMargen = closedOTs.filter(ot => Number(ot.margenBruto || 0) > 0).length;

  // Satisfaccion promedio del mes: promedio de las calificaciones 1-5 que
  // el recepcionista registro en la bandeja Contactar. OTs sin respuesta
  // registrada se ignoran.
  const calificaciones = closedOTs
    .map(ot => Number(ot.encuesta?.calificacion))
    .filter(c => c >= 1 && c <= 5);
  const satisfaccionPromedioMes = calificaciones.length > 0
    ? calificaciones.reduce((s, c) => s + c, 0) / calificaciones.length
    : null;
  const satisfaccionRespuestas = calificaciones.length;

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
    returningClientCount,
    margenBrutoMes,
    margenPorcentajeMes,
    otsConMargen,
    satisfaccionPromedioMes,
    satisfaccionRespuestas
  };
}
