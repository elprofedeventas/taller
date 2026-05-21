// web/api/facturar.js
// Vercel Function - Facturacion electronica SRI Ecuador, sin
// dependencias externas problematicas (sin open-factura). Implementa:
//   - Encriptar/desencriptar .p12 con AES-256-CBC (crypto nativo).
//   - Calculo de clave de acceso 49 digitos (SRI Ecuador).
//   - Generacion de XML factura version 2.1.0.
//   - Firma XAdES-BES manual con node-forge.
//   - Envio SOAP al SRI con axios + parseo de respuesta XML.
//
// Acciones POST:
//   { accion: "encriptar", p12Base64, p12Password }
//   { accion: "facturar", emisor, receptor, items, secuencial, formaPago, p12Encrypted, p12Password }
//   { accion: "consultar", claveAcceso }

import crypto from 'crypto';
import * as forgePkg from 'node-forge';
import axios from 'axios';

const forge = forgePkg.default || forgePkg;

// ============================================================
// Constantes SRI
// ============================================================

const IVA_15_PORCENTAJE = '4';
const IVA_0_PORCENTAJE = '0';
const FORMA_PAGO_EFECTIVO = '01';

// ============================================================
// Encriptacion AES-256-CBC del .p12
// ============================================================

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

// ============================================================
// Helpers de validacion (modulo 11) y XML escape
// ============================================================

function digitoModulo11(cadena) {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  let f = 0;
  for (let i = cadena.length - 1; i >= 0; i--) {
    suma += parseInt(cadena.charAt(i), 10) * factores[f];
    f = (f + 1) % factores.length;
  }
  const residuo = suma % 11;
  const digito = 11 - residuo;
  if (digito === 11) return 0;
  if (digito === 10) return 1;
  return digito;
}

