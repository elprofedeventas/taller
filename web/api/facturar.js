// web/api/facturar.js
// Vercel Serverless Function - Facturacion Electronica SRI Ecuador.
// Patron Nueva Orbita 2026 + open-factura 0.1.1.
//
// Variables de entorno (Vercel Dashboard + .env.local en dev):
//   SRI_AMBIENTE=1          (1=pruebas, 2=produccion)
//   SRI_RECEPTION_URL=https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
//   SRI_AUTHORIZATION_URL=https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl
//   FACTURA_ENCRYPTION_SECRET=clave_larga_32+_chars  (NO commitear, NO perder)
//
// URLs PRODUCCION (cuando este listo el cliente):
//   SRI_RECEPTION_URL=https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
//   SRI_AUTHORIZATION_URL=https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl

import {
  generateInvoice,
  generateInvoiceXml,
  signXml,
  documentReception,
  documentAuthorization,
} from 'open-factura';

import crypto from 'crypto';
import forge from 'node-forge';

// === Constantes SRI ===

const TIPO_ID = {
  RUC: '04',
  CEDULA: '05',
  PASAPORTE: '06',
  CONSUMIDOR_FINAL: '07',
  EXTERIOR: '08'
};

const IVA_CODIGO = '2';
const IVA_15_PORCENTAJE = '4';
const IVA_0_PORCENTAJE = '0';
const FORMA_PAGO_EFECTIVO = '01';

// === Encriptacion AES-256-CBC del .p12 ===
// El certificado se almacena encriptado en Firestore. La clave deriva
// de FACTURA_ENCRYPTION_SECRET via scrypt. Nunca se persiste ni loguea
// el .p12 en texto plano ni la clave.

function encryptP12(p12Base64) {
  const key = crypto.scryptSync(
    process.env.FACTURA_ENCRYPTION_SECRET,
    'salt_nueva_orbita',
    32
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(p12Base64, 'base64')),
    cipher.final()
  ]);
  return iv.toString('hex') + ':' + encrypted.toString('base64');
}

function decryptP12(encryptedStr) {
  const [ivHex, encryptedBase64] = encryptedStr.split(':');
  const key = crypto.scryptSync(
    process.env.FACTURA_ENCRYPTION_SECRET,
    'salt_nueva_orbita',
    32
  );
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final()
  ]);
  return decrypted;
}

// === Construccion del objeto factura ===

function buildInvoiceInput({
  emisor,
  receptor,
  items,
  secuencial,
  formaPago = FORMA_PAGO_EFECTIVO,
  fechaEmision
}) {
  const ambiente = process.env.SRI_AMBIENTE || '1';
  const fecha = fechaEmision || new Date().toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  let totalSinImpuestos = 0;
  let totalDescuento = 0;
  let totalIva15 = 0;
  let baseImponibleIva15 = 0;
  let baseImponibleIva0 = 0;

  const detalles = items.map(item => {
    const cantidad = parseFloat(item.cantidad);
    const precioUnitario = parseFloat(item.precioUnitario);
    const descuento = parseFloat(item.descuento || 0);
    const precioTotalSinImpuesto = parseFloat(
      (cantidad * precioUnitario - descuento).toFixed(2)
    );

    totalSinImpuestos += precioTotalSinImpuesto;
    totalDescuento += descuento;

    let impuestos;
    if (item.tieneIva) {
      const valorIva = parseFloat((precioTotalSinImpuesto * 0.15).toFixed(2));
      baseImponibleIva15 += precioTotalSinImpuesto;
      totalIva15 += valorIva;
      impuestos = {
        impuesto: [{
          codigo: IVA_CODIGO,
          codigoPorcentaje: IVA_15_PORCENTAJE,
          tarifa: '15.00',
          baseImponible: precioTotalSinImpuesto.toFixed(2),
          valor: valorIva.toFixed(2)
        }]
      };
    } else {
      baseImponibleIva0 += precioTotalSinImpuesto;
      impuestos = {
        impuesto: [{
          codigo: IVA_CODIGO,
          codigoPorcentaje: IVA_0_PORCENTAJE,
          tarifa: '0.00',
          baseImponible: precioTotalSinImpuesto.toFixed(2),
          valor: '0.00'
        }]
      };
    }

    return {
      codigoPrincipal: item.codigo || '001',
      codigoAuxiliar: item.codigoAuxiliar || '',
      descripcion: item.descripcion,
      cantidad: cantidad.toFixed(2),
      precioUnitario: precioUnitario.toFixed(2),
      descuento: descuento.toFixed(2),
      precioTotalSinImpuesto: precioTotalSinImpuesto.toFixed(2),
      impuestos
    };
  });

  const importeTotal = parseFloat((totalSinImpuestos + totalIva15).toFixed(2));

  const totalImpuesto = [];
  if (baseImponibleIva15 > 0) {
    totalImpuesto.push({
      codigo: IVA_CODIGO,
      codigoPorcentaje: IVA_15_PORCENTAJE,
      descuentoAdicional: '0.00',
      baseImponible: baseImponibleIva15.toFixed(2),
      tarifa: '15.00',
      valor: totalIva15.toFixed(2)
    });
  }
  if (baseImponibleIva0 > 0) {
    totalImpuesto.push({
      codigo: IVA_CODIGO,
      codigoPorcentaje: IVA_0_PORCENTAJE,
      descuentoAdicional: '0.00',
      baseImponible: baseImponibleIva0.toFixed(2),
      tarifa: '0.00',
      valor: '0.00'
    });
  }

  return {
    infoTributaria: {
      ambiente,
      tipoEmision: '1',
      razonSocial: emisor.razonSocial,
      nombreComercial: emisor.nombreComercial || emisor.razonSocial,
      ruc: emisor.ruc,
      codDoc: '01',
      estab: emisor.estab,
      ptoEmi: emisor.ptoEmi,
      secuencial,
      dirMatriz: emisor.dirMatriz
    },
    infoFactura: {
      fechaEmision: fecha,
      dirEstablecimiento: emisor.dirEstablecimiento || emisor.dirMatriz,
      obligadoContabilidad: emisor.obligadoContabilidad || 'NO',
      tipoIdentificacionComprador: receptor.tipoId || TIPO_ID.CEDULA,
      razonSocialComprador: receptor.razonSocial,
      identificacionComprador: receptor.identificacion,
      direccionComprador: receptor.direccion || 'N/A',
      totalSinImpuestos: totalSinImpuestos.toFixed(2),
      totalDescuento: totalDescuento.toFixed(2),
      totalConImpuestos: { totalImpuesto },
      importeTotal: importeTotal.toFixed(2),
      moneda: 'DOLAR',
      pagos: {
        pago: [{
          formaPago,
          total: importeTotal.toFixed(2),
          plazo: '0',
          unidadTiempo: 'dias'
        }]
      }
    },
    detalles: { detalle: detalles },
    ...(receptor.email && {
      infoAdicional: {
        campoAdicional: [{ '@nombre': 'email', '#': receptor.email }]
      }
    })
  };
}

