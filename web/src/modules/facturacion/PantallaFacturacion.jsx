import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firestore';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { getFactura } from '../../services/facturas';
import { getTallerConfig } from '../../services/config';
import BotonFacturar from './BotonFacturar';
import RideFactura from './RideFactura';
import styles from './PantallaFacturacion.module.css';

const ESTADO_LABEL = {
  AUTORIZADA: 'Autorizada',
  RECHAZADA: 'Rechazada',
  PENDIENTE: 'Pendiente'
};

function fmtDate(ts) {
  if (!ts) return '-';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(val) {
  return `$${parseFloat(val || 0).toFixed(2)}`;
}

export default function PantallaFacturacion({ navigate, auth, autoOpenFacturaId = null }) {
  const [emisor, setEmisor] = useState(null);
  const [emisorErr, setEmisorErr] = useState(null);

  const [verFacturaId, setVerFacturaId] = useState(autoOpenFacturaId);
  const [facturaDetalle, setFacturaDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const baseQuery = useMemo(
    () => query(collection(db, 'facturas'), orderBy('createdAt', 'desc')),
    []
  );

  const { docs: facturas, loading, hasMore, loadMore } = usePaginatedQuery({
    baseQuery,
    pageSize: 20
  });

  useEffect(() => {
    let cancelled = false;
    getTallerConfig().then(c => {
      if (cancelled) return;
      if (!c) {
        setEmisorErr('No hay configuracion del taller. Ve a Configuracion para llenar los datos SRI.');
      } else if (!c.ruc) {
        setEmisorErr('Faltan datos SRI del taller (RUC). Ve a Configuracion.');
      } else {
        setEmisor(c);
      }
    }).catch(e => {
      if (!cancelled) setEmisorErr(e.message);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!verFacturaId) {
      setFacturaDetalle(null);
      return;
    }
    let cancelled = false;
    setCargandoDetalle(true);
    getFactura(verFacturaId).then(f => {
      if (!cancelled) setFacturaDetalle(f);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setCargandoDetalle(false);
    });
    return () => { cancelled = true; };
  }, [verFacturaId]);

  if (auth.role === 'mechanic') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Facturacion electronica</h1>
        {emisor && (
          <BotonFacturar
            auth={auth}
            label="Nueva factura"
            variant="primary"
          />
        )}
      </header>

      {emisorErr && (
        <div className={styles.errorBox}>
          {emisorErr}
        </div>
      )}

      {facturas.length === 0 && !loading ? (
        <p className={styles.empty}>No hay facturas emitidas todavia.</p>
      ) : (
        <ul className={styles.list}>
          {facturas.map(f => (
            <li
              key={f.id}
              className={styles.item}
              role="button"
              tabIndex={0}
              onClick={() => setVerFacturaId(f.id)}
              onKeyDown={e => { if (e.key === 'Enter') setVerFacturaId(f.id); }}
            >
              <div className={styles.itemMain}>
                <span className={styles.itemNumero}>
                  {f.numeroFactura || `${f.estab}-${f.ptoEmi}-${f.secuencial}`}
                </span>
                <span className={styles.itemMeta}>
                  {fmtDate(f.createdAt)}
                </span>
                <span className={styles.itemMeta}>
                  {f.receptor?.razonSocial || '-'}
                </span>
              </div>
              <div className={styles.itemRight}>
                <span className={`${styles.estado} ${styles[`estado_${f.estado}`]}`}>
                  {ESTADO_LABEL[f.estado] || f.estado}
                </span>
                {f.totales?.total && (
                  <span className={styles.itemTotal}>{fmtMoney(f.totales.total)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

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

      {verFacturaId && (
        <div className={styles.overlay} onClick={() => setVerFacturaId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Detalle de factura</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setVerFacturaId(null)}
                aria-label="Cerrar"
              >
                &times;
              </button>
            </header>
            <div className={styles.modalBody}>
              {cargandoDetalle && <p>Cargando...</p>}
              {!cargandoDetalle && facturaDetalle && facturaDetalle.estado === 'AUTORIZADA' && emisor && (
                <RideFactura factura={facturaDetalle} emisor={emisor} />
              )}
              {!cargandoDetalle && facturaDetalle && facturaDetalle.estado !== 'AUTORIZADA' && (
                <div className={styles.rechazadaBox}>
                  <p><strong>Estado: {facturaDetalle.estado}</strong></p>
                  {facturaDetalle.errorSRI && typeof facturaDetalle.errorSRI === 'object' && (
                    <>
                      {facturaDetalle.errorSRI.error && (
                        <p className={styles.errorHeadline}>{facturaDetalle.errorSRI.error}</p>
                      )}
                      {Array.isArray(facturaDetalle.errorSRI.mensajes) && facturaDetalle.errorSRI.mensajes.length > 0 && (
                        <ul className={styles.errorList}>
                          {facturaDetalle.errorSRI.mensajes.map((m, i) => (
                            <li key={i} className={styles.errorItem}>
                              <strong>[{m.identificador}] {m.mensaje}</strong>
                              {m.informacionAdicional && (
                                <div className={styles.errorInfo}>{m.informacionAdicional}</div>
                              )}
                              {m.tipo && <span className={styles.errorTipo}>{m.tipo}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {facturaDetalle.errorSRI.detalle && (
                        <details className={styles.errorDetails}>
                          <summary>Detalle tecnico (raw)</summary>
                          <pre className={styles.errorPre}>{facturaDetalle.errorSRI.detalle}</pre>
                        </details>
                      )}
                    </>
                  )}
                  {facturaDetalle.errorSRI && typeof facturaDetalle.errorSRI === 'string' && (
                    <pre className={styles.errorPre}>{facturaDetalle.errorSRI}</pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
