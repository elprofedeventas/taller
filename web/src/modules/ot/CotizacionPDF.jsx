// modules/ot/CotizacionPDF.jsx
// Cotizacion formal de una OT: muestra preview A4, permite descargar PDF
// (texto seleccionable via jsPDF.text() directo) y compartir por WhatsApp
// con template precargado.
//
// Vigencia sugerida: 15 dias. Esto NO es factura; es documento informativo.

import { useState } from 'react';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { templatesByIds } from '../../services/whatsapp';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import styles from './CotizacionPDF.module.css';

const VIGENCIA_DIAS = 15;
const IVA_PORCENTAJE = 0.15;

function fmt(val) {
  return Number(val || 0).toFixed(2);
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function fechaVigencia() {
  const d = new Date();
  d.setDate(d.getDate() + VIGENCIA_DIAS);
  return d.toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

export default function CotizacionPDF({
  auth,
  ot,
  tasks,
  parts,
  totales,
  config,
  onCerrar
}) {
  const [generando, setGenerando] = useState(false);

  const subtotal = (totales?.totalGeneral) || 0;
  const iva = subtotal * IVA_PORCENTAJE;
  const totalConIva = subtotal + iva;

  async function handlePdf() {
    setGenerando(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      dibujarPdf(pdf, { ot, tasks, parts, totales, config, subtotal, iva, totalConIva });
      const nombre = (ot.numeroOT || ot.id).replace(/[/\\]/g, '-');
      pdf.save(`cotizacion-${nombre}.pdf`);
    } catch (e) {
      console.error('[Cotizacion] PDF error:', e);
      alert('No se pudo generar el PDF: ' + e.message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <div className={styles.overlay} onClick={onCerrar} />
      <div className={styles.panel} role="dialog">
        <header className={styles.header}>
          <h2 className={styles.headerTitle}>
            Cotizacion {ot.numeroOT ? `- ${ot.numeroOT}` : ''}
          </h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handlePdf}
              disabled={generando}
            >
              {generando ? 'Generando PDF...' : 'Descargar PDF'}
            </button>
            <WhatsAppButton
              phone={ot.clientPhone}
              templates={templatesByIds(['cotizacion_formal'])}
              variables={{
                clientName: ot.clientName,
                vehiclePlaca: ot.vehiclePlaca,
                vehicleMarca: ot.vehicleMarca,
                vehicleModelo: ot.vehicleModelo,
                totalGeneral: fmt(totalConIva)
              }}
              context={{ collection: 'workOrders', docId: ot.id, action: 'cotizacion' }}
              buttonLabel="Compartir por WhatsApp"
              auth={auth}
            />
            <button
              type="button"
              className={styles.btnClose}
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>
        </header>

        <div className={styles.body}>
          {/* Preview A4 visible en pantalla */}
          <article className={styles.page} data-printable>
            <header className={styles.tallerHeader}>
              <div className={styles.tallerName}>
                {config?.name || config?.razonSocial || 'Taller'}
              </div>
              <div className={styles.tallerMeta}>
                {config?.address || config?.dirMatriz || ''}
                {config?.phone && <> · {config.phone}</>}
                {config?.ruc && <> · RUC: {config.ruc}</>}
              </div>
            </header>

            <div className={styles.docTitle}>
              <h1>COTIZACION</h1>
              <div className={styles.docMeta}>
                <span>Fecha: <strong>{fechaHoy()}</strong></span>
                {ot.numeroOT && <span>OT: <strong>{ot.numeroOT}</strong></span>}
              </div>
            </div>

            <section className={styles.dataBlock}>
              <div className={styles.dataRow}>
                <strong>Cliente:</strong> {ot.clientName}
                {ot.clientPhone && <> · {formatPhoneForDisplay(ot.clientPhone)}</>}
              </div>
              <div className={styles.dataRow}>
                <strong>Vehiculo:</strong> {ot.vehicleMarca} {ot.vehicleModelo} · placa <strong>{ot.vehiclePlaca}</strong>
              </div>
              {ot.problema && (
                <div className={styles.dataRow}>
                  <strong>Problema reportado:</strong> {ot.problema}
                </div>
              )}
            </section>

            {tasks && tasks.length > 0 && (
              <section className={styles.tableBlock}>
                <h2 className={styles.tableTitle}>Mano de obra</h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Descripcion</th>
                      <th className={styles.tR}>Horas</th>
                      <th className={styles.tR}>P. Unit.</th>
                      <th className={styles.tR}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t, i) => (
                      <tr key={i}>
                        <td>{t.descripcion || '(sin descripcion)'}</td>
                        <td className={styles.tR}>{Number(t.horas || 0).toFixed(2)}</td>
                        <td className={styles.tR}>${fmt(t.precioUnit)}</td>
                        <td className={styles.tR}>${fmt(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {parts && parts.length > 0 && (
              <section className={styles.tableBlock}>
                <h2 className={styles.tableTitle}>Repuestos</h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Descripcion</th>
                      <th className={styles.tR}>Cant.</th>
                      <th className={styles.tR}>P. Unit.</th>
                      <th className={styles.tR}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p, i) => (
                      <tr key={i}>
                        <td>{p.descripcion || '(sin descripcion)'}</td>
                        <td className={styles.tR}>{Number(p.cantidad || 0).toFixed(2)}</td>
                        <td className={styles.tR}>${fmt(p.precioUnit)}</td>
                        <td className={styles.tR}>${fmt(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className={styles.totalesBlock}>
              <div className={styles.tFila}>
                <span>Subtotal mano de obra</span>
                <span>${fmt(totales?.totalLabor)}</span>
              </div>
              <div className={styles.tFila}>
                <span>Subtotal repuestos</span>
                <span>${fmt(totales?.totalParts)}</span>
              </div>
              <div className={styles.tFila}>
                <span>Subtotal</span>
                <span>${fmt(subtotal)}</span>
              </div>
              <div className={styles.tFila}>
                <span>IVA 15%</span>
                <span>${fmt(iva)}</span>
              </div>
              <div className={styles.tFilaTotal}>
                <span>TOTAL ESTIMADO</span>
                <span>${fmt(totalConIva)}</span>
              </div>
            </section>

            <footer className={styles.footer}>
              <p>Vigencia hasta: <strong>{fechaVigencia()}</strong> ({VIGENCIA_DIAS} dias).</p>
              <p>Esta cotizacion no constituye factura. Sujeta a revision al
              recibir el vehiculo en taller.</p>
            </footer>
          </article>
        </div>
      </div>
    </>
  );
}

/* ============================================================
 * PDF generation con jsPDF.text() directo (texto seleccionable)
 * ============================================================ */
function dibujarPdf(pdf, { ot, tasks, parts, totales, config, subtotal, iva, totalConIva }) {
  const W = 210;
  const M = 14;
  let y = M;

  // ============ HEADER taller ============
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(config?.name || config?.razonSocial || 'Taller', M, y);
  y += 5;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const metaParts = [];
  if (config?.address || config?.dirMatriz) metaParts.push(config.address || config.dirMatriz);
  if (config?.phone) metaParts.push(config.phone);
  if (config?.ruc) metaParts.push('RUC: ' + config.ruc);
  if (metaParts.length) {
    pdf.text(metaParts.join('  ·  '), M, y, { maxWidth: W - M * 2 });
    y += 5;
  }

  pdf.setDrawColor(180);
  pdf.line(M, y, W - M, y);
  y += 8;

  // ============ TITULO ============
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('COTIZACION', M, y);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const fechaTxt = `Fecha: ${fechaHoy()}`;
  pdf.text(fechaTxt, W - M, y, { align: 'right' });
  if (ot.numeroOT) {
    pdf.text(`OT: ${ot.numeroOT}`, W - M, y + 5, { align: 'right' });
  }
  y += 9;

  // ============ DATOS cliente / vehiculo ============
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Cliente:', M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    ot.clientName + (ot.clientPhone ? `  ·  ${formatPhoneForDisplay(ot.clientPhone)}` : ''),
    M + 18, y,
    { maxWidth: W - M * 2 - 18 }
  );
  y += 5;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Vehiculo:', M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${ot.vehicleMarca} ${ot.vehicleModelo}  ·  placa ${ot.vehiclePlaca}`,
    M + 18, y
  );
  y += 5;

  if (ot.problema) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Problema:', M, y);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(ot.problema, W - M * 2 - 22);
    pdf.text(lines, M + 22, y);
    y += lines.length * 4 + 1;
  }

  y += 3;

  // ============ TABLAS de tareas y repuestos ============
  function dibujarTabla(titulo, cabeceras, filas, columnasX) {
    pdf.setDrawColor(180);
    pdf.line(M, y, W - M, y);
    y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(titulo, M, y);
    y += 5;

    // Cabecera
    pdf.setFontSize(9);
    pdf.setFillColor(240);
    pdf.rect(M, y - 3.5, W - M * 2, 5.5, 'F');
    cabeceras.forEach((c, i) => {
      const cx = columnasX[i];
      const align = c.align || 'left';
      const tx = align === 'right' ? cx.x + cx.w : cx.x;
      pdf.text(c.label, tx, y, { align });
    });
    y += 4;
    pdf.setFont('helvetica', 'normal');

    filas.forEach(row => {
      row.forEach((cell, i) => {
        const cx = columnasX[i];
        const align = cabeceras[i].align || 'left';
        const tx = align === 'right' ? cx.x + cx.w : cx.x;
        const lines = pdf.splitTextToSize(String(cell), cx.w);
        pdf.text(lines, tx, y, { align });
      });
      y += 5;
    });
    y += 2;
  }

  if (tasks && tasks.length > 0) {
    const cols = [
      { x: M, w: 96 },
      { x: M + 100, w: 18 },
      { x: M + 120, w: 26 },
      { x: M + 148, w: 34 }
    ];
    dibujarTabla(
      'Mano de obra',
      [
        { label: 'Descripcion', align: 'left' },
        { label: 'Horas', align: 'right' },
        { label: 'P.Unit.', align: 'right' },
        { label: 'Total', align: 'right' }
      ],
      tasks.map(t => [
        t.descripcion || '(sin descripcion)',
        Number(t.horas || 0).toFixed(2),
        '$' + fmt(t.precioUnit),
        '$' + fmt(t.total)
      ]),
      cols
    );
  }

  if (parts && parts.length > 0) {
    const cols = [
      { x: M, w: 96 },
      { x: M + 100, w: 18 },
      { x: M + 120, w: 26 },
      { x: M + 148, w: 34 }
    ];
    dibujarTabla(
      'Repuestos',
      [
        { label: 'Descripcion', align: 'left' },
        { label: 'Cant.', align: 'right' },
        { label: 'P.Unit.', align: 'right' },
        { label: 'Total', align: 'right' }
      ],
      parts.map(p => [
        p.descripcion || '(sin descripcion)',
        Number(p.cantidad || 0).toFixed(2),
        '$' + fmt(p.precioUnit),
        '$' + fmt(p.total)
      ]),
      cols
    );
  }

  // ============ TOTALES ============
  pdf.setDrawColor(180);
  pdf.line(M, y, W - M, y);
  y += 5;

  const labelX = W - M - 60;
  const valueX = W - M;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const rows = [
    ['Subtotal mano de obra:', '$' + fmt(totales?.totalLabor)],
    ['Subtotal repuestos:', '$' + fmt(totales?.totalParts)],
    ['Subtotal:', '$' + fmt(subtotal)],
    ['IVA 15%:', '$' + fmt(iva)]
  ];
  rows.forEach(([label, value]) => {
    pdf.text(label, labelX, y);
    pdf.text(value, valueX, y, { align: 'right' });
    y += 5;
  });

  pdf.setLineWidth(0.4);
  pdf.line(labelX, y - 1, valueX, y - 1);
  y += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('TOTAL ESTIMADO:', labelX, y);
  pdf.text('$' + fmt(totalConIva), valueX, y, { align: 'right' });
  y += 8;

  // ============ FOOTER ============
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(180);
  pdf.line(M, y, W - M, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(80);
  pdf.text(`Vigencia hasta: ${fechaVigencia()} (${VIGENCIA_DIAS} dias).`, M, y);
  y += 4;
  const disclaimer = pdf.splitTextToSize(
    'Esta cotizacion no constituye factura. Sujeta a revision al recibir el vehiculo en taller.',
    W - M * 2
  );
  pdf.text(disclaimer, M, y);
}