// === Handler principal ===

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const {
    emisor,
    receptor,
    items,
    secuencial,
    formaPago,
    fechaEmision,
    p12Encrypted,
    p12Password,
    accion,
    claveAcceso,
    p12Base64
  } = req.body;

  try {
    // === ACCION: encriptar ===
    // Recibe .p12 en base64 + password. Devuelve string encriptado
    // (para guardar en Firestore) + fechaExpiracion del certificado.
    if (accion === 'encriptar') {
      if (!p12Base64) {
        return res.status(400).json({ error: 'Falta p12Base64' });
      }
      const encrypted = encryptP12(p12Base64);

      let fechaExpiracion = null;
      try {
        const der = forge.util.decode64(p12Base64);
        const asn1 = forge.asn1.fromDer(der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, p12Password || '');
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const bags = certBags[forge.pki.oids.certBag] || [];
        if (bags.length > 0) {
          const cert = bags.reduce((prev, curr) =>
            curr.cert.extensions.length > prev.cert.extensions.length ? curr : prev
          );
          fechaExpiracion = cert.cert.validity.notAfter.toISOString();
        }
      } catch (_) {
        // No bloqueante: si falla extraer fecha, guardamos sin ella.
      }

      return res.status(200).json({ p12Encrypted: encrypted, fechaExpiracion });
    }

    // === ACCION: consultar ===
    if (accion === 'consultar') {
      if (!claveAcceso) {
        return res.status(400).json({ error: 'Falta claveAcceso' });
      }
      const resultado = await documentAuthorization(
        claveAcceso,
        process.env.SRI_AUTHORIZATION_URL
      );
      return res.status(200).json({ autorizacion: resultado });
    }

    // === ACCION: facturar ===
    if (!emisor || !receptor || !items?.length || !secuencial || !p12Encrypted || !p12Password) {
      return res.status(400).json({
        error: 'Faltan campos requeridos: emisor, receptor, items, secuencial, p12Encrypted, p12Password'
      });
    }

    const invoiceInput = buildInvoiceInput({
      emisor, receptor, items, secuencial, formaPago, fechaEmision
    });

    const { invoice, accessKey } = generateInvoice(invoiceInput);
    const invoiceXml = generateInvoiceXml(invoice);
    const p12Buffer = decryptP12(p12Encrypted);
    const signedXml = await signXml(p12Buffer, p12Password, invoiceXml);

    const recepcionResult = await documentReception(
      signedXml,
      process.env.SRI_RECEPTION_URL
    );

    if (JSON.stringify(recepcionResult).includes('DEVUELTA')) {
      return res.status(422).json({
        error: 'SRI rechazo el comprobante en recepcion',
        detalle: recepcionResult,
        claveAcceso: accessKey
      });
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    const autorizacionResult = await documentAuthorization(
      accessKey,
      process.env.SRI_AUTHORIZATION_URL
    );

    const autorizacion =
      autorizacionResult?.autorizaciones?.autorizacion?.[0] ||
      autorizacionResult;

    const estado = autorizacion?.estado || 'DESCONOCIDO';
    const numeroAutorizacion = autorizacion?.numeroAutorizacion || accessKey;
    const fechaAutorizacion = autorizacion?.fechaAutorizacion || null;

    if (estado !== 'AUTORIZADO') {
      return res.status(422).json({
        error: `SRI devolvio estado: ${estado}`,
        mensajes: autorizacion?.mensajes || null,
        claveAcceso: accessKey,
        estado
      });
    }

    return res.status(200).json({
      ok: true,
      claveAcceso: accessKey,
      numeroAutorizacion,
      fechaAutorizacion,
      estado: 'AUTORIZADO',
      numeroFactura: `${invoiceInput.infoTributaria.estab}-${invoiceInput.infoTributaria.ptoEmi}-${secuencial}`,
      totales: {
        subtotal: invoiceInput.infoFactura.totalSinImpuestos,
        descuento: invoiceInput.infoFactura.totalDescuento,
        total: invoiceInput.infoFactura.importeTotal
      },
      items,
      receptor,
      fechaEmision: invoiceInput.infoFactura.fechaEmision,
      xmlFirmado: signedXml
    });

  } catch (err) {
    console.error('[facturar] Error:', err.message);
    return res.status(500).json({
      error: 'Error interno al procesar la factura',
      mensaje: err.message
    });
  }
}
