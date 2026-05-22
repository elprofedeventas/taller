import { useState, useEffect } from 'react';
import { getVehicle } from '../../services/vehiculos';
import { listOTsByVehicle } from '../../services/workOrders';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import StatusBadge from '../ot/StatusBadge';
import styles from './VehiculoDetail.module.css';

function formatDate(ts) {
  if (!ts) return '—';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
}

function garantiaVigente(ot) {
  const fv = ot.garantia?.fechaVencimiento;
  if (!fv) return false;
  const d = typeof fv.toDate === 'function' ? fv.toDate() : new Date(fv);
  return d.getTime() > Date.now();
}

export default function VehiculoDetail({ vehiculoId, navigate }) {
  const [vehicle, setVehicle] = useState(null);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [v, o] = await Promise.all([
          getVehicle(vehiculoId),
          listOTsByVehicle(vehiculoId, 10)
        ]);
        if (cancelled) return;
        if (!v) {
          setError('Vehiculo no encontrado.');
        } else {
          setVehicle(v);
          setOts(o);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [vehiculoId]);

  if (loading) return <div className={styles.container}><p>Cargando...</p></div>;
  if (error) return (
    <div className={styles.container}>
      <button type="button" className={styles.back} onClick={() => navigate('clientes')}>
        &larr; Volver
      </button>
      <p className={styles.error}>{error}</p>
    </div>
  );
  if (!vehicle) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('cliente-detail', { id: vehicle.clientId })}
        >
          &larr; Volver al cliente
        </button>
        <h1 className={styles.title}>{vehicle.placa}</h1>
        <button
          type="button"
          className={styles.recibir}
          onClick={() => navigate('recepcion', {
            vehicleId: vehicle.id,
            clientId: vehicle.clientId
          })}
        >
          Recibir vehiculo
        </button>
        <button
          type="button"
          className={styles.edit}
          onClick={() => navigate('vehiculo-form', { id: vehicle.id })}
        >
          Editar
        </button>
      </header>

      <section className={styles.info}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Marca</span>
          <span className={styles.infoValue}>{vehicle.marca}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Modelo</span>
          <span className={styles.infoValue}>{vehicle.modelo}</span>
        </div>
        {vehicle.year && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Anio</span>
            <span className={styles.infoValue}>{vehicle.year}</span>
          </div>
        )}
        {vehicle.color && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Color</span>
            <span className={styles.infoValue}>{vehicle.color}</span>
          </div>
        )}
        {vehicle.lastKm !== null && vehicle.lastKm !== undefined && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Ultimo km</span>
            <span className={styles.infoValue}>{Number(vehicle.lastKm).toLocaleString()}</span>
          </div>
        )}
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Cliente</span>
          <span className={styles.infoValue}>{vehicle.clientName}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Telefono cliente</span>
          <span className={styles.infoValue}>{formatPhoneForDisplay(vehicle.clientPhone)}</span>
        </div>
      </section>

      <section className={styles.historySection}>
        <h2 className={styles.subtitle}>Historial de OTs</h2>
        {ots.length === 0 ? (
          <p className={styles.empty}>Sin OTs registradas para este vehiculo.</p>
        ) : (
          <ul className={styles.otList}>
            {ots.map(ot => (
              <li
                key={ot.id}
                className={styles.otItem}
                role="button"
                tabIndex={0}
                onClick={() => navigate('ot-detail', { id: ot.id })}
                onKeyDown={e => {
                  if (e.key === 'Enter') navigate('ot-detail', { id: ot.id });
                }}
              >
                <div className={styles.otMain}>
                  <span className={styles.otDate}>{formatDate(ot.openedAt || ot.createdAt)}</span>
                  <span className={styles.otMeta}>{ot.mechanicName || 'Sin mecanico'}</span>
                  <span className={styles.otProblema}>{ot.problema || '—'}</span>
                </div>
                <div className={styles.otRight}>
                  <StatusBadge status={ot.status} />
                  {garantiaVigente(ot) && (
                    <span className={styles.garantiaBadge}>Garantia vigente</span>
                  )}
                  {ot.totalGeneral > 0 && (
                    <span className={styles.otTotal}>${Number(ot.totalGeneral).toFixed(2)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
