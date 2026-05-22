import { useState, useEffect } from 'react';
import { getUser, updateUser } from '../../services/users';
import { createUser, changeUserPin } from '../../services/auth';
import styles from './UsuarioForm.module.css';

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'recepcionista', label: 'Recepcionista' },
  { value: 'mechanic', label: 'Mecanico' }
];

export default function UsuarioForm({ usuarioId, navigate, auth }) {
  const isEdit = !!usuarioId;
  const isSelf = isEdit && usuarioId === auth.userId;

  const [name, setName] = useState('');
  const [role, setRole] = useState('mechanic');
  const [active, setActive] = useState(true);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [costoHora, setCostoHora] = useState('');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    async function load() {
      try {
        const u = await getUser(usuarioId);
        if (cancelled) return;
        if (!u) {
          setError('Usuario no encontrado.');
        } else {
          setName(u.name || '');
          setRole(u.role || 'mechanic');
          setActive(u.active !== false);
          setCostoHora(u.costoHora != null ? String(u.costoHora) : '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [usuarioId, isEdit]);

  if (auth.role !== 'owner') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido. Solo el owner puede gestionar usuarios.</p>
      </div>
    );
  }

  async function handleSubmitCreate(e) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError('Nombre obligatorio.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN debe ser de 4 digitos.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createUser(auth.session, {
        name: name.trim(),
        pin,
        role,
        locationId: null
      });
      navigate('usuarios');
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function handleSubmitEdit(e) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError('Nombre obligatorio.');
      return;
    }
    if (newPin && !/^\d{4}$/.test(newPin)) {
      setError('PIN nuevo debe ser de 4 digitos.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const patch = { name: name.trim() };
      if (!isSelf) {
        patch.role = role;
        patch.active = active;
      }
      // costoHora aplica solo a mecanicos; lo persiste el owner en cualquier
      // estado del form (incluye el cero como dato valido).
      if (role === 'mechanic') {
        patch.costoHora = Number(costoHora) || 0;
      }
      await updateUser(auth.session, usuarioId, patch);
      if (newPin) {
        await changeUserPin(auth.session, usuarioId, newPin);
      }
      navigate('usuarios');
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (loading) {
    return <div className={styles.container}><p>Cargando...</p></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('usuarios')}
          disabled={saving}
        >
          &larr; Cancelar
        </button>
        <h1 className={styles.title}>
          {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
        </h1>
      </header>

      <form
        className={styles.form}
        onSubmit={isEdit ? handleSubmitEdit : handleSubmitCreate}
      >
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
          Rol
          <select
            className={styles.input}
            value={role}
            onChange={e => setRole(e.target.value)}
            disabled={saving || isSelf}
          >
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        {isSelf && (
          <p className={styles.hint}>
            No puedes cambiar tu propio rol o estado. Pide a otro owner que lo haga.
          </p>
        )}

        {isEdit && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              disabled={saving || isSelf}
            />
            Activo
          </label>
        )}

        {isEdit && role === 'mechanic' && (
          <label className={styles.label}>
            Costo por hora (USD)
            <input
              type="number"
              className={styles.input}
              value={costoHora}
              onChange={e => setCostoHora(e.target.value)}
              disabled={saving}
              step="0.01"
              min="0"
              placeholder="0.00"
            />
            <span className={styles.hint}>
              Usado para calcular el margen bruto de cada OT.
              Visible solo en el panel del dueno.
            </span>
          </label>
        )}

        {!isEdit && (
          <label className={styles.label}>
            PIN (4 digitos)
            <input
              type="text"
              className={styles.input}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={saving}
              required
              inputMode="numeric"
              pattern="\d{4}"
              placeholder="1234"
            />
          </label>
        )}

        {isEdit && (
          <label className={styles.label}>
            PIN nuevo (opcional)
            <input
              type="password"
              className={styles.input}
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={saving}
              inputMode="numeric"
              pattern="\d{4}"
              placeholder="Dejar vacio para no cambiar"
              autoComplete="new-password"
            />
          </label>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submit}
            disabled={saving}
          >
            {saving
              ? 'Guardando...'
              : (isEdit ? 'Guardar cambios' : 'Crear usuario')}
          </button>
        </div>
      </form>
    </div>
  );
}
