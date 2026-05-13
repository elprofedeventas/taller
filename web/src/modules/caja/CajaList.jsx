import { useMemo } from 'react';
import { readyForCobroQuery } from '../../services/workOrders';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import OTSummary from '../ot/OTSummary';
import styles from './CajaList.module.css';

export default function CajaList({ navigate, auth }) {
  const baseQuery = useMemo(() => readyForCobroQuery(), []);
  const { docs: ots, loading, hasMore, loadMore } = usePaginatedQuery({
    baseQuery,
    pageSize: 20
  });

  if (auth.role === 'mechanic') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>
          Acceso restringido. Solo recepcionista, manager u owner pueden cobrar.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Listas para cobrar</h1>
      </header>

      {ots.length === 0 && !loading ? (
        <p className={styles.empty}>
          No hay OTs en estado "Listo" para cobrar.
        </p>
      ) : (
        <ul className={styles.list}>
          {ots.map(ot => (
            <li key={ot.id} className={styles.item}>
              <OTSummary
                ot={ot}
                onClick={() => navigate('cobro-form', { otId: ot.id })}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? 'Cargando...' : 'Cargar mas'}
        </button>
      )}
    </div>
  );
}
