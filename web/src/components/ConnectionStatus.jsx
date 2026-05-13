// components/ConnectionStatus.jsx
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import styles from './ConnectionStatus.module.css';

export function ConnectionStatus({ pendingCount = 0, onForceSync }) {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  if (!isOnline) {
    return (
      <div className={${styles.bar} ${styles.offline}}>
        Sin conexion
        {pendingCount > 0 && (
          <span className={styles.count}>
            - {pendingCount} {pendingCount === 1 ? 'cambio en cola' : 'cambios en cola'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={${styles.bar} ${styles.syncing}}>
      Sincronizando
      <span className={styles.count}>
        - {pendingCount} {pendingCount === 1 ? 'cambio' : 'cambios'}
      </span>
      {onForceSync && (
        <button onClick={onForceSync} className={styles.btn}>
          Forzar
        </button>
      )}
    </div>
  );
}
