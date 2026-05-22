import { useRef, useState, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import styles from './RideFactura.module.css';

const FORMA_PAGO_LABEL = {
  '01': 'Sin utilizacion del sistema financiero',
  '15': 'Compensacion de deudas',
  '16': 'Tarjeta de debito',
  '17': 'Dinero electronico',
  '18': 'Tarjeta prepago',
  '19': 'Tarjeta de credito',
  '20': 'Otros con utilizacion del sistema financiero',
  '21': 'Endoso de titulos'
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
 * Layout matchea factura tipica de Siigo / sistemas contables Ecuador.
 *
 * Props:
 *   factura - doc de facturas/ con {claveAcceso, numeroAutorizacion, ...}.
 *   emisor  - config/taller con {ruc, razonSocial, nombreComercial, ...}.
 *
 * Botones:
 *   - "Imprimir o guardar PDF": dispara window.print(). El usuario puede
 *     elegir impresora o "Guardar como PDF" (texto seleccionable nativo).
 *   - "Descargar PDF": genera PDF via jsPDF.text() directo (texto
 *     seleccionable, sin html2canvas que rasteriza a imagen).
 */
export default function RideFactura({ factura, emisor }) {
  const pageRef = useRef(null);
  const barcodeCanvasRef = useRef(null);
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
  const formaPagoLabel = FORMA_PAGO_LABEL[factura.formaPago] || factura.formaPago || '-';

  // Renderiza el codigo de barras Code128 sobre el canvas referenciado.
  useEffect(() => {
    if (!barcodeCanvasRef.current || !claveAcceso) return;
    try {
      JsBarcode(barcodeCanvasRef.current, claveAcceso, {
        format: 'CODE128',
        width: 1.4,
        height: 48,
        displayValue: false,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000'
      });
    } catch (e) {
      console.error('[RideFactura] No se pudo generar el barcode:', e);
    }
  }, [claveAcceso]);

  async function handlePdf() {
    setGenerando(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      generarPdfTexto(pdf, {
        factura, emisor, items, receptor, claveAcceso,
        subtotal, descuento, total, iva, base0, base15,
        ambiente, formaPagoLabel
      });
      const nombre = (factura.numeroFactura || factura.id || 'factura').replace(/[/\\]/g, '-');
      pdf.save(`factura-${nombre}.pdf`);
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
          Imprimir o guardar PDF
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
        {/* ============== HEADER: Emisor (left) + Autorizacion (right) ============== */}
        <header className={styles.headerGrid}>
          <div className={styles.emisorBlock}>
            <p className={styles.line}>
              <strong>Emisor:</strong> {emisor.razonSocial}
            </p>
            <p className={styles.line}>
              <strong>RUC:</strong> {emisor.ruc}
            </p>
            <p className={styles.line}>
              <strong>Matriz:</strong> {emisor.dirMatriz}
            </p>
            {emisor.email && (
              <p className={styles.line}>
                <strong>Correo:</strong> {emisor.email}
              </p>
            )}
            {emisor.phone && (
              <p className={styles.line}>
                <strong>Telefono:</strong> {emisor.phone}
              </p>
            )}
            <p className={styles.line}>
              <strong>Obligado a llevar contabilidad:</strong> {emisor.obligadoContabilidad || 'NO'}
            </p>
          </div>

          <div className={styles.autorizacionBlock}>
            <h1 className={styles.facturaTitle}>
              FACTURA <span className={styles.facturaNumero}>No.{factura.numeroFactura}</span>
            </h1>
            <p className={styles.autLabel}><strong>Numero de Autorizacion:</strong></p>
            <p className={styles.autValor}>{factura.numeroAutorizacion || claveAcceso}</p>
            <p className={styles.autLabel}><strong>Fecha y hora de Autorizacion:</strong></p>
            <p className={styles.autValor}>{fmtFecha(factura.fechaAutorizacion)}</p>
            <p className={styles.line}>
              <strong>Ambiente:</strong> {ambiente}
            </p>
            <p className={styles.line}>
              <strong>Emision:</strong> NORMAL
            </p>
            <p className={styles.autLabel}><strong>Clave de Acceso:</strong></p>
            <canvas ref={barcodeCanvasRef} className={styles.barcode} />
            <p className={styles.claveAcceso}>{claveAcceso}</p>
          </div>
        </header>

        {/* ============== RECEPTOR ============== */}
        <section className={styles.receptorGrid}>
          <p className={styles.line}>
            <strong>Razon Social:</strong> {receptor.razonSocial}
          </p>
          <p className={styles.line}>
            <strong>RUC/CI:</strong> {receptor.identificacion}
          </p>
          <p className={styles.line}>
            <strong>Direccion:</strong> {receptor.direccion || '-'}
          </p>
          <p className={styles.line}>
            <strong>Telefono:</strong> {formatPhoneForDisplay(receptor.phone) || '-'}
          </p>
          <p className={styles.line}>
            <strong>Fecha Emision:</strong> {factura.fechaEmision || '-'}
          </p>
          <p className={styles.line}>
            <strong>Correo:</strong> {receptor.email || '-'}
          </p>
        </section>

        {/* ============== ITEMS ============== */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Codigo<br />Principal</th>
              <th className={styles.thR}>Cantidad</th>
              <th className={styles.th}>Descripcion</th>
              <th className={styles.th}>Detalles<br />Adicionales</th>
              <th className={styles.thR}>Precio<br />Unitario</th>
              <th className={styles.thR}>Descuento</th>
              <th className={styles.thR}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const cantidad = parseFloat(item.cantidad || 0);
              const pu = parseFloat(item.precioUnitario || 0);
              const desc = parseFloat(item.descuento || 0);
              const sub = (cantidad * pu) - desc;
              return (
                <tr key={i}>
                  <td className={styles.td}>{item.codigo || '-'}</td>
                  <td className={styles.tdR}>{fmt(cantidad)}</td>
                  <td className={styles.td}>{item.descripcion}</td>
                  <td className={styles.td}></td>
                  <td className={styles.tdR}>{fmt(pu)}</td>
                  <td className={styles.tdR}>${fmt(desc)}</td>
                  <td className={styles.tdR}>${fmt(sub)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ============== INFO ADICIONAL + FORMAS PAGO (izq) / TOTALES (der) ============== */}
        <section className={styles.bottomGrid}>
          <div className={styles.bottomLeft}>
            {factura.descripcion && (
              <div className={styles.infoBox}>
                <h3 className={styles.boxTitle}>Informacion Adicional</h3>
                <div className={styles.kvRow}>
                  <span className={styles.kvLabel}>Descripcion</span>
                  <span>{factura.descripcion}</span>
                </div>
              </div>
            )}

            <div className={styles.infoBox}>
              <h3 className={styles.boxTitle}>Formas de pago</h3>
              <div className={styles.pagoRow}>
                <span>{formaPagoLabel}</span>
                <span className={styles.pagoMonto}>${fmt(total)}</span>
                <span className={styles.pagoPlazo}>0 dias</span>
              </div>
            </div>
          </div>

          <div className={styles.totalesBox}>
            <div className={styles.tFila}>
              <span>Subtotal Sin Impuestos:</span>
              <span>${fmt(subtotal)}</span>
            </div>
            <div className={styles.tFila}>
              <span>Subtotal 15%:</span>
              <span>${fmt(base15)}</span>
            </div>
            <div className={styles.tFila}>
              <span>Subtotal 5%:</span>
              <span>$0.00</span>
            </div>
            <div className={styles.tFila}>
              <span>Subtotal 0%:</span>
              <span>${fmt(base0)}</span>
            </div>
            <div className={styles.tFila}>
              <span>Subtotal No Objeto IVA:</span>
              <span>$0.00</span>
            </div>
            <div className={styles.tFila}>
              <span>Descuentos:</span>
              <span>${fmt(descuento)}</span>
            </div>
            <div className={styles.tFila}>
              <span>ICE:</span>
              <span>$0.00</span>
            </div>
            <div className={styles.tFila}>
              <span>IVA 15%:</span>
              <span>${fmt(iva)}</span>
            </div>
            <div className={styles.tFila}>
              <span>IVA 5%:</span>
              <span>$0.00</span>
            </div>
            <div className={styles.tFila}>
              <span>Servicio %:</span>
              <span>$0.00</span>
            </div>
            <div className={styles.tFilaTotal}>
              <span>Valor Total:</span>
              <span>${fmt(total)}</span>
            </div>
          </div>
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

/**
 * Dibuja la factura en un jsPDF usando .text() directo, lo que produce
 * un PDF con texto seleccionable (a diferencia de html2canvas que
 * rasteriza a imagen). Coordenadas en mm sobre A4 (210x297).
 */
function generarPdfTexto(pdf, ctx) {
  const {
    factura, emisor, items, receptor, claveAcceso,
    subtotal, descuento, total, iva, base0, base15,
    ambiente, formaPagoLabel
  } = ctx;

  const W = 210;
  const M = 12;          // margen
  const colLW = 100;     // ancho columna izquierda
  const colRX = M + colLW + 4;
  const colRW = W - M - colRX;

  // ============ HEADER ============
  let leftY = M + 4;
  let rightY = M + 4;

  // Emisor (izq)
  pdf.setFont('helvetica', 'normal');
  leftY = drawLineKV(pdf, M, leftY, 'Emisor:', emisor.razonSocial, colLW, 9);
  leftY = drawLineKV(pdf, M, leftY, 'RUC:', emisor.ruc, colLW, 9);
  leftY = drawLineKV(pdf, M, leftY, 'Matriz:', emisor.dirMatriz, colLW, 9);
  if (emisor.email) leftY = drawLineKV(pdf, M, leftY, 'Correo:', emisor.email, colLW, 9);
  if (emisor.phone) leftY = drawLineKV(pdf, M, leftY, 'Telefono:', emisor.phone, colLW, 9);
  leftY = drawLineKV(pdf, M, leftY, 'Obligado a llevar contabilidad:', emisor.obligadoContabilidad || 'NO', colLW, 9);

  // Autorizacion (der)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(`FACTURA  No.${factura.numeroFactura}`, colRX, rightY);
  rightY += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Numero de Autorizacion:', colRX, rightY);
  rightY += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text(factura.numeroAutorizacion || claveAcceso, colRX, rightY, { maxWidth: colRW });
  rightY += 5;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Fecha y hora de Autorizacion:', colRX, rightY);
  rightY += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.text(fmtFecha(factura.fechaAutorizacion), colRX, rightY);
  rightY += 5;
  rightY = drawLineKV(pdf, colRX, rightY, 'Ambiente:', ambiente, colRW, 9);
  rightY = drawLineKV(pdf, colRX, rightY, 'Emision:', 'NORMAL', colRW, 9);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Clave de Acceso:', colRX, rightY);
  rightY += 3;
  // Barcode Code128: render en canvas off-DOM y addImage al PDF.
  try {
    const bcCanvas = document.createElement('canvas');
    JsBarcode(bcCanvas, claveAcceso, {
      format: 'CODE128', width: 1.4, height: 40,
      displayValue: false, margin: 0,
      background: '#ffffff', lineColor: '#000000'
    });
    const dataUrl = bcCanvas.toDataURL('image/png');
    // El canvas mide en pixeles; lo escalamos al ancho de la columna derecha.
    const bcH = 12; // mm
    pdf.addImage(dataUrl, 'PNG', colRX, rightY, colRW, bcH);
    rightY += bcH + 1;
  } catch (e) {
    console.error('[RideFactura PDF] No se pudo generar barcode:', e);
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(claveAcceso, colRX, rightY, { maxWidth: colRW });
  rightY += 5;

  let y = Math.max(leftY, rightY) + 4;
  pdf.setDrawColor(180);
  pdf.line(M, y, W - M, y);
  y += 5;

  // ============ RECEPTOR ============
  pdf.setFontSize(9);
  const halfW = (W - M * 2) / 2 - 4;

  y = drawTwoCol(pdf, M, y, 'Razon Social:', receptor.razonSocial, colRX, 'RUC/CI:', receptor.identificacion || '-');
  y = drawTwoCol(pdf, M, y, 'Direccion:', receptor.direccion || '-', colRX, 'Telefono:', formatPhoneForDisplay(receptor.phone) || '-');
  y = drawTwoCol(pdf, M, y, 'Fecha Emision:', factura.fechaEmision || '-', colRX, 'Correo:', receptor.email || '-');

  y += 3;
  pdf.line(M, y, W - M, y);
  y += 4;

  // ============ ITEMS TABLE ============
  const cols = [
    { label: 'Codigo',      x: M,        w: 20, align: 'left'  },
    { label: 'Cant.',       x: M + 20,   w: 12, align: 'right' },
    { label: 'Descripcion', x: M + 34,   w: 70, align: 'left'  },
    { label: 'P.Unit.',     x: M + 108,  w: 18, align: 'right' },
    { label: 'Desc.',       x: M + 128,  w: 16, align: 'right' },
    { label: 'Total',       x: M + 146,  w: 40, align: 'right' }
  ];

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setFillColor(240);
  pdf.rect(M, y - 3, W - M * 2, 6, 'F');
  cols.forEach(c => {
    const tx = c.align === 'right' ? c.x + c.w : c.x;
    pdf.text(c.label, tx, y, { align: c.align });
  });
  y += 5;
  pdf.setFont('helvetica', 'normal');

  items.forEach(item => {
    const cant = parseFloat(item.cantidad || 0);
    const pu = parseFloat(item.precioUnitario || 0);
    const desc = parseFloat(item.descuento || 0);
    const sub = (cant * pu) - desc;

    // Descripcion puede wrap a varias lineas
    const descLines = pdf.splitTextToSize(item.descripcion || '', cols[2].w);
    const rowH = Math.max(5, descLines.length * 4);

    pdf.text(item.codigo || '-', cols[0].x, y);
    pdf.text(cant.toFixed(2), cols[1].x + cols[1].w, y, { align: 'right' });
    pdf.text(descLines, cols[2].x, y);
    pdf.text(pu.toFixed(2), cols[3].x + cols[3].w, y, { align: 'right' });
    pdf.text(`$${desc.toFixed(2)}`, cols[4].x + cols[4].w, y, { align: 'right' });
    pdf.text(`$${sub.toFixed(2)}`, cols[5].x + cols[5].w, y, { align: 'right' });
    y += rowH;
  });

  y += 2;
  pdf.line(M, y, W - M, y);
  y += 6;

  // ============ INFO ADICIONAL + FORMAS PAGO (izq) / TOTALES (der) ============
  let bLeftY = y, bRightY = y;

  // Izquierda
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  if (factura.descripcion) {
    pdf.text('Informacion Adicional', M, bLeftY);
    bLeftY += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const descLines = pdf.splitTextToSize(`Descripcion: ${factura.descripcion}`, 95);
    pdf.text(descLines, M, bLeftY);
    bLeftY += descLines.length * 4 + 2;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Formas de pago', M, bLeftY);
  bLeftY += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(formaPagoLabel, M, bLeftY, { maxWidth: 70 });
  pdf.text(`$${total.toFixed(2)}`, M + 75, bLeftY, { align: 'right' });
  pdf.text('0 dias', M + 80, bLeftY);

  // Derecha: totales
  const labelX = colRX;
  const valueX = W - M;
  const totRows = [
    ['Subtotal Sin Impuestos:', `$${subtotal.toFixed(2)}`],
    ['Subtotal 15%:', `$${base15.toFixed(2)}`],
    ['Subtotal 5%:', '$0.00'],
    ['Subtotal 0%:', `$${base0.toFixed(2)}`],
    ['Subtotal No Objeto IVA:', '$0.00'],
    ['Descuentos:', `$${descuento.toFixed(2)}`],
    ['ICE:', '$0.00'],
    ['IVA 15%:', `$${iva.toFixed(2)}`],
    ['IVA 5%:', '$0.00'],
    ['Servicio %:', '$0.00']
  ];

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  totRows.forEach(([label, value]) => {
    pdf.text(label, labelX, bRightY);
    pdf.text(value, valueX, bRightY, { align: 'right' });
    bRightY += 4;
  });

  pdf.line(labelX, bRightY, valueX, bRightY);
  bRightY += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Valor Total:', labelX, bRightY);
  pdf.text(`$${total.toFixed(2)}`, valueX, bRightY, { align: 'right' });
  bRightY += 6;

  // Footer
  const footerY = Math.max(bLeftY, bRightY) + 10;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text(
    'Representacion Impresa de un Comprobante Electronico autorizado por el SRI. ' +
    'Verifique en www.sri.gob.ec',
    W / 2, footerY,
    { align: 'center', maxWidth: W - M * 2 }
  );
}

/* Helper: dibuja "label: value" en una linea, devuelve el nuevo y. */
function drawLineKV(pdf, x, y, label, value, maxW, fontSize) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(fontSize);
  pdf.text(label, x, y);
  const labelW = pdf.getTextWidth(label) + 1.5;
  pdf.setFont('helvetica', 'normal');
  const valor = String(value || '-');
  const lines = pdf.splitTextToSize(valor, maxW - labelW);
  pdf.text(lines, x + labelW, y);
  return y + Math.max(4, lines.length * 4);
}

/* Helper: dibuja dos pares "label: value" en la misma linea (izq + der). */
function drawTwoCol(pdf, xL, y, labelL, valueL, xR, labelR, valueR) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(labelL, xL, y);
  const wL = pdf.getTextWidth(labelL) + 1.5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(String(valueL || '-'), xL + wL, y, { maxWidth: 90 - wL });

  pdf.setFont('helvetica', 'bold');
  pdf.text(labelR, xR, y);
  const wR = pdf.getTextWidth(labelR) + 1.5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(String(valueR || '-'), xR + wR, y, { maxWidth: 80 - wR });

  return y + 5;
}
