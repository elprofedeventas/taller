import { useState, useEffect } from 'react';
import { listAllUsers } from '../../services/users';
import styles from './UsuariosList.module.css';

const ROLE_LABEL = {
  owner: 'Owner',
  manager: 'Manager',
  recepcionista: 'Recepcionista',
  mechanic: 'Mecanico'
};

export default function UsuariosList({ navigate, auth }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await listAllUsers();
        if (cancelled) return;
        setUsers(list);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (auth.role !== 'owner') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido. Solo el owner puede gestionar usuarios.</p>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.container}><p>Cargando...</p></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Usuarios</h1>
        <button
          type="button"
          className={styles.newButton}
          onClick={() => navigate('usuario-form')}
        >
          Nuevo usuario
        </button>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {users.length === 0 ? (
        <p className={styles.empty}>No hay usuarios registrados.</p>
      ) : (
        <ul className={styles.list}>
          {users.map(u => (
            <li
              key={u.id}
              className={styles.item}
              role="button"
              tabIndex={0}
              onClick={() => navigate('usuario-form', { id: u.id })}
              onKeyDown={e => {
                if (e.key === 'Enter') navigate('usuario-form', { id: u.id });
              }}
            >
              <div className={styles.itemMain}>
                <span className={styles.itemName}>
                  {u.name}
                  {u.id === auth.userId && (
                    <span className={styles.youTag}>(tu)</span>
                  )}
                </span>
                <span className={styles.itemRole}>
                  {ROLE_LABEL[u.role] || u.role}
                </span>
              </div>
              <span
                className={`${styles.statusBadge} ${u.active === false ? styles.statusInactive : styles.statusActive}`}
              >
                {u.active === false ? 'Inactivo' : 'Activo'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
