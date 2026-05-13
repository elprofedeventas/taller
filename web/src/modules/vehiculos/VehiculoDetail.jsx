import { useState, useEffect } from 'react';
import { getVehicle } from '../../services/vehiculos';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import styles from './VehiculoDetail.module.css';

export default function VehiculoDetail({ vehiculoId, navigate }) {
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const v = await getVehicle(vehiculoId);
        if (cancelled) return;
        if (!v) {
          setError('Vehiculo no encontrado.');
        } else {
          setVehicle(v);
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
        <p className={styles.placeholder}>
          Sin OTs todavia. El historial aparecera cuando se construya el modulo OT.
        </p>
      </section>
    </div>
  );
}
