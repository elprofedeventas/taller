// modules/configuracion/CatalogoSeccion.jsx
// Sub-seccion en ConfiguracionForm: tabs Servicios / Repuestos.
// CRUD basico contra services/catalogo.js. Owner/manager pueden editar.

import { useEffect, useState } from 'react';
import {
  listCatalogo, createCatalogoItem, updateCatalogoItem, deleteCatalogoItem
} from '../../services/catalogo';
import styles from './CatalogoSeccion.module.css';

const TABS = [
  { value: 'mano_obra', label: 'Servicios (mano de obra)' },
  { value: 'repuesto', label: 'Repuestos' }
];

export default function CatalogoSeccion({ auth }) {
  const [tab, setTab] = useState('mano_obra');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form inline para nuevo item
  const [newNombre, setNewNombre] = useState('');
  const [newPrecio, setNewPrecio] = useState('');
  const [saving, setSaving] = useState(false);

  // Edicion inline
  const [editingId, setEditingId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPrecio, setEditPrecio] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await listCatalogo(tab);
      setItems(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleAdd() {
    if (saving) return;
    if (!newNombre.trim()) {
      setError('Nombre requerido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCatalogoItem(auth.session, {
        nombre: newNombre,
        precio: Number(newPrecio) || 0,
        tipo: tab
      });
      setNewNombre('');
      setNewPrecio('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditNombre(item.nombre);
    setEditPrecio(String(item.precio || 0));
  }

  async function handleSaveEdit(id) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCatalogoItem(auth.session, id, {
        nombre: editNombre,
        precio: Number(editPrecio) || 0
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Eliminar este item del catalogo?')) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCatalogoItem(auth.session, id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.container}>
      <h2 className={styles.section}>Catalogo</h2>
      <p className={styles.hint}>
        Servicios y repuestos preconfigurados con precio sugerido.
        Disponibles en el autocompletar de las OTs.
      </p>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.value}
            type="button"
            className={tab === t.value ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="Nombre del item"
          value={newNombre}
          onChange={e => setNewNombre(e.target.value)}
          disabled={saving}
        />
        <input
          type="number"
          className={`${styles.input} ${styles.inputPrecio}`}
          placeholder="Precio"
          value={newPrecio}
          onChange={e => setNewPrecio(e.target.value)}
          step="0.01"
          min="0"
          disabled={saving}
        />
        <button
          type="button"
          className={styles.addBtn}
          onClick={handleAdd}
          disabled={saving || !newNombre.trim()}
        >
          + Agregar
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Sin items en este catalogo.</p>
      ) : (
        <ul className={styles.list}>
          {items.map(item => {
            const isEditing = editingId === item.id;
            return (
              <li key={item.id} className={styles.item}>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      className={styles.input}
                      value={editNombre}
                      onChange={e => setEditNombre(e.target.value)}
                    />
                    <input
                      type="number"
                      className={`${styles.input} ${styles.inputPrecio}`}
                      value={editPrecio}
                      onChange={e => setEditPrecio(e.target.value)}
                      step="0.01"
                      min="0"
                    />
                    <button
                      type="button"
                      className={styles.saveBtn}
                      onClick={() => handleSaveEdit(item.id)}
                      disabled={saving}
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className={styles.itemNombre}>{item.nombre}</span>
                    <span className={styles.itemPrecio}>
                      ${Number(item.precio || 0).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() => startEdit(item)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(item.id)}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
