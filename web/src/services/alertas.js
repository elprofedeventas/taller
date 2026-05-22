// services/alertas.js
// Calcula alertas proactivas para el Panel del dueno. Una sola pasada de
// queries Firestore en paralelo (~80-100 reads). Devuelve un array de
// alertas {tipo, mensaje, prioridad, accion?, otId?, clientId?}.
//
// Prioridad:
//   alta  - bloquea operacion o impacto inmediato (rojo)
//   media - capacidad ociosa / oportunidad cercana (amarillo)
//   baja  - oportunidad comercial (gris)

import { db } from './firestore';
import { getTallerConfig } from './config';
import {
  collection, getDocs, query, where, orderBy, limit, Timestamp
} from 'firebase/firestore';

const ACTIVE_STATUSES = ['recibido', 'diagnostico', 'aprobacion', 'proceso', 'listo'];
const HORAS_ESTANCADA = 48;
const DIAS_CLIENTE_INACTIVO = 120;
const MIN_VISITAS_CLIENTE_FRECUENTE = 3;
const MIN_OTS_PENDIENTES_COBRO = 3;
const DIAS_CERTIFICADO_VENCE = 30;

function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
}

function horasDesde(date) {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function diasDesde(date) {
  return horasDesde(date) / 24;
}

const STATUS_LABEL = {
  recibido: 'Recibido',
  diagnostico: 'Diagnostico',
  aprobacion: 'Aprobacion',
  proceso: 'Proceso',
  listo: 'Listo'
};

export async function calcularAlertas() {
  const ahora = new Date();
  const hoyMas7d = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
  const inactivoCutoff = new Date(ahora.getTime() - DIAS_CLIENTE_INACTIVO * 24 * 60 * 60 * 1000);
  const certCutoff = new Date(ahora.getTime() + DIAS_CERTIFICADO_VENCE * 24 * 60 * 60 * 1000);

  // Queries en paralelo
  const [activeSnap, mechsSnap, clientesSnap, recordSnap, config] = await Promise.all([
    getDocs(query(
      collection(db, 'workOrders'),
      where('status', 'in', ACTIVE_STATUSES)
    )),
    getDocs(query(
      collection(db, 'users'),
      where('role', '==', 'mechanic')
    )),
    getDocs(query(
      collection(db, 'clients'),
      where('totalVisits', '>=', MIN_VISITAS_CLIENTE_FRECUENTE),
      orderBy('totalVisits', 'desc'),
      limit(100)
    )).catch(() => ({ docs: [] })),
    getDocs(query(
      collection(db, 'workOrders'),
      where('proximoMantenimiento.recordatorioEnviado', '==', false),
      where('proximoMantenimiento.fechaEstimada', '<=', Timestamp.fromDate(hoyMas7d))
    )).catch(() => ({ docs: [] })),
    getTallerConfig().catch(() => null)
  ]);

  const activeOTs = activeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const mechs = mechsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.active !== false);
  const clientesFrecuentes = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const alertas = [];

  // === A: OTs estancadas > 48h en su etapa actual ===
  for (const ot of activeOTs) {
    const cambiadoEn = tsToDate(ot.statusChangedAt) || tsToDate(ot.openedAt);
    const h = horasDesde(cambiadoEn);
    if (h >= HORAS_ESTANCADA) {
      const dias = Math.floor(h / 24);
      const label = STATUS_LABEL[ot.status] || ot.status;
      alertas.push({
        tipo: 'ot_estancada',
        prioridad: 'alta',
        mensaje: `OT ${ot.numeroOT || ot.vehiclePlaca} lleva ${dias} dia${dias === 1 ? '' : 's'} en ${label}`,
        otId: ot.id
      });
    }
  }

  // === B: Mecanicos sin OTs asignadas ===
  const otsPorMecanico = {};
  for (const ot of activeOTs) {
    if (!ot.mechanicId) continue;
    otsPorMecanico[ot.mechanicId] = (otsPorMecanico[ot.mechanicId] || 0) + 1;
  }
  for (const m of mechs) {
    if (!otsPorMecanico[m.id]) {
      alertas.push({
        tipo: 'mecanico_libre',
        prioridad: 'media',
        mensaje: `${m.name} no tiene OTs asignadas`
      });
    }
  }

  // === C: Clientes frecuentes que no vuelven hace mas de N dias ===
  for (const c of clientesFrecuentes) {
    const ultimaVisita = tsToDate(c.lastVisitAt);
    if (!ultimaVisita) continue; // sin datos, no alertamos
    if (ultimaVisita < inactivoCutoff) {
      const d = Math.floor(diasDesde(ultimaVisita));
      const meses = Math.floor(d / 30);
      alertas.push({
        tipo: 'cliente_inactivo',
        prioridad: 'baja',
        mensaje: `${c.name} (${c.totalVisits} visitas) no viene hace ${meses} mes${meses === 1 ? '' : 'es'}`,
        clientId: c.id
      });
    }
  }

  // === D: OTs listas sin cobrar ===
  const otsListas = activeOTs.filter(o => o.status === 'listo');
  if (otsListas.length >= MIN_OTS_PENDIENTES_COBRO) {
    alertas.push({
      tipo: 'pendientes_cobro',
      prioridad: 'media',
      mensaje: `${otsListas.length} OTs listas sin cobrar`
    });
  }

  // === E: Certificado .p12 proximo a vencer ===
  if (config?.p12FechaExpiracion) {
    const fexp = tsToDate(config.p12FechaExpiracion) || new Date(config.p12FechaExpiracion);
    if (fexp && fexp.getTime() <= certCutoff.getTime()) {
      const dias = Math.max(0, Math.floor((fexp.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24)));
      const vencido = fexp.getTime() < ahora.getTime();
      alertas.push({
        tipo: 'certificado',
        prioridad: 'alta',
        mensaje: vencido
          ? `Certificado SRI VENCIDO desde el ${fexp.toLocaleDateString('es-EC')}`
          : `Certificado SRI vence en ${dias} dia${dias === 1 ? '' : 's'}`
      });
    }
  }

  // === F: Recordatorios de mantenimiento pendientes ===
  const recordCount = recordSnap.docs.length;
  if (recordCount > 0) {
    alertas.push({
      tipo: 'recordatorios',
      prioridad: 'media',
      mensaje: `${recordCount} cliente${recordCount === 1 ? '' : 's'} pendiente${recordCount === 1 ? '' : 's'} de contactar por mantenimiento`
    });
  }

  // Ordenar por prioridad: alta -> media -> baja
  const prioOrden = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => prioOrden[a.prioridad] - prioOrden[b.prioridad]);

  return alertas;
}
