import { useState, useEffect, useMemo } from 'react';
import { emitirFactura } from '../../services/facturas';
import styles from './ModalFacturacion.module.css';

const TIPO_ID_OPCIONES = [
  { value: '05', label: 'Cedula' },
  { value: '04', label: 'RUC' },
  { value: '06', label: 'Pasaporte' },
  { value: '07', label: 'Consumidor final' }
];

const FORMAS_PAGO = [
  { value: '01', label: 'Efectivo' },
  { value: '16', label: 'Transferencia' },
  { value: '19', label: 'Tarjeta de credito' },
  { value: '20', label: 'Tarjeta de debito' }
];

const ITEM_VACIO = {
  codigo: '',
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  descuento: '0',
  tieneIva: true
};

const CONSUMIDOR_FINAL = {
  tipoId: '07',
  identificacion: '9999999999',
  razonSocial: 'CONSUMIDOR FINAL',
  direccion: '',
  email: '',
  phone: ''
};

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

export default function ModalFacturacion({
  auth,
  onCerrar,
  receptorInicial = null,
  itemsIniciales = null,
  workOrderId = null,
  paymentId = null,
  onFacturaEmitida = null
}) {
  const [receptor, setReceptor] = useState(
    receptorInicial || { tipoId: '05', identificacion: '', razonSocial: '', direccion: '', email: '', phone: '' }
  );
  const [items, setItems] = useState(itemsIniciales || [{ ...ITEM_VACIO }]);
  const [formaPago, setFormaPago] = useState('01');
  const [descripcion, setDescripcion] = useState('');
  // Modo consumidor final: cuando esta activo, los locks no aplican porque
  // los datos no representan a un cliente registrado.
  const [consumidorFinalMode, setConsumidorFinalMode] = useState(false);

  // Un campo esta bloqueado si vino pre-cargado del cliente (no vacio en
  // receptorInicial) y no estamos en modo consumidor final. Asi se evita
  // que dos facturas del mismo cliente tengan datos fiscales distintos.
  function isLocked(field) {
    if (consumidorFinalMode) return false;
    if (!receptorInicial) return false;
    const v = receptorInicial[field];
    return v != null && String(v).trim() !== '';
  }

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [errorMensajes, setErrorMensajes] = useState([]);
  const [errorDetalle, setErrorDetalle] = useState(null);
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
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function usarConsumidorFinal() {
    setReceptor({ ...CONSUMIDOR_FINAL });
    setConsumidorFinalMode(true);
  }

  function restaurarCliente() {
    setReceptor(
      receptorInicial || { tipoId: '05', identificacion: '', razonSocial: '', direccion: '', email: '', phone: '' }
    );
    setConsumidorFinalMode(false);
  }

  function validar() {
    if (!receptor.identificacion?.trim()) return 'Falta la identificacion del comprador.';
    if (!receptor.razonSocial?.trim()) return 'Falta el nombre del comprador.';
    if (!items.length) return 'Agrega al menos un item.';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.descripcion?.trim()) return `Item ${i + 1}: falta la descripcion.`;
      if (parseFloat(it.cantidad) <= 0) return `Item ${i + 1}: cantidad invalida.`;
      if (parseFloat(it.precioUnitario) <= 0) return `Item ${i + 1}: precio invalido.`;
    }
    return null;
  }

  async function emitir() {
    const err = validar();
    if (err) {
      setError(err);
      setErrorMensajes([]);
      setErrorDetalle(null);
      return;
    }
    setError(null);
    setErrorMensajes([]);
    setErrorDetalle(null);
    setEnviando(true);
    try {
      const data = await emitirFactura(auth.session, {
        receptor,
        items,
        formaPago,
        descripcion,
        workOrderId,
        paymentId
      });
      setResultado(data);
      if (onFacturaEmitida) onFacturaEmitida(data, receptor);
    } catch (e) {
      setError(e.message);
      setErrorMensajes(Array.isArray(e.mensajes) ? e.mensajes : []);
      setErrorDetalle(e.detalle || null);
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    setEnviando(false);
    setError(null);
    setErrorMensajes([]);
    setErrorDetalle(null);
    setResultado(null);
    if (onCerrar) onCerrar();
  }

  return (
    <>
      <div className={styles.overlay} onClick={enviando ? undefined : cerrar} />
      <div className={styles.panel} role="dialog" aria-labelledby="modal-fact-title">
        <header className={styles.header}>
          <h2 id="modal-fact-title" className={styles.title}>
            {resultado ? 'Factura autorizada' : 'Emitir factura electronica'}
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
                Factura {resultado.numeroFactura} autorizada por el SRI.
              </p>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Numero</span>
                <span>{resultado.numeroFactura}</span>
              </div>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Clave de acceso</span>
                <code className={styles.claveAcceso}>{resultado.claveAcceso}</code>
              </div>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Autorizacion</span>
                <span>{resultado.numeroAutorizacion}</span>
              </div>
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Total</span>
                <span><strong>${fmt(resultado.totales?.total)}</strong></span>
              </div>
              <p className={styles.hint}>
                Doc Firestore: <code>{resultado.id}</code>.
                Para imprimir el RIDE, abre la pantalla de Facturacion.
              </p>
            </div>
          ) : (
            <>
              {/* Receptor */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Comprador</h3>
                  {consumidorFinalMode && receptorInicial ? (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={restaurarCliente}
                      disabled={enviando}
                    >
                      Volver a datos del cliente
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={usarConsumidorFinal}
                      disabled={enviando}
                    >
                      Usar consumidor final
                    </button>
                  )}
                </div>

                {receptorInicial && !consumidorFinalMode && (
                  <p className={styles.lockHint}>
                    Los datos del cliente estan bloqueados para evitar facturar al mismo cliente con datos distintos.
                    Para editarlos, ve a Clientes. Los campos vacios se pueden completar aqui y quedaran guardados en el cliente.
                  </p>
                )}

                <div className={styles.row}>
                  <label className={`${styles.label} ${styles.col3}`}>
                    Tipo ID
                    <select
                      className={isLocked('tipoId') ? `${styles.input} ${styles.inputLocked}` : styles.input}
                      value={receptor.tipoId}
                      onChange={e => setReceptor(r => ({ ...r, tipoId: e.target.value }))}
                      disabled={enviando || isLocked('tipoId')}
                    >
                      {TIPO_ID_OPCIONES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={`${styles.label} ${styles.col7}`}>
                    Identificacion
                    <input
                      type="text"
                      className={isLocked('identificacion') ? `${styles.input} ${styles.inputLocked}` : styles.input}
                      value={receptor.identificacion}
                      onChange={e => setReceptor(r => ({ ...r, identificacion: e.target.value }))}
                      disabled={enviando}
                      readOnly={isLocked('identificacion')}
                      placeholder="0912345678"
                    />
                  </label>
                </div>

                <label className={styles.label}>
                  Nombre / Razon social
                  <input
                    type="text"
                    className={isLocked('razonSocial') ? `${styles.input} ${styles.inputLocked}` : styles.input}
                    value={receptor.razonSocial}
                    onChange={e => setReceptor(r => ({ ...r, razonSocial: e.target.value }))}
                    disabled={enviando}
                    readOnly={isLocked('razonSocial')}
                    placeholder="Nombre completo del cliente"
                  />
                </label>

                <label className={styles.label}>
                  Direccion (opcional)
                  <input
                    type="text"
                    className={isLocked('direccion') ? `${styles.input} ${styles.inputLocked}` : styles.input}
                    value={receptor.direccion}
                    onChange={e => setReceptor(r => ({ ...r, direccion: e.target.value }))}
                    disabled={enviando}
                    readOnly={isLocked('direccion')}
                  />
                </label>

                <div className={styles.row}>
                  <label className={`${styles.label} ${styles.col5}`}>
                    Telefono (opcional)
                    <input
                      type="tel"
                      className={isLocked('phone') ? `${styles.input} ${styles.inputLocked}` : styles.input}
                      value={receptor.phone}
                      onChange={e => setReceptor(r => ({ ...r, phone: e.target.value }))}
                      disabled={enviando}
                      readOnly={isLocked('phone')}
                      placeholder="0987654321"
                    />
                  </label>
                  <label className={`${styles.label} ${styles.col5}`}>
                    Email (opcional)
                    <input
                      type="email"
                      className={isLocked('email') ? `${styles.input} ${styles.inputLocked}` : styles.input}
                      value={receptor.email}
                      onChange={e => setReceptor(r => ({ ...r, email: e.target.value }))}
                      disabled={enviando}
                      readOnly={isLocked('email')}
                    />
                  </label>
                </div>
              </section>

              {/* Items */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Items a facturar</h3>

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
                          placeholder="Producto o servicio"
                        />
                      </label>
                      <label className={`${styles.label} ${styles.colCode}`}>
                        Codigo
                        <input
                          type="text"
                          className={styles.input}
                          value={item.codigo}
                          onChange={e => actualizarItem(idx, 'codigo', e.target.value)}
                          disabled={enviando}
                          placeholder="001"
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
                          value={item.descuento}
                          onChange={e => actualizarItem(idx, 'descuento', e.target.value)}
                          disabled={enviando}
                          step="0.01"
                          min="0"
                        />
                      </label>
                      <label className={`${styles.checkboxLabel} ${styles.colIva}`}>
                        <input
                          type="checkbox"
                          checked={item.tieneIva}
                          onChange={e => actualizarItem(idx, 'tieneIva', e.target.checked)}
                          disabled={enviando}
                        />
                        IVA 15%
                      </label>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => eliminarItem(idx)}
                          disabled={enviando}
                          aria-label="Eliminar item"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => setItems(prev => [...prev, { ...ITEM_VACIO }])}
                  disabled={enviando}
                >
                  + Agregar item
                </button>
              </section>

              {/* Descripcion (campoAdicional para SRI + Info Adicional del RIDE) */}
              <section className={styles.section}>
                <label className={styles.label}>
                  Descripcion (opcional, aparece en Informacion Adicional del RIDE)
                  <textarea
                    className={styles.input}
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    disabled={enviando}
                    rows={3}
                    placeholder="Notas o detalle adicional del servicio facturado"
                  />
                </label>
              </section>

              {/* Forma de pago + totales */}
              <section className={styles.section}>
                <div className={styles.row}>
                  <label className={`${styles.label} ${styles.col5}`}>
                    Forma de pago
                    <select
                      className={styles.input}
                      value={formaPago}
                      onChange={e => setFormaPago(e.target.value)}
                      disabled={enviando}
                    >
                      {FORMAS_PAGO.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className={`${styles.totalesBox} ${styles.col5}`}>
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
                      <span>TOTAL</span>
                      <span>${fmt(totales.total)}</span>
                    </div>
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
                          {m.tipo && <span className={styles.errorTipo}>{m.tipo}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {errorDetalle && errorMensajes.length === 0 && (
                    <details className={styles.errorDetails}>
                      <summary>Detalle tecnico</summary>
                      <pre className={styles.errorPre}>{errorDetalle}</pre>
                    </details>
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
                  disabled={enviando}
                >
                  {enviando ? 'Enviando al SRI...' : 'Emitir factura'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
