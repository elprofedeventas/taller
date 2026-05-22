// modules/facturacion/ModalNotaCredito.jsx
// Modal para emitir una nota de credito sobre una factura AUTORIZADA.
// Precarga receptor + items de la factura original; permite ajustar
// cantidades, precios y/o eliminar items para devoluciones parciales.

import { useState, useEffect, useMemo } from 'react';
import { emitirNotaCredito } from '../../services/facturas';
import styles from './ModalNotaCredito.module.css';

// Razones de modificacion sugeridas (texto libre — SRI no enumera, pero
// estas son las mas comunes en sistemas contables EC).
const RAZONES_SUGERIDAS = [
  'Devolucion de bienes',
  'Descuento',
  'Anulacion',
  'Ajuste por error',
  'Cambio de cliente',
  'Otra razon'
];

const fmt = (val) => parseFloat(val || 0).toFixed(2);

function calcTotales(items) {
  let subtotal = 0;
  let descuento = 0;
  let iva = 0;
  for (const item of items) {
    const sub = parseFloat(item.cantidad || 0) * parseFloat(item.precioUnitario || 0)
                - parseFloat(item.descuento || 0);
    subtotal += sub;
    descuento += parseFloat(item.descuento || 0);
    if (item.tieneIva) iva += sub * 0.15;
  }
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    descuento: parseFloat(descuento.toFixed(2)),
    iva: parseFloat(iva.toFixed(2)),
    total: parseFloat((subtotal + iva).toFixed(2))
  };
}

