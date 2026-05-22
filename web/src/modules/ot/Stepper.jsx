// modules/ot/Stepper.jsx
// Linea de etapas para una OT. Muestra estado actual, fechas de inicio
// de cada etapa alcanzada, y duracion entre etapas (o "en curso" para
// la etapa actual).
//
// Fuente de datos: ot.statusHistory = [{status, at, by, byName}].
// Fallback para OTs viejas sin historial: usa ot.openedAt como inicio
// de 'recibido' y deja las demas etapas sin datos.

import { STATUS_ORDER, STATUS_LABEL } from '../../services/workOrders';
import styles from './Stepper.module.css';

function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
}

function fmtDuration(ms) {
  if (ms == null || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const mm = min % 60;
  if (hr < 24) return mm > 0 ? `${hr}h ${mm}m` : `${hr}h`;
  const d = Math.floor(hr / 24);
  const hh = hr % 24;
  return hh > 0 ? `${d}d ${hh}h` : `${d}d`;
}

function fmtTime(date) {
  if (!date) return '';
  return date.toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function buildHistory(ot) {
  if (Array.isArray(ot.statusHistory) && ot.statusHistory.length > 0) {
    return ot.statusHistory;
  }
  // OT vieja sin historial: deducir 'recibido' desde openedAt/createdAt.
  const opened = tsToDate(ot.openedAt) || tsToDate(ot.createdAt);
  if (!opened) return [];
  return [{ status: 'recibido', at: opened }];
}

export default function Stepper({ ot }) {
  const history = buildHistory(ot);

  // OT cancelada: render alternativo.
  if (ot.status === 'cancelado') {
    const lastEntry = history.length ? tsToDate(history[history.length - 1].at) : null;
    return (
      <div className={styles.cancelado}>
        <span className={styles.canceladoBadge}>OT CANCELADA</span>
        {lastEntry && <span className={styles.canceladoFecha}>{fmtTime(lastEntry)}</span>}
      </div>
    );
  }

  // Para cada status del flujo, la PRIMERA aparicion en el historial.
  const firstByStatus = {};
  history.forEach(h => {
    if (!firstByStatus[h.status]) firstByStatus[h.status] = h;
  });

  const now = Date.now();
  const currentIdx = STATUS_ORDER.indexOf(ot.status);

  const stages = STATUS_ORDER.map((status, idx) => {
    const entry = firstByStatus[status];
    const startDate = entry ? tsToDate(entry.at) : null;

    // Duracion: hasta la fecha de la siguiente etapa alcanzada, o si es
    // la etapa actual, hasta now.
    let durationMs = null;
    if (startDate) {
      let nextDate = null;
      for (let j = idx + 1; j < STATUS_ORDER.length; j++) {
        const e = firstByStatus[STATUS_ORDER[j]];
        if (e) { nextDate = tsToDate(e.at); break; }
      }
      if (nextDate) durationMs = nextDate.getTime() - startDate.getTime();
      else if (status === ot.status) durationMs = now - startDate.getTime();
    }

    return {
      status,
      label: STATUS_LABEL[status],
      reached: idx <= currentIdx,
      isCurrent: idx === currentIdx,
      startDate,
      durationMs
    };
  });

  return (
    <div className={styles.container}>
      {stages.map((s, i) => {
        const isLast = i === stages.length - 1;
        const dotClass = s.isCurrent
          ? `${styles.dot} ${styles.dotCurrent}`
          : s.reached
            ? `${styles.dot} ${styles.dotDone}`
            : `${styles.dot} ${styles.dotPending}`;
        const lineClass = s.reached && stages[i + 1]?.reached
          ? `${styles.line} ${styles.lineDone}`
          : styles.line;

        return (
          <div
            key={s.status}
            className={isLast ? `${styles.stage} ${styles.stageLast}` : styles.stage}
          >
            <div className={styles.dotWrap}>
              <div className={dotClass}>
                {s.reached && !s.isCurrent ? '✓' : ''}
              </div>
              {!isLast && <div className={lineClass} />}
            </div>
            <div className={styles.stageLabel}>
              <div className={styles.stageName}>{s.label}</div>
              {s.startDate ? (
                <div className={styles.stageTime}>{fmtTime(s.startDate)}</div>
              ) : (
                <div className={styles.stageTime}>—</div>
              )}
              {s.durationMs != null && (
                <div className={s.isCurrent ? styles.durActive : styles.dur}>
                  {s.isCurrent
                    ? `${fmtDuration(s.durationMs)} en curso`
                    : fmtDuration(s.durationMs)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
