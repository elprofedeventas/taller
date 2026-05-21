import { useState, useEffect } from 'react';
import { getPayment } from '../../services/payments';
import { getOT, calculateTotals } from '../../services/workOrders';
import { getTallerConfig } from '../../services/config';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { templatesByIds } from '../../services/whatsapp';
import BotonFacturar from '../facturacion/BotonFacturar';
import styles from './Comprobante.module.css';

const FORMA_PAGO_LABEL = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta'
};

function formatDate(ts) {
  if (!ts) return '—';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Comprobante({ paymentId, navigate, auth }) {
  const [payment, setPayment] = useState(null);
  const [ot, setOT] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const p = await getPayment(paymentId);
        if (cancelled) return;
        if (!p) {
          setError('Pago no encontrado.');
          return;
        }
        const [o, c] = await Promise.all([
          getOT(p.workOrderId),
          getTallerConfig()
        ]);
        if (cancelled) return;
        setPayment(p);
        setOT(o);
        setConfig(c);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [paymentId]);

  if (loading) return <div className={styles.container}><p>Cargando comprobante...</p></div>;
  if (error) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.back} onClick={() => navigate('caja')}>
          &larr; Volver a Caja
        </button>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }
  if (!payment || !ot) return null;

  const totals = calculateTotals(ot.tasks || [], ot.parts || []);

  const tallerName = config?.name || '[Nombre del taller]';
  const tallerAddress = config?.address || '[Direccion del taller]';
  const tallerPhone = config?.phone || '[Telefono del taller]';

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => window.print()}
        >
          Imprimir
        </button>
        <WhatsAppButton
          phone={ot.clientPhone}
          templates={templatesByIds(['gracias_pago'])}
          variables={{
            clientName: ot.clientName,
            vehiclePlaca: ot.vehiclePlaca,
            monto: Number(payment.monto).toFixed(2)
          }}
          context={{ collection: 'payments', docId: payment.id }}
          buttonLabel="Enviar por WhatsApp"
          auth={auth}
        />
        <BotonFacturar
          auth={auth}
          receptor={{
            tipoId: '05',
            identificacion: '',
            razonSocial: ot.clientName || '',
            direccion: '',
            email: ''
          }}
          items={[{
            codigo: ot.id?.slice(-6) || '001',
            descripcion: `Servicio mecanico - OT ${ot.id?.slice(-6) || ''} - ${ot.vehiclePlaca}`,
            cantidad: '1',
            precioUnitario: String(payment.monto || 0),
            descuento: '0',
            tieneIva: true
          }]}
          workOrderId={ot.id}
          paymentId={payment.id}
          label="Emitir Factura SRI"
          variant="secondary"
        />
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => navigate('caja')}
        >
          Volver a Caja
        </button>
      </div>

      <article className={styles.printArea} data-printable>
        <header className={styles.printHeader}>
          <h1 className={styles.tallerName}>{tallerName}</h1>
          <p className={styles.tallerInfo}>{tallerAddress}</p>
          <p className={styles.tallerInfo}>Tel. {tallerPhone}</p>
        </header>

        <div className={styles.docMeta}>
          <div>
            <strong>Comprobante interno</strong>
          </div>
          <div>{formatDate(payment.paidAt)}</div>
        </div>

        <div className={styles.fiscalNote}>
          Este documento no tiene valor fiscal. No reemplaza factura SRI.
        </div>

        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Cliente</h2>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Nombre</span>
            <span>{ot.clientName}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Telefono</span>
            <span>{formatPhoneForDisplay(ot.clientPhone)}</span>
          </div>
        </section>

        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Vehiculo</h2>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Placa</span>
            <span>{ot.vehiclePlaca}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Marca / Modelo</span>
            <span>{ot.vehicleMarca} {ot.vehicleModelo}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Mecanico</span>
            <span>{ot.mechanicName || '—'}</span>
          </div>
        </section>

        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Detalle</h2>

          {ot.tasks && ot.tasks.length > 0 && (
            <>
              <h3 className={styles.subBlockTitle}>Mano de obra</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Descripcion</th>
                    <th>Horas</th>
                    <th>P. unit</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {ot.tasks.map((t, i) => (
                    <tr key={i}>
                      <td>{t.descripcion || '—'}</td>
                      <td className={styles.numCell}>{t.horas}</td>
                      <td className={styles.numCell}>${Number(t.precioUnit || 0).toFixed(2)}</td>
                      <td className={styles.numCell}>${Number(t.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.subtotal}>
                Subtotal mano de obra: <strong>${totals.totalLabor.toFixed(2)}</strong>
              </div>
            </>
          )}

          {ot.parts && ot.parts.length > 0 && (
            <>
              <h3 className={styles.subBlockTitle}>Repuestos</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Descripcion</th>
                    <th>Cant.</th>
                    <th>P. unit</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {ot.parts.map((p, i) => (
                    <tr key={i}>
                      <td>{p.descripcion || '—'}</td>
                      <td className={styles.numCell}>{p.cantidad}</td>
                      <td className={styles.numCell}>${Number(p.precioUnit || 0).toFixed(2)}</td>
                      <td className={styles.numCell}>${Number(p.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.subtotal}>
                Subtotal repuestos: <strong>${totals.totalParts.toFixed(2)}</strong>
              </div>
            </>
          )}
        </section>

        <section className={styles.totalBlock}>
          <div className={styles.totalLine}>
            <span>Total cobrado</span>
            <span className={styles.totalValue}>
              ${Number(payment.monto).toFixed(2)}
            </span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Forma de pago</span>
            <span>{FORMA_PAGO_LABEL[payment.formaPago] || payment.formaPago}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Recibido por</span>
            <span>{payment.receivedByName}</span>
          </div>
        </section>

        <footer className={styles.footer}>
          Gracias por su confianza.
        </footer>
      </article>
    </div>
  );
}
