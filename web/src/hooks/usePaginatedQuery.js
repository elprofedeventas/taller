// hooks/usePaginatedQuery.js
// Patron estandar v2.2+: toda lista en una WAP usa este hook
// o equivalente con .limit() explicito.
import { useState, useEffect, useCallback } from 'react';
import { query, limit, startAfter, getDocs } from 'firebase/firestore';

/**
 * Hook para listas paginadas con cursor.
 *
 * @param {Object} options
 *   - baseQuery: query base (con orderBy y filtros, SIN limit ni startAfter)
 *   - pageSize: cuantos documentos por pagina (default 20)
 *
 * @returns { docs, loading, hasMore, loadMore, reset }
 */
export function usePaginatedQuery({ baseQuery, pageSize = 20 }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !baseQuery) return;
    setLoading(true);

    try {
      let q = query(baseQuery, limit(pageSize));
      if (lastDoc) q = query(baseQuery, startAfter(lastDoc), limit(pageSize));

      const snap = await getDocs(q);
      const newDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Dedup por id: protege contra reentrada del effect inicial
      // en React.StrictMode (dev), donde el useEffect dispara dos veces
      // y agregaria la misma pagina al state local.
      setDocs(prev => {
        const seen = new Set(prev.map(d => d.id));
        return [...prev, ...newDocs.filter(d => !seen.has(d.id))];
      });
      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.size === pageSize);
    } finally {
      setLoading(false);
    }
  }, [baseQuery, pageSize, lastDoc, loading, hasMore]);

  const reset = useCallback(() => {
    setDocs([]);
    setLastDoc(null);
    setHasMore(true);
  }, []);

  useEffect(() => { loadMore(); }, []);

  return { docs, loading, hasMore, loadMore, reset };
}
