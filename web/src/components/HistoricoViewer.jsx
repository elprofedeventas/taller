// components/HistoricoViewer.jsx
// Vista de lectura sola para datos archivados.
// Solo visible a manager y owner.

import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../services/firestore';
import { useAuth } from '../hooks/useAuth';
import styles from './HistoricoViewer.module.css';

export function HistoricoViewer({ entidad, columnas, onExport, auth }) {
  // Si se pasa auth como prop (recomendado mientras useAuth no comparta
  // estado, ver PENDIENTES.md), usar ese. Si no, fallback al hook.
  const fallback = useAuth();
  const role = auth ? auth.role : fallback.role;
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  if (role !== 'manager' && role !== 'owner') {
    return <p className={styles.denied}>No tienes permiso para ver el historico.</p>;
  }

  useEffect(() => {
    const cargarIndice = async () => {
      try {
        const indexCol = collection(db, '_archive_index');
        const snap = await getDocs(
          query(indexCol, where('entidad', '==', entidad), orderBy('periodo', 'desc'), limit(24))
        );
        const periodos = snap.docs.map(d => d.data());
        setMesesDisponibles(periodos);
      } catch (err) {
        console.error('Error cargando indice de archivo:', err);
      }
    };
    cargarIndice();
  }, [entidad]);

  useEffect(() => {
    if (!mesSeleccionado) return;
    setLoading(true);

    const collName = '_archive_' + entidad + '_' + mesSeleccionado;
    getDocs(collection(db, collName))
      .then(snap => {
        setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(err => {
        console.error(err);
        setDocs([]);
      })
      .finally(() => setLoading(false));
  }, [mesSeleccionado, entidad]);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Historico de {entidad}</h3>

      <div className={styles.selector}>
        <label>Periodo:</label>
        <select
          value={mesSeleccionado || ''}
          onChange={(e) => setMesSeleccionado(e.target.value)}
          disabled={mesesDisponibles.length === 0}
        >
          <option value="">Selecciona un mes</option>
          {mesesDisponibles.map(p => (
            <option key={p.periodo} value={p.periodo}>
              {formatPeriodo(p.periodo)} - {p.docsCount} registros
            </option>
          ))}
        </select>

        {mesesDisponibles.length === 0 && (
          <span className={styles.empty}>No hay datos archivados todavia.</span>
        )}
      </div>

      {loading && <p>Cargando...</p>}

      {!loading && docs.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>{columnas.map(c => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {docs.map(doc => (
                  <tr key={doc.id}>
                    {columnas.map(c => (
                      <td key={c.key}>
                        {c.render ? c.render(doc[c.key], doc) : String(doc[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.actions}>
            <p className={styles.count}>{docs.length} registros</p>
            {onExport && (
              <button onClick={() => onExport(docs)} className={styles.btn}>
                Exportar este mes a Excel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatPeriodo(periodo) {
  const [year, month] = periodo.split('_');
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[parseInt(month) - 1] + ' ' + year;
}
