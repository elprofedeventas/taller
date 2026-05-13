import styles from './StatusBadge.module.css';
import { STATUS_LABEL } from '../../services/workOrders';

export default function StatusBadge({ status }) {
  const cls = styles[status] || '';
  return (
    <span className={`${styles.badge} ${cls}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}
