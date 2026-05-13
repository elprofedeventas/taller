// components/ExcelImporter.jsx
import { useState } from 'react';
import { readExcelFile, mapExcelToFirestore } from '../services/excel';
import styles from './ExcelImporter.module.css';

export function ExcelImporter({
  columnMap,
  transforms = {},
  validators = {},
  onConfirm,
  requiredColumns = [],
  templateUrl = null
}) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('upload');

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setLoading(true);
    setErrors([]);

    try {
      const rows = await readExcelFile(f);

      const firstRow = rows[0] || {};
      const missing = requiredColumns.filter(col => !(col in firstRow));
      if (missing.length > 0) {
        setErrors([{ row: 0, error: 'Faltan columnas: ' + missing.join(', ') }]);
        setLoading(false);
        return;
      }

      const { mapped, errors: mapErrors } = mapExcelToFirestore(
        rows, columnMap, { transforms, validators }
      );

      setFile(f);
      setPreview(mapped);
      setErrors(mapErrors);
      setStep('preview');
    } catch (err) {
      setErrors([{ row: 0, error: err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || preview.length === 0) return;
    setLoading(true);
    try {
      await onConfirm(preview);
      setStep('done');
    } catch (err) {
      setErrors([{ row: 0, error: 'Error al guardar: ' + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setErrors([]);
    setStep('upload');
  };

  if (step === 'done') {
    return (
      <div className={styles.container}>
        <div className={styles.success}>
          Importacion completada: {preview.length} registros guardados.
        </div>
        <button onClick={handleReset} className={styles.btn}>
          Importar otro archivo
        </button>
      </div>
    );
  }

  if (step === 'preview') {
    const headers = preview.length > 0 ? Object.keys(preview[0]) : [];
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Vista previa: {preview.length} registros</h3>

        {errors.length > 0 && (
          <div className={styles.errors}>
            <strong>{errors.length} {errors.length === 1 ? 'fila descartada' : 'filas descartadas'}:</strong>
            <ul>
              {errors.slice(0, 5).map((e, i) => (
                <li key={i}>Fila {e.row}: {e.error}</li>
              ))}
              {errors.length > 5 && <li>... y {errors.length - 5} mas</li>}
            </ul>
          </div>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {preview.slice(0, 10).map((row, i) => (
                <tr key={i}>
                  {headers.map(h => <td key={h}>{String(row[h] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 10 && (
            <p className={styles.more}>...y {preview.length - 10} mas</p>
          )}
        </div>

        <div className={styles.actions}>
          <button onClick={handleReset} className={styles.btnSecondary}>Cancelar</button>
          <button
            onClick={handleConfirm}
            disabled={loading || preview.length === 0}
            className={styles.btn}
          >
            {loading ? 'Guardando...' : 'Confirmar e importar ' + preview.length + ' registros'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {templateUrl && (
        <p className={styles.help}>
          Descarga la <a href={templateUrl} download>plantilla Excel</a> para asegurar el formato correcto.
        </p>
      )}

      <label className={styles.dropzone}>
        <input type="file" accept=".xlsx" onChange={handleFile} disabled={loading} />
        <span>{loading ? 'Procesando...' : 'Seleccionar archivo .xlsx'}</span>
      </label>

      {errors.length > 0 && (
        <div className={styles.errors}>
          {errors.map((e, i) => <p key={i}>{e.error}</p>)}
        </div>
      )}

      {requiredColumns.length > 0 && (
        <p className={styles.help}>
          El archivo debe tener las columnas: <strong>{requiredColumns.join(', ')}</strong>
        </p>
      )}
    </div>
  );
}
