// modules/facturacion/otHelpers.js
// Convierte una OT al formato que espera ModalFacturacion: receptor + items.
// Mano de obra y repuestos se mapean a items individuales con IVA 15%.
// Si la OT no tiene tareas/repuestos validos cae a un item generico con
// el totalGeneral persistido.

import { formatPhoneForDisplay } from '../../utils/formatPhone';

export function otToFacturaItems(ot) {
  const items = [];

  (ot.tasks || []).forEach((t, i) => {
    if (!t.descripcion || Number(t.total || 0) <= 0) return;
    items.push({
      codigo: `MO-${String(i + 1).padStart(3, '0')}`,
      descripcion: t.descripcion,
      cantidad: String(Number(t.horas || 1).toFixed(2)),
      precioUnitario: String(Number(t.precioUnit || 0).toFixed(2)),
      descuento: '0',
      tieneIva: true
    });
  });

  (ot.parts || []).forEach((p, i) => {
    if (!p.descripcion || Number(p.total || 0) <= 0) return;
    items.push({
      codigo: `REP-${String(i + 1).padStart(3, '0')}`,
      descripcion: p.descripcion,
      cantidad: String(Number(p.cantidad || 1).toFixed(2)),
      precioUnitario: String(Number(p.precioUnit || 0).toFixed(2)),
      descuento: '0',
      tieneIva: true
    });
  });

  if (items.length === 0) {
    items.push({
      codigo: 'SRV-001',
      descripcion: `Servicio de taller - ${ot.vehiclePlaca || 'OT'}`,
      cantidad: '1.00',
      precioUnitario: String(Number(ot.totalGeneral || 0).toFixed(2)),
      descuento: '0',
      tieneIva: true
    });
  }

  return items;
}

/**
 * Convierte denorm de OT + cliente fresco a receptor SRI.
 *   - Prefiere el cliente fresco (puede haber sido actualizado despues
 *     de crear la OT, especialmente para datos opcionales como direccion
 *     o email que se completan al emitir la primera factura).
 *   - Cae a la denorm de la OT si el cliente no tiene el campo.
 *
 * Asi, dos facturas del mismo cliente siempre tienen los mismos datos
 * fiscales — la unica forma de cambiarlos es editar al cliente.
 */
export function otToReceptor(ot, client = null) {
  const c = client || {};
  return {
    tipoId: c.tipoId || ot.clientTipoId || '05',
    identificacion: c.identificacion || ot.clientIdentificacion || '',
    razonSocial: c.name || ot.clientName || '',
    direccion: c.direccion || ot.clientDireccion || '',
    email: c.email || ot.clientEmail || '',
    phone: formatPhoneForDisplay(c.phone || ot.clientPhone || '')
  };
}
