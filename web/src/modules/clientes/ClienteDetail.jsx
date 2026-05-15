import { useState, useEffect } from 'react';
import { getClient } from '../../services/clientes';
import { listVehiclesByClient } from '../../services/vehiculos';
import { listOTsByClient } from '../../services/workOrders';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { templatesByIds } from '../../services/whatsapp';
import StatusBadge from '../ot/StatusBadge';
import styles from './ClienteDetail.module.css';

function formatDate(ts) {
  if (!ts) return '—';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ClienteDetail({ clienteId, navigate, auth }) {
  const [client, setClient] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [c, v, o] = await Promise.all([
          getClient(clienteId),
          listVehiclesByClient(clienteId),
          listOTsByClient(clienteId, 10)
        ]);
        if (cancelled) return;
        if (!c) {
          setError('Cliente no encontrado.');
        } else {
          setClient(c);
          setVehicles(v);
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
  }, [clienteId]);

  if (loading) return <div className={styles.container}><p>Cargando...</p></div>;
  if (error) return (
    <div className={styles.container}>
      <button type="button" className={styles.back} onClick={() => navigate('clientes')}>
        &larr; Volver
      </button>
      <p className={styles.error}>{error}</p>
    </div>
  );
  if (!client) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('clientes')}
        >
          &larr; Volver
        </button>
        <h1 className={styles.title}>{client.name}</h1>
        <WhatsAppButton
          phone={client.phone}
          templates={templatesByIds(['recordatorio_mantenimiento'])}
          variables={{ clientName: client.name }}
          context={{ collection: 'clients', docId: client.id }}
          buttonLabel="WhatsApp"
          auth={auth}
        />
        <button
          type="button"
          className={styles.edit}
          onClick={() => navigate('cliente-form', { id: client.id })}
        >
          Editar
        </button>
      </header>

      <section className={styles.info}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Telefono</span>
          <span className={styles.infoValue}>{formatPhoneForDisplay(client.phone)}</span>
        </div>
        {client.email && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{client.email}</span>
          </div>
        )}
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Visitas totales</span>
          <span className={styles.infoValue}>{client.totalVisits || 0}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Total gastado</span>
          <span className={styles.infoValue}>${Number(client.totalSpent || 0).toFixed(2)}</span>
        </div>
      </section>

      <section className={styles.vehiclesSection}>
        <div className={styles.vehiclesHeader}>
          <h2 className={styles.subtitle}>Vehiculos</h2>
          <button
            type="button"
            className={styles.addVehicle}
            onClick={() => navigate('vehiculo-form', { clienteId: client.id })}
          >
            Agregar vehiculo
          </button>
        </div>
        {vehicles.length === 0 ? (
          <p className={styles.empty}>Sin vehiculos registrados.</p>
        ) : (
          <ul className={styles.vehiclesList}>
            {vehicles.map(v => (
              <li
                key={v.id}
                className={styles.vehicleItem}
                role="button"
                tabIndex={0}
                onClick={() => navigate('vehiculo-detail', { id: v.id })}
                onKeyDown={e => {
                  if (e.key === 'Enter') navigate('vehiculo-detail', { id: v.id });
                }}
              >
                <span className={styles.placa}>{v.placa}</span>
                <span className={styles.modelo}>
                  {v.marca} {v.modelo}{v.year ? ` ${v.year}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.historySection}>
        <h2 className={styles.subtitle}>Historial de OTs</h2>
        {ots.length === 0 ? (
          <p className={styles.empty}>Sin OTs registradas para este cliente.</p>
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
                  <span className={styles.otPlaca}>{ot.vehiclePlaca}</span>
                  <span className={styles.otMeta}>{ot.vehicleMarca} {ot.vehicleModelo}</span>
                  <span className={styles.otMeta}>{formatDate(ot.openedAt || ot.createdAt)}</span>
                </div>
                <div className={styles.otRight}>
                  <StatusBadge status={ot.status} />
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
