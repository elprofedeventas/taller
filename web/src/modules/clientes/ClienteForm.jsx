import { useState, useEffect } from 'react';
import { getClient, createClient, updateClient } from '../../services/clientes';
import styles from './ClienteForm.module.css';

function derivarTipoId(identificacion) {
  const limpio = (identificacion || '').replace(/\D/g, '');
  if (limpio.length === 13) return '04';
  return '05';
}

export default function ClienteForm({ clienteId, navigate, auth }) {
  const isEdit = !!clienteId;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [identificacion, setIdentificacion] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    async function load() {
      try {
        const c = await getClient(clienteId);
        if (cancelled) return;
        if (!c) {
          setError('Cliente no encontrado.');
        } else {
          setName(c.name);
          setPhone(c.phone);
          setEmail(c.email || '');
          setIdentificacion(c.identificacion || '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [clienteId, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !phone.trim()) {
      setError('Nombre y telefono son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tipoId = derivarTipoId(identificacion);
      if (isEdit) {
        await updateClient(auth.session, clienteId, {
          name, phone, email, identificacion, tipoId
        });
        navigate('cliente-detail', { id: clienteId });
      } else {
        const c = await createClient(auth.session, {
          name, phone, email, identificacion, tipoId
        });
        navigate('cliente-detail', { id: c.id });
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.container}><p>Cargando...</p></div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => isEdit
            ? navigate('cliente-detail', { id: clienteId })
            : navigate('clientes')
          }
          disabled={saving}
        >
          &larr; Cancelar
        </button>
        <h1 className={styles.title}>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h1>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label}>
          Nombre
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
            required
            autoFocus
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
            required
            placeholder="0987654321 o +593..."
          />
        </label>

        <label className={styles.label}>
          Cedula o RUC (opcional, para facturacion)
          <input
            type="text"
            className={styles.input}
            value={identificacion}
            onChange={e => setIdentificacion(e.target.value)}
            disabled={saving}
            placeholder="10 digitos cedula o 13 digitos RUC"
            inputMode="numeric"
            maxLength={13}
          />
        </label>

        <label className={styles.label}>
          Email (opcional)
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={saving}
          />
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={saving}>
            {saving
              ? 'Guardando...'
              : (isEdit ? 'Guardar cambios' : 'Crear cliente')}
          </button>
        </div>
      </form>
    </div>
  );
}