export default function ModalNotaCredito({
  auth,
  factura,           // doc factura completo
  onCerrar,
  onNotaCreditoEmitida = null
}) {
  const [items, setItems] = useState(() =>
    (factura.items || []).map(it => ({ ...it }))
  );
  const [razon, setRazon] = useState(RAZONES_SUGERIDAS[0]);
  const [motivoCustom, setMotivoCustom] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [errorMensajes, setErrorMensajes] = useState([]);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const totales = useMemo(() => calcTotales(items), [items]);

  function actualizarItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  }

  function eliminarItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function validar() {
    if (!items.length) return 'Debe incluir al menos un item.';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.descripcion?.trim()) return `Item ${i + 1}: falta descripcion.`;
      if (parseFloat(it.cantidad) <= 0) return `Item ${i + 1}: cantidad invalida.`;
      if (parseFloat(it.precioUnitario) <= 0) return `Item ${i + 1}: precio invalido.`;
    }
    const motivoFinal = (razon === 'Otra razon' ? motivoCustom : razon).trim();
    if (!motivoFinal) return 'Indica el motivo de la nota credito.';
    return null;
  }

  async function emitir() {
    const err = validar();
    if (err) {
      setError(err);
      setErrorMensajes([]);
      return;
    }
    const motivoFinal = (razon === 'Otra razon' ? motivoCustom : razon).trim();
    setError(null);
    setErrorMensajes([]);
    setEnviando(true);
    try {
      const data = await emitirNotaCredito(auth.session, {
        facturaOriginalId: factura.id,
        razonModificacion: razon,
        motivo: motivoFinal,
        items,
        descripcion
      });
      setResultado(data);
      if (onNotaCreditoEmitida) onNotaCreditoEmitida(data);
    } catch (e) {
      setError(e.message);
      setErrorMensajes(Array.isArray(e.mensajes) ? e.mensajes : []);
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    setEnviando(false);
    setError(null);
    setErrorMensajes([]);
    setResultado(null);
    if (onCerrar) onCerrar();
  }

  return (
    <>
      <div className={styles.overlay} onClick={enviando ? undefined : cerrar} />
      <div className={styles.panel} role="dialog" aria-labelledby="modal-nc-title">
        <header className={styles.header}>
          <h2 id="modal-nc-title" className={styles.title}>
            {resultado ? 'Nota credito autorizada' : 'Emitir nota credito'}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={cerrar}
            disabled={enviando}
            aria-label="Cerrar"
          >
            &times;
          </button>
        </header>

        <div className={styles.body}>
          {resultado ? (
            <div className={styles.exito}>
              <p className={styles.exitoMsg}>
                Nota credito {resultado.numeroNotaCredito} autorizada por el SRI.
              </p>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Numero</span>
                <span>{resultado.numeroNotaCredito}</span>
              </div>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Clave de acceso</span>
                <code className={styles.claveAcceso}>{resultado.claveAcceso}</code>
              </div>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Total</span>
                <span><strong>${fmt(resultado.totales?.total)}</strong></span>
              </div>
              <p className={styles.hint}>
                La factura {factura.numeroFactura} quedo marcada como anulada
                por esta nota credito.
              </p>
            </div>
          ) : (
            <>
              {/* Factura original (read-only) */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Factura modificada</h3>
                <div className={styles.kvGrid}>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Numero</span>
                    <span><strong>{factura.numeroFactura}</strong></span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Fecha emision</span>
                    <span>{factura.fechaEmision || '-'}</span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Receptor</span>
                    <span>{factura.receptor?.razonSocial || '-'}</span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Total original</span>
                    <span>${fmt(factura.totales?.total)}</span>
                  </div>
                </div>
              </section>

              {/* Motivo */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Motivo de la modificacion</h3>
                <label className={styles.label}>
                  Razon
                  <select
                    className={styles.input}
                    value={razon}
                    onChange={e => setRazon(e.target.value)}
                    disabled={enviando}
                  >
                    {RAZONES_SUGERIDAS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
                {razon === 'Otra razon' && (
                  <label className={styles.label}>
                    Especifica el motivo
                    <input
                      type="text"
                      className={styles.input}
                      value={motivoCustom}
                      onChange={e => setMotivoCustom(e.target.value)}
                      disabled={enviando}
                      placeholder="Texto libre que aparece en el XML del SRI"
                    />
                  </label>
                )}
              </section>

              {/* Items: editables + eliminables */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  Items a modificar
                  <span className={styles.sectionHint}>
                    {' '}(ajusta cantidades/precios o elimina items para devoluciones parciales)
                  </span>
                </h3>

                {items.length === 0 && (
                  <p className={styles.empty}>
                    No quedan items. Agrega al menos uno o cancela.
                  </p>
                )}

                {items.map((item, idx) => (
                  <div key={idx} className={styles.itemCard}>
                    <div className={styles.itemRow}>
                      <label className={`${styles.label} ${styles.colDesc}`}>
                        Descripcion
                        <input
                          type="text"
                          className={styles.input}
                          value={item.descripcion}
                          onChange={e => actualizarItem(idx, 'descripcion', e.target.value)}
                          disabled={enviando}
                        />
                      </label>
                      <label className={`${styles.label} ${styles.colCode}`}>
                        Codigo
                        <input
                          type="text"
                          className={styles.input}
                          value={item.codigo || ''}
                          onChange={e => actualizarItem(idx, 'codigo', e.target.value)}
                          disabled={enviando}
                        />
                      </label>
                    </div>
                    <div className={styles.itemSubrow}>
                      <label className={`${styles.label} ${styles.colNum}`}>
                        Cantidad
                        <input
                          type="number"
                          className={styles.input}
                          value={item.cantidad}
                          onChange={e => actualizarItem(idx, 'cantidad', e.target.value)}
                          disabled={enviando}
                          step="0.01"
                          min="0"
                        />
                      </label>
                      <label className={`${styles.label} ${styles.colNum}`}>
                        P. Unitario
                        <input
                          type="number"
                          className={styles.input}
                          value={item.precioUnitario}
                          onChange={e => actualizarItem(idx, 'precioUnitario', e.target.value)}
                          disabled={enviando}
                          step="0.01"
                          min="0"
                        />
                      </label>
                      <label className={`${styles.label} ${styles.colNum}`}>
                        Descuento
                        <input
                          type="number"
                          className={styles.input}
                          value={item.descuento || 0}
                          onChange={e => actualizarItem(idx, 'descuento', e.target.value)}
                          disabled={enviando}
                          step="0.01"
                          min="0"
                        />
                      </label>
                      <label className={`${styles.checkboxLabel} ${styles.colIva}`}>
                        <input
                          type="checkbox"
                          checked={!!item.tieneIva}
                          onChange={e => actualizarItem(idx, 'tieneIva', e.target.checked)}
                          disabled={enviando}
                        />
                        IVA 15%
                      </label>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => eliminarItem(idx)}
                        disabled={enviando}
                        aria-label="Eliminar item"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              {/* Descripcion adicional + totales */}
              <section className={styles.section}>
                <label className={styles.label}>
                  Descripcion (opcional, aparece como campoAdicional en el XML)
                  <textarea
                    className={styles.input}
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    disabled={enviando}
                    rows={2}
                    placeholder="Notas adicionales"
                  />
                </label>

                <div className={styles.totalesBox}>
                  <div className={styles.tFila}>
                    <span>Subtotal</span>
                    <span>${fmt(totales.subtotal)}</span>
                  </div>
                  {totales.descuento > 0 && (
                    <div className={styles.tFila}>
                      <span>Descuento</span>
                      <span>${fmt(totales.descuento)}</span>
                    </div>
                  )}
                  <div className={styles.tFila}>
                    <span>IVA 15%</span>
                    <span>${fmt(totales.iva)}</span>
                  </div>
                  <div className={styles.tFilaTotal}>
                    <span>VALOR DE LA MODIFICACION</span>
                    <span>${fmt(totales.total)}</span>
                  </div>
                </div>
              </section>

              {error && (
                <div className={styles.error} role="alert">
                  <p className={styles.errorTitle}>{error}</p>
                  {errorMensajes.length > 0 && (
                    <ul className={styles.errorList}>
                      {errorMensajes.map((m, i) => (
                        <li key={i} className={styles.errorItem}>
                          <strong>[{m.identificador}] {m.mensaje}</strong>
                          {m.informacionAdicional && (
                            <div className={styles.errorInfo}>{m.informacionAdicional}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnSec}
                  onClick={cerrar}
                  disabled={enviando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.btnPri}
                  onClick={emitir}
                  disabled={enviando || items.length === 0}
                >
                  {enviando ? 'Enviando al SRI...' : 'Emitir nota credito'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
