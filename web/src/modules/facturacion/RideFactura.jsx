import { useRef, useState } from 'react';
import styles from './RideFactura.module.css';

const FORMA_PAGO_LABEL = {
  '01': 'Efectivo',
  '16': 'Transferencia',
  '19': 'Tarjeta de credito',
  '20': 'Tarjeta de debito'
};

function fmt(val) {
  return parseFloat(val || 0).toFixed(2);
}

function fmtFecha(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

/**
 * Representacion Impresa del Documento Electronico (RIDE).
 * Props:
 *   factura - doc de facturas/ con {claveAcceso, numeroAutorizacion, ...}.
 *   emisor  - config/taller con {ruc, razonSocial, nombreComercial, dirMatriz, ...}.
 *
 * Render: toda la hoja A4 con datos del emisor, receptor, items, totales,
 * autorizacion SRI. Botones "Imprimir" usan @media print global (oculta nav
 * y deja solo [data-printable]). "Descargar PDF" usa jsPDF + html2canvas
 * cargados lazy on-demand.
 */
export default function RideFactura({ factura, emisor }) {
  const pageRef = useRef(null);
  const [generando, setGenerando] = useState(false);

  if (!factura || !emisor) {
    return (
      <div className={styles.errorBox}>
        Faltan datos para imprimir la factura.
      </div>
    );
  }

  const claveAcceso = factura.claveAcceso || '';
  const totales = factura.totales || {};
  const items = factura.items || [];
  const receptor = factura.receptor || {};

  const subtotal = parseFloat(totales.subtotal || 0);
  const descuento = parseFloat(totales.descuento || 0);
  const total = parseFloat(totales.total || 0);
  const iva = parseFloat((total - subtotal).toFixed(2));

  const base0 = items
    .filter(i => !i.tieneIva)
    .reduce((a, i) => {
      const sub = parseFloat(i.cantidad || 0) * parseFloat(i.precioUnitario || 0)
                  - parseFloat(i.descuento || 0);
      return a + sub;
    }, 0);

  const base15 = items
    .filter(i => i.tieneIva)
    .reduce((a, i) => {
      const sub = parseFloat(i.cantidad || 0) * parseFloat(i.precioUnitario || 0)
                  - parseFloat(i.descuento || 0);
      return a + sub;
    }, 0);

  const ambiente = claveAcceso[23] === '2' ? 'PRODUCCION' : 'PRUEBAS';

  async function handlePdf() {
    setGenerando(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);

      const canvas = await html2canvas(pageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const maxH = pdf.internal.pageSize.getHeight();
      const finalH = Math.min(pdfH, maxH);

      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, finalH);
      pdf.save(`factura-${(factura.numeroFactura || factura.id).replace(/[/\\]/g, '-')}.pdf`);
    } catch (e) {
      console.error('[RideFactura] PDF error:', e);
      alert('No se pudo generar el PDF: ' + e.message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => window.print()}
        >
          Imprimir
        </button>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={handlePdf}
          disabled={generando}
        >
          {generando ? 'Generando PDF...' : 'Descargar PDF'}
        </button>
      </div>

      <article ref={pageRef} className={styles.page} data-printable>
        <header className={styles.printHeader}>
          <div className={styles.emisorBlock}>
            <h1 className={styles.emisorName}>{emisor.razonSocial}</h1>
            {emisor.nombreComercial && emisor.nombreComercial !== emisor.razonSocial && (
              <p className={styles.emisorComercial}>{emisor.nombreComercial}</p>
            )}
            <p className={styles.emisorMeta}>Dir. Matriz: {emisor.dirMatriz}</p>
            {emisor.dirEstablecimiento && emisor.dirEstablecimiento !== emisor.dirMatriz && (
              <p className={styles.emisorMeta}>Dir. Establecimiento: {emisor.dirEstablecimiento}</p>
            )}
            {emisor.phone && <p className={styles.emisorMeta}>Tel: {emisor.phone}</p>}
            <p className={styles.emisorMeta}>
              Obligado a llevar contabilidad: {emisor.obligadoContabilidad || 'NO'}
            </p>
          </div>

          <div className={styles.docBox}>
            <div className={styles.docTitle}>FACTURA</div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>R.U.C.</span>
              <span>{emisor.ruc}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>N&deg;</span>
              <strong>{factura.numeroFactura}</strong>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Fecha</span>
              <span>{factura.fechaEmision}</span>
            </div>
            <div className={styles.ambienteTag}>
              Ambiente: {ambiente}
            </div>
          </div>
        </header>

        <section className={styles.receptorBlock}>
          <h2 className={styles.blockTitle}>Datos del comprador</h2>
          <div className={styles.receptorGrid}>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Razon social</span>
              <span>{receptor.razonSocial}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Identificacion</span>
              <span>{receptor.identificacion}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Direccion</span>
              <span>{receptor.direccion || '-'}</span>
            </div>
            {receptor.email && (
              <div className={styles.kv}>
                <span className={styles.kvLabel}>Email</span>
                <span>{receptor.email}</span>
              </div>
            )}
          </div>
        </section>

        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Codigo</th>
              <th className={styles.th}>Descripcion</th>
              <th className={styles.thR}>Cant.</th>
              <th className={styles.thR}>P. Unit.</th>
              <th className={styles.thR}>Desc.</th>
              <th className={styles.thR}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const cantidad = parseFloat(item.cantidad || 0);
              const pu = parseFloat(item.precioUnitario || 0);
              const desc = parseFloat(item.descuento || 0);
              const sub = (cantidad * pu) - desc;
              return (
                <tr key={i} className={i % 2 === 1 ? styles.trAlt : undefined}>
                  <td className={styles.td}>{item.codigo || '-'}</td>
                  <td className={styles.td}>
                    {item.descripcion}
                    {item.tieneIva && <span className={styles.tdIva}> (IVA 15%)</span>}
                  </td>
                  <td className={styles.tdR}>{fmt(cantidad)}</td>
                  <td className={styles.tdR}>{fmt(pu)}</td>
                  <td className={styles.tdR}>{fmt(desc)}</td>
                  <td className={styles.tdR}>{fmt(sub)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className={styles.totalesBlock}>
          <div className={styles.totalesBox}>
            <div className={styles.tFila}>
              <span>Subtotal sin impuestos</span>
              <span>${fmt(subtotal)}</span>
            </div>
            {descuento > 0 && (
              <div className={styles.tFila}>
                <span>Descuento</span>
                <span>${fmt(descuento)}</span>
              </div>
            )}
            <div className={styles.tFila}>
              <span>Subtotal IVA 0%</span>
              <span>${fmt(base0)}</span>
            </div>
            <div className={styles.tFila}>
              <span>Subtotal IVA 15%</span>
              <span>${fmt(base15)}</span>
            </div>
            <div className={styles.tFila}>
              <span>IVA 15%</span>
              <span>${fmt(iva)}</span>
            </div>
            <div className={styles.tFilaTotal}>
              <span>VALOR TOTAL</span>
              <span>${fmt(total)}</span>
            </div>
            {factura.formaPago && (
              <div className={styles.tFila}>
                <span>Forma de pago</span>
                <span>{FORMA_PAGO_LABEL[factura.formaPago] || factura.formaPago}</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.autBlock}>
          <h2 className={styles.blockTitle}>Autorizacion SRI</h2>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Numero autorizacion</span>
            <span>{factura.numeroAutorizacion}</span>
          </div>
          <div className={styles.kv}>
            <span className={styles.kvLabel}>Fecha autorizacion</span>
            <span>{fmtFecha(factura.fechaAutorizacion)}</span>
          </div>
          <div className={styles.claveLabel}>Clave de acceso:</div>
          <code className={styles.claveAcceso}>{claveAcceso}</code>
        </section>

        <footer className={styles.footer}>
          Este documento es la Representacion Impresa de un Comprobante
          Electronico autorizado por el SRI. Verifique su validez en{' '}
          <strong>www.sri.gob.ec</strong>.
        </footer>
      </article>
    </div>
  );
}
