import { useState, useEffect } from 'react';
import { getTallerConfig, setTallerConfig } from '../../services/config';
import SeccionCertificado from './SeccionCertificado';
import CatalogoSeccion from './CatalogoSeccion';
import styles from './ConfiguracionForm.module.css';

export default function ConfiguracionForm({ auth }) {
  // Campos basicos del taller
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  // Campos SRI (opcionales, para facturacion electronica)
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [dirMatriz, setDirMatriz] = useState('');
  const [dirEstablecimiento, setDirEstablecimiento] = useState('');
  const [estab, setEstab] = useState('');
  const [ptoEmi, setPtoEmi] = useState('');
  const [obligadoContabilidad, setObligadoContabilidad] = useState('NO');

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
          setRuc(c.ruc || '');
          setRazonSocial(c.razonSocial || '');
          setNombreComercial(c.nombreComercial || '');
          setDirMatriz(c.dirMatriz || '');
          setDirEstablecimiento(c.dirEstablecimiento || '');
          setEstab(c.estab || '');
          setPtoEmi(c.ptoEmi || '');
          setObligadoContabilidad(c.obligadoContabilidad || 'NO');
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
    // Validacion SRI parcial: si se llena cualquier campo SRI, el RUC tambien.
    const sriFilled =
      ruc.trim() || razonSocial.trim() || dirMatriz.trim() ||
      estab.trim() || ptoEmi.trim();
    if (sriFilled && !ruc.trim()) {
      setError('Si vas a emitir facturas SRI, el RUC es obligatorio.');
      return;
    }
    if (ruc.trim() && !/^\d{13}$/.test(ruc.trim())) {
      setError('El RUC debe tener exactamente 13 digitos.');
      return;
    }
    if (estab.trim() && !/^\d{3}$/.test(estab.trim())) {
      setError('Establecimiento debe ser exactamente 3 digitos (ej. 001).');
      return;
    }
    if (ptoEmi.trim() && !/^\d{3}$/.test(ptoEmi.trim())) {
      setError('Punto de emision debe ser exactamente 3 digitos (ej. 001).');
      return;
    }

    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      await setTallerConfig(auth.session, {
        name, address, phone,
        ruc, razonSocial, nombreComercial,
        dirMatriz, dirEstablecimiento,
        estab, ptoEmi,
        obligadoContabilidad
      });
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
        <h2 className={styles.section}>Datos generales</h2>

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

        <h2 className={styles.section}>Facturacion electronica SRI (opcional)</h2>
        <p className={styles.subhint}>
          Solo necesario si emites facturas electronicas con el SRI Ecuador.
          Deja en blanco si no aplica todavia.
        </p>

        <label className={styles.label}>
          RUC (13 digitos)
          <input
            type="text"
            className={styles.input}
            value={ruc}
            onChange={e => setRuc(e.target.value.replace(/\D/g, '').slice(0, 13))}
            disabled={saving}
            inputMode="numeric"
            placeholder="1791234567001"
          />
        </label>

        <label className={styles.label}>
          Razon social (segun SRI)
          <input
            type="text"
            className={styles.input}
            value={razonSocial}
            onChange={e => setRazonSocial(e.target.value)}
            disabled={saving}
            placeholder="MECANICA AUTOMOTRIZ DEL SUR S.A."
          />
        </label>

        <label className={styles.label}>
          Nombre comercial (si difiere de la razon social)
          <input
            type="text"
            className={styles.input}
            value={nombreComercial}
            onChange={e => setNombreComercial(e.target.value)}
            disabled={saving}
            placeholder="Mecanica del Sur"
          />
        </label>

        <label className={styles.label}>
          Direccion matriz (segun SRI)
          <input
            type="text"
            className={styles.input}
            value={dirMatriz}
            onChange={e => setDirMatriz(e.target.value)}
            disabled={saving}
            placeholder="Av. Principal 123 y Segunda, Quito"
          />
        </label>

        <label className={styles.label}>
          Direccion del establecimiento (si difiere)
          <input
            type="text"
            className={styles.input}
            value={dirEstablecimiento}
            onChange={e => setDirEstablecimiento(e.target.value)}
            disabled={saving}
            placeholder="Mismo que matriz si dejas vacio"
          />
        </label>

        <div className={styles.row}>
          <label className={`${styles.label} ${styles.half}`}>
            Establecimiento
            <input
              type="text"
              className={styles.input}
              value={estab}
              onChange={e => setEstab(e.target.value.replace(/\D/g, '').slice(0, 3))}
              disabled={saving}
              inputMode="numeric"
              placeholder="001"
              maxLength={3}
            />
          </label>

          <label className={`${styles.label} ${styles.half}`}>
            Punto de emision
            <input
              type="text"
              className={styles.input}
              value={ptoEmi}
              onChange={e => setPtoEmi(e.target.value.replace(/\D/g, '').slice(0, 3))}
              disabled={saving}
              inputMode="numeric"
              placeholder="001"
              maxLength={3}
            />
          </label>
        </div>

        <label className={styles.label}>
          Obligado a llevar contabilidad
          <select
            className={styles.input}
            value={obligadoContabilidad}
            onChange={e => setObligadoContabilidad(e.target.value)}
            disabled={saving}
          >
            <option value="NO">No</option>
            <option value="SI">Si</option>
          </select>
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {feedback && <p className={styles.feedback} role="status">{feedback}</p>}

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
      </form>

      <SeccionCertificado auth={auth} />

      <CatalogoSeccion auth={auth} />
    </div>
  );
}
