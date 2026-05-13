import { useState, useEffect } from 'react';
import { getTallerConfig, setTallerConfig } from '../../services/config';
import styles from './ConfiguracionForm.module.css';

export default function ConfiguracionForm({ auth }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const c = await getTallerConfig();
        if (cancelled) return;
        if (c) {
          setName(c.name || '');
          setAddress(c.address || '');
          setPhone(c.phone || '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (auth.role !== 'owner') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>
          Acceso restringido. Solo el owner puede editar la configuracion.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.container}><p>Cargando...</p></div>;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError('El nombre del taller es obligatorio.');
      return;
    }
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      await setTallerConfig(auth.session, { name, address, phone });
      setFeedback('Configuracion guardada.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Configuracion del taller</h1>
      </header>

      <p className={styles.hint}>
        Estos datos aparecen impresos en el comprobante interno cuando
        se cobra una OT.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label}>
          Nombre del taller
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
            required
            autoFocus
            placeholder="Mecanica del Sur"
          />
        </label>

        <label className={styles.label}>
          Direccion
          <input
            type="text"
            className={styles.input}
            value={address}
            onChange={e => setAddress(e.target.value)}
            disabled={saving}
            placeholder="Av. Principal 123 y Calle Segunda"
          />
        </label>

        <label className={styles.label}>
          Telefono
          <input
            type="tel"
            className={styles.input}
            value={phone}
            onChange={e => setPhone(e.target.value)}
            disabled={saving}
            placeholder="0987654321"
          />
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {feedback && <p className={styles.feedback} role="status">{feedback}</p>}

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
      </form>
    </div>
  );
}
