// components/ExcelExporter.jsx
import { useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../services/firestore';
import { exportToExcel } from '../services/excel';
import { useAuth } from '../hooks/useAuth';
import styles from './ExcelExporter.module.css';

export function ExcelExporter({ sources, filenamePrefix = 'respaldo' }) {
  const { role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('mes-actual');

  if (role !== 'manager' && role !== 'owner') return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      const { startDate, endDate, label } = getPeriodRange(period);
      const collections = {};

      for (const src of sources) {
        let q;
        if (src.dateField && startDate && endDate) {
          q = query(
            collection(db, src.collection),
            where(src.dateField, '>=', Timestamp.fromDate(startDate)),
            where(src.dateField, '<', Timestamp.fromDate(endDate))
          );
        } else {
          q = collection(db, src.collection);
        }
        const snap = await getDocs(q);
        collections[src.name] = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          ...convertTimestamps(d.data())
        }));
      }

      const filename = filenamePrefix + '-' + label;
      exportToExcel(collections, filename);
    } catch (err) {
      alert('Error al exportar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        disabled={loading}
        className={styles.select}
      >
        <option value="mes-actual">Mes actual</option>
        <option value="mes-anterior">Mes anterior</option>
        <option value="ultimos-30">Ultimos 30 dias</option>
        <option value="todo">Todo el historico</option>
      </select>
      <button onClick={handleExport} disabled={loading} className={styles.btn}>
        {loading ? 'Generando...' : 'Descargar respaldo Excel'}
      </button>
    </div>
  );
}

function getPeriodRange(period) {
  const now = new Date();
  switch (period) {
    case 'mes-actual': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const label = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      return { startDate: start, endDate: end, label };
    }
    case 'mes-anterior': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      const m = now.getMonth() === 0 ? 12 : now.getMonth();
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const label = y + '-' + String(m).padStart(2, '0');
      return { startDate: start, endDate: end, label };
    }
    case 'ultimos-30': {
      const end = new Date();
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: start, endDate: end, label: 'ultimos-30-dias' };
    }
    default:
      return { startDate: null, endDate: null, label: 'completo' };
  }
}

function convertTimestamps(data) {
  const result = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      result[k] = v.toDate().toISOString();
    }
  }
  return result;
}
