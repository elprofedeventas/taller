// modules/contactar/ContactarList.jsx
// Bandeja de recordatorios de mantenimiento. Muestra las OTs cuyo
// proximoMantenimiento.fechaEstimada esta dentro de los proximos 7 dias
// (o ya paso), siempre que recordatorioEnviado === false.
// Cada tarjeta tiene WhatsApp con template precargado y un boton para
// marcar como contactado (saca la tarjeta de la lista).

import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, getDocs, doc, updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../services/firestore';
import { withActor } from '../../services/auth';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { templatesByIds } from '../../services/whatsapp';
import styles from './ContactarList.module.css';

function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function fmtDate(date) {
  if (!date) return '-';
  return date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasDesde(date) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ContactarList({ auth, navigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marcandoId, setMarcandoId] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Plazo: OTs cuya fechaEstimada <= hoy + 7 dias, sin recordatorio enviado
      const limite = new Date();
      limite.setDate(limite.getDate() + 7);
      limite.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'workOrders'),
        where('proximoMantenimiento.recordatorioEnviado', '==', false),
        where('proximoMantenimiento.fechaEstimada', '<=', Timestamp.fromDate(limite)),
        orderBy('proximoMantenimiento.fechaEstimada', 'asc')
      );
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function marcarContactado(ot) {
    if (marcandoId) return;
    setMarcandoId(ot.id);
    try {
      await updateDoc(doc(db, 'workOrders', ot.id), withActor(auth.session, {
        'proximoMantenimiento.recordatorioEnviado': true,
        'proximoMantenimiento.recordatorioEnviadoAt': Timestamp.now()
      }));
      setItems(prev => prev.filter(x => x.id !== ot.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setMarcandoId(null);
    }
  }

  if (auth.role === 'mechanic') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Contactar</h1>
        <span className={styles.counter}>
          {items.length} pendiente{items.length === 1 ? '' : 's'}
        </span>
      </header>

      <p className={styles.hint}>
        Clientes que les corresponde mantenimiento esta semana o ya estan vencidos.
        Marcalos como contactados despues de enviar el WhatsApp para que salgan de la lista.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          No hay recordatorios pendientes. Vuelve manana.
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map(ot => {
            const fechaEst = tsToDate(ot.proximoMantenimiento?.fechaEstimada);
            const cerradoEn = tsToDate(ot.closedAt);
            const diasDesdeCierre = diasDesde(cerradoEn);
            const vencido = fechaEst && fechaEst.getTime() < Date.now();

            return (
              <li
                key={ot.id}
                className={vencido ? `${styles.card} ${styles.cardVencido}` : styles.card}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardCliente}>{ot.clientName}</span>
                  <span className={styles.cardPlaca}>{ot.vehiclePlaca}</span>
                </div>
                <div className={styles.cardMeta}>
                  {ot.vehicleMarca} {ot.vehicleModelo}
                </div>
                <div className={styles.cardMeta}>
                  Ultimo servicio: {ot.problema || '(sin descripcion)'}
                  {diasDesdeCierre != null && (
                    <span className={styles.cardMetaDim}>
                      {' '}(hace {diasDesdeCierre} dia{diasDesdeCierre === 1 ? '' : 's'})
                    </span>
                  )}
                </div>
                <div className={styles.cardFecha}>
                  Mantenimiento estimado: <strong>{fmtDate(fechaEst)}</strong>
                  {vencido && <span className={styles.vencidoBadge}>Vencido</span>}
                </div>

                <div className={styles.cardActions}>
                  <WhatsAppButton
                    phone={ot.clientPhone}
                    templates={templatesByIds(['recordatorio_mantenimiento'])}
                    variables={{
                      clientName: ot.clientName,
                      vehiclePlaca: ot.vehiclePlaca,
                      vehicleMarca: ot.vehicleMarca,
                      vehicleModelo: ot.vehicleModelo
                    }}
                    context={{ collection: 'workOrders', docId: ot.id, action: 'recordatorio' }}
                    buttonLabel="Enviar WhatsApp"
                    auth={auth}
                  />
                  <button
                    type="button"
                    className={styles.markBtn}
                    onClick={() => marcarContactado(ot)}
                    disabled={marcandoId === ot.id}
                  >
                    {marcandoId === ot.id ? 'Marcando...' : 'Marcar como contactado'}
                  </button>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => navigate('ot-detail', { id: ot.id })}
                  >
                    Ver OT
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
