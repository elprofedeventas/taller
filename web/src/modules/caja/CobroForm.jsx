import { useState, useEffect, useMemo } from 'react';
import { getOT, calculateTotals } from '../../services/workOrders';
import { createPayment } from '../../services/payments';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import StatusBadge from '../ot/StatusBadge';
import styles from './CobroForm.module.css';

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' }
];

export default function CobroForm({ otId, navigate, auth }) {
  const [ot, setOT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [monto, setMonto] = useState('');
  const [formaPago, setFormaPago] = useState('efectivo');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const o = await getOT(otId);
        if (cancelled) return;
        if (!o) {
          setError('OT no encontrada.');
        } else if (o.status !== 'listo') {
          setError(`Esta OT no esta en estado "Listo" (actual: ${o.status}).`);
          setOT(o);
        } else {
          setOT(o);
          const computed = calculateTotals(o.tasks || [], o.parts || []);
          setMonto(computed.totalGeneral.toFixed(2));
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [otId]);

  const computedTotals = useMemo(() => {
    if (!ot) return { totalLabor: 0, totalParts: 0, totalGeneral: 0 };
    return calculateTotals(ot.tasks || [], ot.parts || []);
  }, [ot]);

  if (auth.role === 'mechanic') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido.</p>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.container}><p>Cargando...</p></div>;
  }
  if (error && !ot) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.back} onClick={() => navigate('caja')}>
          &larr; Volver
        </button>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }
  if (!ot) return null;

  async function handleCobrar(e) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const payment = await createPayment(auth.session, {
        ot,
        monto,
        formaPago
      });
      navigate('comprobante', { id: payment.id });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const canCobrar = ot.status === 'listo';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('caja')}
          disabled={saving}
        >
          &larr; Volver
        </button>
        <h1 className={styles.title}>Cobrar OT</h1>
        <StatusBadge status={ot.status} />
      </header>

      <section className={styles.section}>
        <h2 className={styles.subtitle}>Vehiculo y cliente</h2>
        <div className={styles.infoGrid}>
          <div>
            <span className={styles.infoLabel}>Placa</span>
            <div className={styles.placa}>{ot.vehiclePlaca}</div>
          </div>
          <div>
            <span className={styles.infoLabel}>Modelo</span>
            <div>{ot.vehicleMarca} {ot.vehicleModelo}</div>
          </div>
          <div>
            <span className={styles.infoLabel}>Cliente</span>
            <div>{ot.clientName}</div>
          </div>
          <div>
            <span className={styles.infoLabel}>Telefono</span>
            <div>{formatPhoneForDisplay(ot.clientPhone)}</div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.subtitle}>Desglose</h2>
          <button
            type="button"
            className={styles.editLink}
            onClick={() => navigate('ot-detail', { id: ot.id })}
            disabled={saving}
          >
            Editar OT
          </button>
        </div>

        {(!ot.tasks || ot.tasks.length === 0) && (!ot.parts || ot.parts.length === 0) ? (
          <p className={styles.emptyHint}>Sin tareas ni repuestos registrados.</p>
        ) : (
          <>
            {ot.tasks && ot.tasks.length > 0 && (
              <div className={styles.breakdownBlock}>
                <h3 className={styles.breakdownTitle}>Mano de obra</h3>
                <ul className={styles.breakdownList}>
                  {ot.tasks.map((t, i) => (
                    <li key={i} className={styles.breakdownItem}>
                      <span className={styles.breakdownDesc}>{t.descripcion || '(sin descripcion)'}</span>
                      <span className={styles.breakdownQty}>
                        {t.horas} h x ${Number(t.precioUnit || 0).toFixed(2)}
                      </span>
                      <span className={styles.breakdownTotal}>
                        ${Number(t.total || 0).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className={styles.subtotalRow}>
                  <span>Subtotal mano de obra</span>
                  <span>${computedTotals.totalLabor.toFixed(2)}</span>
                </div>
              </div>
            )}

            {ot.parts && ot.parts.length > 0 && (
              <div className={styles.breakdownBlock}>
                <h3 className={styles.breakdownTitle}>Repuestos</h3>
                <ul className={styles.breakdownList}>
                  {ot.parts.map((p, i) => (
                    <li key={i} className={styles.breakdownItem}>
                      <span className={styles.breakdownDesc}>{p.descripcion || '(sin descripcion)'}</span>
                      <span className={styles.breakdownQty}>
                        {p.cantidad} x ${Number(p.precioUnit || 0).toFixed(2)}
                      </span>
                      <span className={styles.breakdownTotal}>
                        ${Number(p.total || 0).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className={styles.subtotalRow}>
                  <span>Subtotal repuestos</span>
                  <span>${computedTotals.totalParts.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className={styles.totalRow}>
              <span>Total calculado</span>
              <span className={styles.totalValue}>
                ${computedTotals.totalGeneral.toFixed(2)}
              </span>
            </div>
          </>
        )}
      </section>

      <form className={styles.section} onSubmit={handleCobrar}>
        <h2 className={styles.subtitle}>Cobro</h2>

        <label className={styles.label}>
          Monto a cobrar (USD)
          <input
            type="number"
            className={styles.input}
            value={monto}
            onChange={e => setMonto(e.target.value)}
            disabled={saving || !canCobrar}
            step="0.01"
            min="0"
            required
          />
        </label>

        <label className={styles.label}>
          Forma de pago
          <select
            className={styles.input}
            value={formaPago}
            onChange={e => setFormaPago(e.target.value)}
            disabled={saving || !canCobrar}
          >
            {FORMAS_PAGO.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submit}
            disabled={saving || !canCobrar}
          >
            {saving ? 'Procesando...' : 'Confirmar cobro'}
          </button>
        </div>
      </form>
    </div>
  );
}
