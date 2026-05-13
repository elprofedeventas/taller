import { useMemo } from 'react';
import { activeOTsQuery } from '../../services/workOrders';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import OTSummary from './OTSummary';
import styles from './ColaOT.module.css';

export default function ColaOT({ navigate, auth }) {
  const baseQuery = useMemo(() => {
    // Regla critica de privacidad: el mecanico solo ve sus OTs.
    // El filter vive en la query JS porque Firestore Rules no pueden
    // hacer role-check en reads (no hay request.auth en este patron).
    const mechId = auth.role === 'mechanic' ? auth.userId : null;
    return activeOTsQuery({ mechanicId: mechId });
  }, [auth.role, auth.userId]);

  const { docs: ots, loading, hasMore, loadMore } = usePaginatedQuery({
    baseQuery,
    pageSize: 20
  });

  const showNewRecepcion = auth.role !== 'mechanic';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {auth.role === 'mechanic' ? 'Mis OTs' : 'OTs activas'}
        </h1>
        {showNewRecepcion && (
          <button
            type="button"
            className={styles.newButton}
            onClick={() => navigate('recepcion')}
          >
            Nueva recepcion
          </button>
        )}
      </header>

      {ots.length === 0 && !loading ? (
        <p className={styles.empty}>
          {auth.role === 'mechanic'
            ? 'No tienes OTs asignadas activas.'
            : 'No hay OTs activas. Crea una desde Recepcion.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {ots.map(ot => (
            <li key={ot.id} className={styles.item}>
              <OTSummary
                ot={ot}
                onClick={() => navigate('ot-detail', { id: ot.id })}
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