function xmlEscape(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================
// Clave de acceso (49 digitos)
// Formato: ddmmaaaa (8) + tipoComprobante (2) + ruc (13) +
//          ambiente (1) + serie (6=estab+ptoEmi) +
//          secuencial (9) + codigoNumerico (8) +
//          tipoEmision (1) + digitoVerificador (1) = 49
// ============================================================

function generarClaveAcceso({
  fechaEmision,        // formato dd/mm/aaaa
  tipoComprobante,     // '01' = factura
  ruc,                 // 13 digitos
  ambiente,            // '1' o '2'
  estab,               // 3 digitos
  ptoEmi,              // 3 digitos
  secuencial,          // 9 digitos
  codigoNumerico,      // 8 digitos (random o fijo)
  tipoEmision = '1'    // '1' = emision normal
}) {
  const [dd, mm, aaaa] = fechaEmision.split('/');
  const fechaFmt = `${dd}${mm}${aaaa}`;
  const serie = estab + ptoEmi;
  const base = fechaFmt + tipoComprobante + ruc + ambiente +
               serie + secuencial + codigoNumerico + tipoEmision;
  if (base.length !== 48) {
    throw new Error(`Clave de acceso base debe tener 48 caracteres, tiene ${base.length}`);
  }
  const dv = digitoModulo11(base);
  return base + String(dv);
}

// ============================================================
// Construccion del XML factura version 2.1.0
// ============================================================

function buildFacturaXml({
  emisor,
  receptor,
  items,
  secuencial,
  formaPago = FORMA_PAGO_EFECTIVO,
  fechaEmision,
  claveAcceso,
  ambiente
}) {
  const fecha = fechaEmision; // formato dd/mm/aaaa

  let totalSinImpuestos = 0;
  let totalDescuento = 0;
  let totalIva15 = 0;
  let baseImponibleIva15 = 0;
  let baseImponibleIva0 = 0;

  const detallesXml = items.map(item => {
    const cantidad = parseFloat(item.cantidad);
    const precioUnitario = parseFloat(item.precioUnitario);
    const descuento = parseFloat(item.descuento || 0);
    const precioTotalSinImpuesto = parseFloat((cantidad * precioUnitario - descuento).toFixed(2));

    totalSinImpuestos += precioTotalSinImpuesto;
    totalDescuento += descuento;

    let impuestoXml;
    if (item.tieneIva) {
      const valorIva = parseFloat((precioTotalSinImpuesto * 0.15).toFixed(2));
      baseImponibleIva15 += precioTotalSinImpuesto;
      totalIva15 += valorIva;
      impuestoXml = `
            <impuesto>
              <codigo>2</codigo>
              <codigoPorcentaje>${IVA_15_PORCENTAJE}</codigoPorcentaje>
              <tarifa>15.00</tarifa>
              <baseImponible>${precioTotalSinImpuesto.toFixed(2)}</baseImponible>
              <valor>${valorIva.toFixed(2)}</valor>
            </impuesto>`;
    } else {
      baseImponibleIva0 += precioTotalSinImpuesto;
      impuestoXml = `
            <impuesto>
              <codigo>2</codigo>
              <codigoPorcentaje>${IVA_0_PORCENTAJE}</codigoPorcentaje>
              <tarifa>0.00</tarifa>
              <baseImponible>${precioTotalSinImpuesto.toFixed(2)}</baseImponible>
              <valor>0.00</valor>
            </impuesto>`;
    }

    return `
      <detalle>
        <codigoPrincipal>${xmlEscape(item.codigo || '001')}</codigoPrincipal>
        <descripcion>${xmlEscape(item.descripcion)}</descripcion>
        <cantidad>${cantidad.toFixed(2)}</cantidad>
        <precioUnitario>${precioUnitario.toFixed(2)}</precioUnitario>
        <descuento>${descuento.toFixed(2)}</descuento>
        <precioTotalSinImpuesto>${precioTotalSinImpuesto.toFixed(2)}</precioTotalSinImpuesto>
        <impuestos>${impuestoXml}
        </impuestos>
      </detalle>`;
  }).join('');

  const importeTotal = parseFloat((totalSinImpuestos + totalIva15).toFixed(2));

  let totalConImpuestosXml = '';
  if (baseImponibleIva15 > 0) {
    totalConImpuestosXml += `
        <totalImpuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${IVA_15_PORCENTAJE}</codigoPorcentaje>
          <descuentoAdicional>0.00</descuentoAdicional>
          <baseImponible>${baseImponibleIva15.toFixed(2)}</baseImponible>
          <tarifa>15.00</tarifa>
          <valor>${totalIva15.toFixed(2)}</valor>
        </totalImpuesto>`;
  }
  if (baseImponibleIva0 > 0) {
    totalConImpuestosXml += `
        <totalImpuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${IVA_0_PORCENTAJE}</codigoPorcentaje>
          <descuentoAdicional>0.00</descuentoAdicional>
          <baseImponible>${baseImponibleIva0.toFixed(2)}</baseImponible>
          <tarifa>0.00</tarifa>
          <valor>0.00</valor>
        </totalImpuesto>`;
  }

  const infoAdicionalXml = receptor.email ? `
  <infoAdicional>
    <campoAdicional nombre="email">${xmlEscape(receptor.email)}</campoAdicional>
  </infoAdicional>` : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${xmlEscape(emisor.razonSocial)}</razonSocial>
    <nombreComercial>${xmlEscape(emisor.nombreComercial || emisor.razonSocial)}</nombreComercial>
    <ruc>${emisor.ruc}</ruc>
    <claveAcceso>${claveAcceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${emisor.estab}</estab>
    <ptoEmi>${emisor.ptoEmi}</ptoEmi>
    <secuencial>${secuencial}</secuencial>
    <dirMatriz>${xmlEscape(emisor.dirMatriz)}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fecha}</fechaEmision>
    <dirEstablecimiento>${xmlEscape(emisor.dirEstablecimiento || emisor.dirMatriz)}</dirEstablecimiento>
    <obligadoContabilidad>${emisor.obligadoContabilidad || 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${receptor.tipoId || '05'}</tipoIdentificacionComprador>
    <razonSocialComprador>${xmlEscape(receptor.razonSocial)}</razonSocialComprador>
    <identificacionComprador>${receptor.identificacion}</identificacionComprador>
    <direccionComprador>${xmlEscape(receptor.direccion || 'N/A')}</direccionComprador>
    <totalSinImpuestos>${totalSinImpuestos.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>${totalDescuento.toFixed(2)}</totalDescuento>
    <totalConImpuestos>${totalConImpuestosXml}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${importeTotal.toFixed(2)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>${formaPago}</formaPago>
        <total>${importeTotal.toFixed(2)}</total>
        <plazo>0</plazo>
        <unidadTiempo>dias</unidadTiempo>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>${detallesXml}
  </detalles>${infoAdicionalXml}
</factura>`;

  return { xml, totales: { totalSinImpuestos, totalDescuento, importeTotal } };
}

// ============================================================
// Firma XAdES-BES para SRI Ecuador
// Implementacion basada en la spec de comprobantes electronicos
// del SRI version 2.1.0. NO usa librerias externas: solo node-forge
// para criptografia + manipulacion de strings para XML.
// ============================================================

function extraerClaveCertificado(p12Buffer, password) {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  // Buscar bag de clave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
  const privateKey = keyBag.key;

  // Buscar bag de certificado (el de mayor cantidad de extensions suele ser el del firmante)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = certBags[forge.pki.oids.certBag];
  const certBag = certs.reduce((best, cur) =>
    cur.cert.extensions.length > best.cert.extensions.length ? cur : best
  );
  const cert = certBag.cert;

  return { privateKey, cert };
}

function sha1Base64(str) {
  return crypto.createHash('sha1').update(str, 'utf8').digest('base64');
}

function sha1Base64Bytes(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('base64');
}

/**
 * Firma XAdES-BES segun spec SRI Ecuador.
 * @param xmlSinFirma - el XML factura completo, con id="comprobante" en el root.
 * @param privateKey - llave privada (forge pki).
 * @param cert - certificado X509 (forge pki).
 * @returns xml firmado con <ds:Signature> insertado dentro del root.
 */
function firmarXadesBes(xmlSinFirma, privateKey, cert) {
  // 1. IDs unicos (timestamp + sufijos)
  const ts = Date.now();
  const signatureId = `Signature${ts}`;
  const signedPropsId = `SignedProperties${ts}`;
  const keyInfoId = `Certificate${ts}`;
  const signedInfoId = `Signature-SignedInfo${ts}`;
  const objectId = `Signature${ts}-Object${ts}`;
  const referenceId = `Reference-ID-${ts}`;
  const signatureValueId = `SignatureValue${ts}`;

  // 2. Certificado en base64 (DER)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certBase64 = forge.util.encode64(certDer);

  // 3. Hash del certificado (SHA1 base64) - para SignedProperties
  const certBytes = forge.util.binary.raw.decode(certDer);
  const certSha1 = sha1Base64Bytes(Buffer.from(certBytes));

  // 4. Datos del emisor del certificado para SignedProperties
  const issuer = cert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(',');
  const serial = cert.serialNumber.replace(/^0+/, '') || '0';
  // Convertir serial hex -> decimal string
  const serialDec = BigInt('0x' + cert.serialNumber).toString();

  // 5. Bloque SignedProperties (XAdES)
  const ahora = new Date().toISOString();
  const signedProperties = `<etsi:SignedProperties Id="${signedPropsId}"><etsi:SignedSignatureProperties><etsi:SigningTime>${ahora}</etsi:SigningTime><etsi:SigningCertificate><etsi:Cert><etsi:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${certSha1}</ds:DigestValue></etsi:CertDigest><etsi:IssuerSerial><ds:X509IssuerName>${xmlEscape(issuer)}</ds:X509IssuerName><ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber></etsi:IssuerSerial></etsi:Cert></etsi:SigningCertificate><etsi:SignedDataObjectProperties><etsi:DataObjectFormat ObjectReference="#${referenceId}"><etsi:Description>contenido comprobante</etsi:Description><etsi:MimeType>text/xml</etsi:MimeType></etsi:DataObjectFormat></etsi:SignedDataObjectProperties></etsi:SignedSignatureProperties></etsi:SignedProperties>`;

  // 6. Hash del SignedProperties (para Reference dentro de SignedInfo)
  // Hay que incluir los namespaces del padre al canonicalizar.
  const signedPropsConNs = signedProperties.replace(
    '<etsi:SignedProperties ',
    '<etsi:SignedProperties xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" '
  );
  const signedPropsSha1 = sha1Base64(signedPropsConNs);

  // 7. Hash del KeyInfo
  const keyInfoXml = `<ds:KeyInfo Id="${keyInfoId}"><ds:X509Data><ds:X509Certificate>\n${certBase64}\n</ds:X509Certificate></ds:X509Data><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>\n${forge.util.encode64(forge.util.hexToBytes(privateKey.n.toString(16)))}\n</ds:Modulus><ds:Exponent>${forge.util.encode64(forge.util.hexToBytes(privateKey.e.toString(16)))}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue></ds:KeyInfo>`;
  const keyInfoConNs = keyInfoXml.replace(
    '<ds:KeyInfo ',
    '<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" '
  );
  const keyInfoSha1 = sha1Base64(keyInfoConNs);

  // 8. Hash del comprobante (todo el XML factura raw, sin pretty-print)
  // El URI #comprobante apunta al root <factura id="comprobante">
  const comprobanteSha1 = sha1Base64(xmlSinFirma);

  // 9. Bloque SignedInfo
  const signedInfo = `<ds:SignedInfo Id="${signedInfoId}"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference Id="SignedPropertiesID${ts}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${signedPropsSha1}</ds:DigestValue></ds:Reference><ds:Reference URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${keyInfoSha1}</ds:DigestValue></ds:Reference><ds:Reference Id="${referenceId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${comprobanteSha1}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

  // 10. Canonicalizar SignedInfo y firmar con RSA-SHA1
  const signedInfoConNs = signedInfo.replace(
    '<ds:SignedInfo ',
    '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" '
  );
  const md = forge.md.sha1.create();
  md.update(signedInfoConNs, 'utf8');
  const signatureBin = privateKey.sign(md);
  const signatureValue = forge.util.encode64(signatureBin);

  // 11. Ensamblar el bloque <ds:Signature> completo
  const signatureBlock = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#" Id="${signatureId}">${signedInfo}<ds:SignatureValue Id="${signatureValueId}">\n${signatureValue}\n</ds:SignatureValue>${keyInfoXml}<ds:Object Id="${objectId}"><etsi:QualifyingProperties Target="#${signatureId}">${signedProperties}</etsi:QualifyingProperties></ds:Object></ds:Signature>`;

  // 12. Insertar el <ds:Signature> antes del </factura>
  const xmlFirmado = xmlSinFirma.replace('</factura>', `${signatureBlock}</factura>`);

  return xmlFirmado;
}

// ============================================================
// Envio SOAP al SRI: recepcion + autorizacion
// ============================================================

function buildSoapRecepcion(xmlFirmado) {
  const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${xmlBase64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildSoapAutorizacion(claveAcceso) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function postSoap(url, body) {
  const wsdlUrl = url.replace('?wsdl', '');
  const resp = await axios.post(wsdlUrl, body, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': ''
    },
    timeout: 30000,
    validateStatus: () => true
  });
  return resp.data;
}

// Extrae los <mensaje> individuales dentro del bloque <mensajes>.
// Cada mensaje del SRI tiene: identificador, mensaje (texto), tipo,
// informacionAdicional. Devuelve array de objetos.
function parseMensajesSri(xmlString) {
  const mensajes = [];
  // Captura cada bloque <mensaje>...</mensaje> dentro de <mensajes>
  const bloqueMensajes = xmlString.match(/<mensajes>([\s\S]*?)<\/mensajes>/);
  if (!bloqueMensajes) return mensajes;
  const inner = bloqueMensajes[1];
  const re = /<mensaje>([\s\S]*?)<\/mensaje>(?=\s*(?:<mensaje>|<\/mensajes>))/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const blk = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
      const mm = blk.match(r);
      return mm ? mm[1].trim() : '';
    };
    mensajes.push({
      identificador: get('identificador'),
      mensaje: get('mensaje'),
      tipo: get('tipo'),
      informacionAdicional: get('informacionAdicional')
    });
  }
  return mensajes;
}

function parseRecepcionResponse(xmlString) {
  const estadoMatch = xmlString.match(/<estado>([^<]+)<\/estado>/);
  return {
    estado: estadoMatch ? estadoMatch[1] : 'DESCONOCIDO',
    mensajes: parseMensajesSri(xmlString),
    raw: xmlString
  };
}

function parseAutorizacionResponse(xmlString) {
  const estadoMatch = xmlString.match(/<estado>([^<]+)<\/estado>/);
  const numAutMatch = xmlString.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/);
  const fechaAutMatch = xmlString.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/);
  return {
    estado: estadoMatch ? estadoMatch[1] : 'DESCONOCIDO',
    numeroAutorizacion: numAutMatch ? numAutMatch[1] : null,
    fechaAutorizacion: fechaAutMatch ? fechaAutMatch[1] : null,
    mensajes: parseMensajesSri(xmlString),
    raw: xmlString
  };
}

// ============================================================
// Handler principal
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const {
    emisor, receptor, items, secuencial, formaPago, fechaEmision,
    p12Encrypted, p12Password, accion, claveAcceso, p12Base64
  } = req.body;

  try {
    // === ACCION: encriptar ===
    if (accion === 'encriptar') {
      if (!p12Base64) return res.status(400).json({ error: 'Falta p12Base64' });
      const encrypted = encryptP12(p12Base64);

      let fechaExpiracion = null;
      try {
        const der = forge.util.decode64(p12Base64);
        const asn1 = forge.asn1.fromDer(der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, p12Password || '');
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const bags = certBags[forge.pki.oids.certBag] || [];
        if (bags.length > 0) {
          const cert = bags.reduce((p, c) =>
            c.cert.extensions.length > p.cert.extensions.length ? c : p
          );
          fechaExpiracion = cert.cert.validity.notAfter.toISOString();
        }
      } catch (_) {}

      return res.status(200).json({ p12Encrypted: encrypted, fechaExpiracion });
    }

    // === ACCION: consultar ===
    if (accion === 'consultar') {
      if (!claveAcceso) return res.status(400).json({ error: 'Falta claveAcceso' });
      const soapBody = buildSoapAutorizacion(claveAcceso);
      const xmlResp = await postSoap(process.env.SRI_AUTHORIZATION_URL, soapBody);
      const parsed = parseAutorizacionResponse(typeof xmlResp === 'string' ? xmlResp : String(xmlResp));
      return res.status(200).json({ autorizacion: parsed });
    }

    // === ACCION: facturar ===
    if (!emisor || !receptor || !items?.length || !secuencial || !p12Encrypted || !p12Password) {
      return res.status(400).json({
        error: 'Faltan campos: emisor, receptor, items, secuencial, p12Encrypted, p12Password'
      });
    }

    const ambiente = process.env.SRI_AMBIENTE || '1';
    // Fecha en zona horaria Ecuador (UTC-5, sin DST). La Vercel Function
    // corre en UTC; sin esto, cerca de medianoche Ecuador la fecha
    // generada queda en el dia siguiente segun el reloj SRI y rechaza
    // con identificador 65 (FECHA EMISION EXTEMPORANEA).
    const fecha = fechaEmision || (() => {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = fmt.format(new Date()).split('-'); // [YYYY, MM, DD]
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    })();

    // Generar codigo numerico aleatorio (8 digitos)
    const codigoNumerico = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');

    // Clave de acceso
    const claveAccesoGen = generarClaveAcceso({
      fechaEmision: fecha,
      tipoComprobante: '01',
      ruc: emisor.ruc,
      ambiente,
      estab: emisor.estab,
      ptoEmi: emisor.ptoEmi,
      secuencial,
      codigoNumerico,
      tipoEmision: '1'
    });

    // XML sin firma
    const { xml: xmlSinFirma, totales } = buildFacturaXml({
      emisor, receptor, items, secuencial, formaPago, fechaEmision: fecha,
      claveAcceso: claveAccesoGen, ambiente
    });

    // Firma XAdES-BES
    const p12Buffer = decryptP12(p12Encrypted);
    const { privateKey, cert } = extraerClaveCertificado(p12Buffer, p12Password);
    const xmlFirmado = firmarXadesBes(xmlSinFirma, privateKey, cert);

    // Envio a SRI Recepcion
    const soapRecepcion = buildSoapRecepcion(xmlFirmado);
    const xmlRecepcion = await postSoap(process.env.SRI_RECEPTION_URL, soapRecepcion);
    const xmlRecepcionStr = typeof xmlRecepcion === 'string' ? xmlRecepcion : String(xmlRecepcion);
    const respRecepcion = parseRecepcionResponse(xmlRecepcionStr);

    if (respRecepcion.estado !== 'RECIBIDA') {
      return res.status(422).json({
        error: 'SRI rechazo el comprobante en recepcion',
        estado: respRecepcion.estado,
        mensajes: respRecepcion.mensajes,
        detalle: respRecepcion.raw.slice(0, 3000),
        claveAcceso: claveAccesoGen
      });
    }

    // Esperar 2s y consultar autorizacion
    await new Promise(r => setTimeout(r, 2000));
    const soapAut = buildSoapAutorizacion(claveAccesoGen);
    const xmlAut = await postSoap(process.env.SRI_AUTHORIZATION_URL, soapAut);
    const xmlAutStr = typeof xmlAut === 'string' ? xmlAut : String(xmlAut);
    const respAut = parseAutorizacionResponse(xmlAutStr);

    if (respAut.estado !== 'AUTORIZADO') {
      return res.status(422).json({
        error: `SRI estado: ${respAut.estado}`,
        mensajes: respAut.mensajes,
        detalle: respAut.raw.slice(0, 3000),
        claveAcceso: claveAccesoGen,
        estado: respAut.estado
      });
    }

    return res.status(200).json({
      ok: true,
      claveAcceso: claveAccesoGen,
      numeroAutorizacion: respAut.numeroAutorizacion,
      fechaAutorizacion: respAut.fechaAutorizacion,
      estado: 'AUTORIZADO',
      numeroFactura: `${emisor.estab}-${emisor.ptoEmi}-${secuencial}`,
      totales: {
        subtotal: totales.totalSinImpuestos.toFixed(2),
        descuento: totales.totalDescuento.toFixed(2),
        total: totales.importeTotal.toFixed(2)
      },
      items,
      receptor,
      fechaEmision: fecha,
      xmlFirmado
    });

  } catch (err) {
    console.error('[facturar]', err);
    return res.status(500).json({
      error: 'Error interno al procesar la factura',
      mensaje: err.message,
      stack: (err.stack || '').slice(0, 1000)
    });
  }
}
