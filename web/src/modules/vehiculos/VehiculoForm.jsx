import { useState, useEffect } from 'react';
import { getClient } from '../../services/clientes';
import { getVehicle, createVehicle, updateVehicle } from '../../services/vehiculos';
import styles from './VehiculoForm.module.css';

export default function VehiculoForm({ vehiculoId, clienteId, navigate, auth }) {
  const isEdit = !!vehiculoId;
  const [placa, setPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [lastKm, setLastKm] = useState('');
  const [clientId, setClientId] = useState(clienteId || null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (isEdit) {
          const v = await getVehicle(vehiculoId);
          if (cancelled) return;
          if (!v) { setError('Vehiculo no encontrado.'); return; }
          setPlaca(v.placa);
          setMarca(v.marca);
          setModelo(v.modelo);
          setYear(v.year ? String(v.year) : '');
          setColor(v.color || '');
          setLastKm(v.lastKm !== null && v.lastKm !== undefined ? String(v.lastKm) : '');
          setClientId(v.clientId);
          setClientName(v.clientName);
          setClientPhone(v.clientPhone);
        } else if (clienteId) {
          const c = await getClient(clienteId);
          if (cancelled) return;
          if (!c) { setError('Cliente no encontrado.'); return; }
          setClientId(c.id);
          setClientName(c.name);
          setClientPhone(c.phone);
        } else {
          setError('Falta seleccionar cliente.');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [vehiculoId, clienteId, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!placa.trim() || !marca.trim() || !modelo.trim()) {
      setError('Placa, marca y modelo son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateVehicle(auth.session, vehiculoId, {
          placa, marca, modelo, year, color, lastKm
        });
        navigate('vehiculo-detail', { id: vehiculoId });
      } else {
        const v = await createVehicle(auth.session, {
          clientId, clientName, clientPhone,
          placa, marca, modelo, year, color, lastKm
        });
        navigate('vehiculo-detail', { id: v.id });
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.container}><p>Cargando...</p></div>;
  if (error && !clientId) return (
    <div className={styles.container}>
      <button type="button" className={styles.back} onClick={() => navigate('clientes')}>
        &larr; Volver
      </button>
      <p className={styles.error}>{error}</p>
    </div>
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => isEdit
            ? navigate('vehiculo-detail', { id: vehiculoId })
            : navigate('cliente-detail', { id: clienteId })
          }
          disabled={saving}
        >
          &larr; Cancelar
        </button>
        <h1 className={styles.title}>{isEdit ? 'Editar vehiculo' : 'Nuevo vehiculo'}</h1>
      </header>

      {clientName && (
        <p className={styles.clientInfo}>
          Cliente: <strong>{clientName}</strong>
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label}>
          Placa
          <input
            type="text"
            className={styles.input}
            value={placa}
            onChange={e => setPlaca(e.target.value)}
            disabled={saving}
            required
            autoFocus
            placeholder="ABC-1234"
          />
        </label>

        <label className={styles.label}>
          Marca
          <input
            type="text"
            className={styles.input}
            value={marca}
            onChange={e => setMarca(e.target.value)}
            disabled={saving}
            required
          />
        </label>

        <label className={styles.label}>
          Modelo
          <input
            type="text"
            className={styles.input}
            value={modelo}
            onChange={e => setModelo(e.target.value)}
            disabled={saving}
            required
          />
        </label>

        <div className={styles.row}>
          <label className={`${styles.label} ${styles.half}`}>
            Anio (opcional)
            <input
              type="number"
              className={styles.input}
              value={year}
              onChange={e => setYear(e.target.value)}
              disabled={saving}
              min="1900"
              max="2100"
            />
          </label>

          <label className={`${styles.label} ${styles.half}`}>
            Color (opcional)
            <input
              type="text"
              className={styles.input}
              value={color}
              onChange={e => setColor(e.target.value)}
              disabled={saving}
            />
          </label>
        </div>

        <label className={styles.label}>
          Ultimo kilometraje (opcional)
          <input
            type="number"
            className={styles.input}
            value={lastKm}
            onChange={e => setLastKm(e.target.value)}
            disabled={saving}
            min="0"
          />
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={saving}>
            {saving
              ? 'Guardando...'
              : (isEdit ? 'Guardar cambios' : 'Crear vehiculo')}
          </button>
        </div>
      </form>
    </div>
  );
}
