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
  const [encuestas, setEncuestas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marcandoId, setMarcandoId] = useState(null);
  // Calificacion seleccionada por OT en el inline form (opcional).
  const [calificaciones, setCalificaciones] = useState({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const ahora = new Date();

      // 1. Recordatorios: fechaEstimada <= hoy + 7 dias, sin recordatorio enviado.
      const limiteRec = new Date(ahora);
      limiteRec.setDate(limiteRec.getDate() + 7);
      limiteRec.setHours(23, 59, 59, 999);
      const qRec = query(
        collection(db, 'workOrders'),
        where('proximoMantenimiento.recordatorioEnviado', '==', false),
        where('proximoMantenimiento.fechaEstimada', '<=', Timestamp.fromDate(limiteRec)),
        orderBy('proximoMantenimiento.fechaEstimada', 'asc')
      );

      // 2. Encuestas: entregadas hace >=24h y <=7 dias, sin encuesta enviada.
      const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
      const qEnc = query(
        collection(db, 'workOrders'),
        where('status', '==', 'entregado'),
        where('encuestaEnviada', '==', false),
        where('closedAt', '>=', Timestamp.fromDate(hace7d)),
        where('closedAt', '<=', Timestamp.fromDate(hace24h)),
        orderBy('closedAt', 'desc')
      );

      const [snapRec, snapEnc] = await Promise.all([getDocs(qRec), getDocs(qEnc)]);
      setItems(snapRec.docs.map(d => ({ id: d.id, ...d.data() })));
      setEncuestas(snapEnc.docs.map(d => ({ id: d.id, ...d.data() })));
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

  async function marcarEncuestaEnviada(ot) {
    if (marcandoId) return;
    setMarcandoId(ot.id);
    try {
      const calif = Number(calificaciones[ot.id]);
      const patch = withActor(auth.session, {
        encuestaEnviada: true,
        encuestaEnviadaAt: Timestamp.now()
      });
      if (calif >= 1 && calif <= 5) {
        patch.encuesta = {
          calificacion: calif,
          fechaRespuesta: Timestamp.now(),
          registradoPor: auth.session.userId
        };
      }
      await updateDoc(doc(db, 'workOrders', ot.id), patch);
      setEncuestas(prev => prev.filter(x => x.id !== ot.id));
      setCalificaciones(prev => {
        const { [ot.id]: _, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setMarcandoId(null);
    }
  }

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

  const totalPendientes = items.length + encuestas.length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Contactar</h1>
        <span className={styles.counter}>
          {totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'}
        </span>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {loading && <p className={styles.empty}>Cargando...</p>}

      {!loading && (
        <>
          {/* ============ Seccion 1: Recordatorios de mantenimiento ============ */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Recordatorios de mantenimiento
              <span className={styles.sectionCount}>({items.length})</span>
            </h2>
            <p className={styles.hint}>
              Clientes que les corresponde mantenimiento esta semana o ya estan vencidos.
              Marcalos como contactados despues de enviar el WhatsApp.
            </p>

            {items.length === 0 ? (
              <p className={styles.empty}>Sin recordatorios pendientes.</p>
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
          </section>

          {/* ============ Seccion 2: Encuestas de satisfaccion ============ */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Encuestas de satisfaccion
              <span className={styles.sectionCount}>({encuestas.length})</span>
            </h2>
            <p className={styles.hint}>
              Clientes que recibieron su vehiculo hace 1 a 7 dias y no se les ha
              enviado la encuesta. Opcionalmente registra la calificacion que
              respondieron.
            </p>

            {encuestas.length === 0 ? (
              <p className={styles.empty}>Sin encuestas pendientes.</p>
            ) : (
              <ul className={styles.list}>
                {encuestas.map(ot => {
                  const cerradoEn = tsToDate(ot.closedAt);
                  const diasDesdeCierre = diasDesde(cerradoEn);

                  return (
                    <li key={ot.id} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardCliente}>{ot.clientName}</span>
                        <span className={styles.cardPlaca}>{ot.vehiclePlaca}</span>
                      </div>
                      <div className={styles.cardMeta}>
                        {ot.vehicleMarca} {ot.vehicleModelo}
                      </div>
                      <div className={styles.cardMeta}>
                        {ot.problema || '(sin descripcion)'}
                      </div>
                      <div className={styles.cardFecha}>
                        Entregado: <strong>{fmtDate(cerradoEn)}</strong>
                        {diasDesdeCierre != null && (
                          <span className={styles.cardMetaDim}>
                            {' '}(hace {diasDesdeCierre} dia{diasDesdeCierre === 1 ? '' : 's'})
                          </span>
                        )}
                      </div>

                      <div className={styles.cardActions}>
                        <WhatsAppButton
                          phone={ot.clientPhone}
                          templates={templatesByIds(['encuesta_satisfaccion'])}
                          variables={{
                            clientName: ot.clientName,
                            vehiclePlaca: ot.vehiclePlaca,
                            vehicleMarca: ot.vehicleMarca,
                            vehicleModelo: ot.vehicleModelo
                          }}
                          context={{ collection: 'workOrders', docId: ot.id, action: 'encuesta' }}
                          buttonLabel="Enviar encuesta"
                          auth={auth}
                        />
                        <label className={styles.califSelect}>
                          Calificacion respondida:
                          <select
                            value={calificaciones[ot.id] || ''}
                            onChange={e => setCalificaciones(prev => ({ ...prev, [ot.id]: e.target.value }))}
                            disabled={marcandoId === ot.id}
                          >
                            <option value="">Sin registrar</option>
                            <option value="1">1 estrella</option>
                            <option value="2">2 estrellas</option>
                            <option value="3">3 estrellas</option>
                            <option value="4">4 estrellas</option>
                            <option value="5">5 estrellas</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className={styles.markBtn}
                          onClick={() => marcarEncuestaEnviada(ot)}
                          disabled={marcandoId === ot.id}
                        >
                          {marcandoId === ot.id ? 'Marcando...' : 'Marcar como enviada'}
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
          </section>
        </>
      )}
    </div>
  );
}
