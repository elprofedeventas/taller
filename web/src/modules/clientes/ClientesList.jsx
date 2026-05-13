import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firestore';
import { searchClients } from '../../services/clientes';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import styles from './ClientesList.module.css';

export default function ClientesList({ navigate }) {
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const baseQuery = useMemo(
    () => query(collection(db, 'clients'), orderBy('createdAt', 'desc')),
    []
  );

  const { docs: clients, loading, hasMore, loadMore } = usePaginatedQuery({
    baseQuery,
    pageSize: 20
  });

  useEffect(() => {
    const q = searchInput.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchClients(q);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const display = searchResults !== null ? searchResults : clients;
  const showLoadMore = searchResults === null && hasMore;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Clientes</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.importButton}
            onClick={() => navigate('clientes-import')}
          >
            Importar Excel
          </button>
          <button
            type="button"
            className={styles.newButton}
            onClick={() => navigate('cliente-form')}
          >
            Nuevo cliente
          </button>
        </div>
      </header>

      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar por placa, telefono o nombre"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          autoComplete="off"
        />
        {searching && <span className={styles.searching}>Buscando...</span>}
      </div>

      {display.length === 0 && !loading && !searching ? (
        <p className={styles.empty}>
          {searchInput ? 'Sin resultados.' : 'No hay clientes registrados todavia.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {display.map(c => (
            <li
              key={c.id}
              className={styles.item}
              role="button"
              tabIndex={0}
              onClick={() => navigate('cliente-detail', { id: c.id })}
              onKeyDown={e => {
                if (e.key === 'Enter') navigate('cliente-detail', { id: c.id });
              }}
            >
              <div className={styles.itemMain}>
                <span className={styles.itemName}>{c.name}</span>
                <span className={styles.itemPhone}>{formatPhoneForDisplay(c.phone)}</span>
              </div>
              <div className={styles.itemMeta}>
                <span>{c.totalVisits || 0} visitas</span>
                {c.totalSpent > 0 && <span>${Number(c.totalSpent).toFixed(2)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showLoadMore && (
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
