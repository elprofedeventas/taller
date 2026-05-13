import StatusBadge from './StatusBadge';
import styles from './OTSummary.module.css';

/**
 * Resumen de OT para usar en ColaOT (lista) y como header de OTDetail.
 * onClick opcional: si se pasa, el contenedor es clickable.
 */
export default function OTSummary({ ot, onClick }) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`${styles.summary} ${clickable ? styles.clickable : ''}`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e => { if (e.key === 'Enter') onClick(); }) : undefined}
    >
      <div className={styles.left}>
        <span className={styles.placa}>{ot.vehiclePlaca}</span>
        <span className={styles.modelo}>
          {ot.vehicleMarca} {ot.vehicleModelo}
        </span>
        <span className={styles.client}>{ot.clientName}</span>
      </div>
      <div className={styles.right}>
        <StatusBadge status={ot.status} />
        <span className={styles.mechanic}>
          {ot.mechanicName || 'Sin asignar'}
        </span>
      </div>
    </div>
  );
}
