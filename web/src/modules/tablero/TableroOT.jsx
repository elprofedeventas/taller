// modules/tablero/TableroOT.jsx
// Vista Kanban: columnas por status del flujo (recibido, diagnostico,
// aprobacion, proceso, listo, entregado). Cada tarjeta = una OT con
// placa, vehiculo, cliente, mecanico asignado y tiempo en etapa actual
// (calculado desde statusChangedAt).
//
// Mecanicos solo ven sus OTs (filtro mechanicId en la query JS, mismo
// patron que ColaOT). Recepcionistas/managers/owners ven todo el taller.

import { useMemo } from 'react';
import {
  collection, query, where, orderBy
} from 'firebase/firestore';
import { db } from '../../services/firestore';
import { STATUS_ORDER, STATUS_LABEL } from '../../services/workOrders';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import styles from './TableroOT.module.css';

const COLUMNS = STATUS_ORDER; // recibido -> entregado, sin cancelado

function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
}

function fmtDuration(ms) {
  if (ms == null || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const mm = min % 60;
  if (hr < 24) return mm > 0 ? `${hr}h ${mm}m` : `${hr}h`;
  const d = Math.floor(hr / 24);
  const hh = hr % 24;
  return hh > 0 ? `${d}d ${hh}h` : `${d}d`;
}

function tiempoEnEtapa(ot) {
  const ts = ot.statusChangedAt || ot.openedAt || ot.createdAt;
  const d = tsToDate(ts);
  if (!d) return '—';
  return fmtDuration(Date.now() - d.getTime());
}

export default function TableroOT({ navigate, auth }) {
  const baseQuery = useMemo(() => {
    const mechId = auth.role === 'mechanic' ? auth.userId : null;
    const col = collection(db, 'workOrders');
    if (mechId) {
      return query(
        col,
        where('mechanicId', '==', mechId),
        where('status', 'in', COLUMNS),
        orderBy('createdAt', 'desc')
      );
    }
    return query(
      col,
      where('status', 'in', COLUMNS),
      orderBy('createdAt', 'desc')
    );
  }, [auth.role, auth.userId]);

  const { docs: ots, loading, hasMore, loadMore } = usePaginatedQuery({
    baseQuery,
    pageSize: 100
  });

  // Agrupar por status. Mantiene orden de creacion descendente dentro
  // de cada columna (la query ya viene ordenada por createdAt desc).
  const grupos = useMemo(() => {
    const g = {};
    COLUMNS.forEach(s => { g[s] = []; });
    ots.forEach(ot => {
      if (g[ot.status]) g[ot.status].push(ot);
    });
    return g;
  }, [ots]);

  const totalActivas = COLUMNS
    .filter(s => s !== 'entregado')
    .reduce((acc, s) => acc + grupos[s].length, 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {auth.role === 'mechanic' ? 'Mi tablero' : 'Tablero de OTs'}
        </h1>
        <div className={styles.headerInfo}>
          <span className={styles.counter}>
            {totalActivas} {totalActivas === 1 ? 'activa' : 'activas'}
          </span>
          {hasMore && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? 'Cargando...' : 'Cargar mas'}
            </button>
          )}
        </div>
      </header>

      <div className={styles.tablero}>
        {COLUMNS.map(status => (
          <div key={status} className={styles.columna}>
            <div className={`${styles.colHeader} ${styles['col_' + status]}`}>
              <span className={styles.colTitle}>{STATUS_LABEL[status]}</span>
              <span className={styles.colCount}>{grupos[status].length}</span>
            </div>
            <div className={styles.colBody}>
              {grupos[status].length === 0 ? (
                <p className={styles.empty}>—</p>
              ) : (
                grupos[status].map(ot => (
                  <TarjetaOT
                    key={ot.id}
                    ot={ot}
                    onClick={() => navigate('ot-detail', { id: ot.id })}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TarjetaOT({ ot, onClick }) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.cardTop}>
        <span className={styles.cardPlaca}>{ot.vehiclePlaca}</span>
        <span className={styles.cardTiempo}>{tiempoEnEtapa(ot)}</span>
      </div>
      <div className={styles.cardVehiculo}>
        {ot.vehicleMarca} {ot.vehicleModelo}
      </div>
      <div className={styles.cardCliente}>{ot.clientName}</div>
      {ot.mechanicName && (
        <div className={styles.cardMechanic}>Mec: {ot.mechanicName}</div>
      )}
      {ot.facturaNumero && (
        <div className={styles.cardFactura}>Fact: {ot.facturaNumero}</div>
      )}
    </button>
  );
}
