import { useState, useEffect, useMemo } from 'react';
import { loadPanelKPIs, currentMonth } from '../../services/panel';
import { calcularAlertas } from '../../services/alertas';
import styles from './PanelDueno.module.css';

const MES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function PanelDueno({ navigate, auth }) {
  const [kpis, setKpis] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAlertas, setLoadingAlertas] = useState(true);
  const [error, setError] = useState(null);

  const period = useMemo(() => currentMonth(), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await loadPanelKPIs(period);
        if (cancelled) return;
        setKpis(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period.year, period.month]);

  // Alertas: una sola carga al montar (no depende del period seleccionado).
  useEffect(() => {
    let cancelled = false;
    setLoadingAlertas(true);
    calcularAlertas()
      .then(arr => { if (!cancelled) setAlertas(arr); })
      .catch(() => { if (!cancelled) setAlertas([]); })
      .finally(() => { if (!cancelled) setLoadingAlertas(false); });
    return () => { cancelled = true; };
  }, []);

  function accionAlerta(a) {
    if (a.otId) return () => navigate('ot-detail', { id: a.otId });
    if (a.clientId) return () => navigate('cliente-detail', { id: a.clientId });
    if (a.tipo === 'recordatorios') return () => navigate('contactar');
    if (a.tipo === 'pendientes_cobro') return () => navigate('caja');
    if (a.tipo === 'certificado') return () => navigate('configuracion');
    return null;
  }

  if (auth.role !== 'owner' && auth.role !== 'manager') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido. Solo owner o manager pueden ver el panel.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Panel del dueno</h1>
          <p className={styles.periodLabel}>
            {MES_LABEL[period.month - 1]} {period.year}
          </p>
        </div>
        <button
          type="button"
          className={styles.historicoButton}
          onClick={() => navigate('historico')}
        >
          Ver historico
        </button>
      </header>

      {!loadingAlertas && alertas.length > 0 && (
        <section className={styles.alertasSection}>
          <h2 className={styles.alertasTitle}>
            Atencion <span className={styles.alertasCount}>({alertas.length})</span>
          </h2>
          <ul className={styles.alertasList}>
            {alertas.map((a, i) => {
              const action = accionAlerta(a);
              return (
                <li key={i} className={`${styles.alerta} ${styles[`alerta_${a.prioridad}`]}`}>
                  <span className={styles.alertaDot} aria-hidden="true" />
                  <span className={styles.alertaText}>{a.mensaje}</span>
                  {action && (
                    <button
                      type="button"
                      className={styles.alertaBtn}
                      onClick={action}
                    >
                      {a.otId ? 'Ver OT'
                        : a.clientId ? 'Ver cliente'
                        : a.tipo === 'recordatorios' ? 'Ver lista'
                        : a.tipo === 'pendientes_cobro' ? 'Ir a Caja'
                        : a.tipo === 'certificado' ? 'Ir a Configuracion'
                        : 'Abrir'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {loading && <p>Cargando KPIs...</p>}
      {error && <p className={styles.error}>{error}</p>}

      {kpis && !loading && (
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Ingresos del mes</span>
            <span className={styles.kpiBig}>${kpis.totalRevenue.toFixed(2)}</span>
            <span className={styles.kpiSub}>
              {kpis.paymentsCount} cobro{kpis.paymentsCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>OTs activas</span>
            <span className={styles.kpiBig}>{kpis.activeCount}</span>
            <span className={styles.kpiSub}>en proceso ahora</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Clientes del mes</span>
            <div className={styles.splitRow}>
              <div>
                <span className={styles.kpiMedium}>{kpis.newClientCount}</span>
                <span className={styles.kpiSub}>nuevos</span>
              </div>
              <div>
                <span className={styles.kpiMedium}>{kpis.returningClientCount}</span>
                <span className={styles.kpiSub}>recurrentes</span>
              </div>
            </div>
            <span className={styles.kpiSub}>
              {kpis.closedCount} OT{kpis.closedCount === 1 ? '' : 's'} cerrada{kpis.closedCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Mecanicos productivos</span>
            {kpis.topMechanics.length === 0 ? (
              <span className={styles.kpiSub}>Sin OTs cerradas con mecanico asignado este mes.</span>
            ) : (
              <ol className={styles.mechanicList}>
                {kpis.topMechanics.map(m => (
                  <li key={m.mechanicId} className={styles.mechanicRow}>
                    <div className={styles.mechanicMain}>
                      <span>{m.mechanicName}</span>
                      <span className={styles.mechanicCount}>
                        {m.count} OT{m.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    {(m.facturado > 0 || m.margen > 0) && (
                      <div className={styles.mechanicMeta}>
                        ${m.facturado.toFixed(2)} facturado
                        {m.margen > 0 && (
                          <>
                            {' · '}${m.margen.toFixed(2)} margen
                            {' ('}{Math.round((m.margen / m.facturado) * 100)}%{')'}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {kpis.margenBrutoMes > 0 && (
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Margen bruto del mes</span>
              <span className={styles.kpiBig}>
                ${kpis.margenBrutoMes.toFixed(2)}
              </span>
              <span className={styles.kpiSub}>
                {kpis.margenPorcentajeMes}% sobre lo facturado · {kpis.otsConMargen} OT{kpis.otsConMargen === 1 ? '' : 's'} con costos cargados
              </span>
            </div>
          )}

          {kpis.satisfaccionPromedioMes != null && (
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Satisfaccion promedio</span>
              <span className={styles.kpiBig}>
                {kpis.satisfaccionPromedioMes.toFixed(1)} / 5
              </span>
              <span className={styles.kpiSub}>
                Basado en {kpis.satisfaccionRespuestas} respuesta{kpis.satisfaccionRespuestas === 1 ? '' : 's'} del mes
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
