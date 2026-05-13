// services/whatsapp.js
// Envio de WhatsApp via Click-to-Chat con plantillas y registro.
// Patron estandar v2.2+

import { db } from './firestore';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Las 5 plantillas estandar de TALLER. Las variables disponibles
 * dependen del contexto donde se monta el boton WhatsApp; las que
 * no se rellenan quedan vacias en el mensaje.
 */
export const WHATSAPP_TEMPLATES = [
  {
    id: 'confirmacion_recepcion',
    name: 'Confirmacion de recepcion',
    template: 'Hola {clientName}, recibimos tu vehiculo {vehiclePlaca} ({vehicleMarca} {vehicleModelo}). Te avisamos al avanzar.'
  },
  {
    id: 'cotizacion_lista',
    name: 'Cotizacion lista',
    template: 'Hola {clientName}, terminamos el diagnostico de tu {vehicleMarca} {vehicleModelo} placa {vehiclePlaca}. El presupuesto es ${totalGeneral}. Aprobamos?'
  },
  {
    id: 'vehiculo_listo',
    name: 'Vehiculo listo',
    template: 'Hola {clientName}, tu {vehicleMarca} {vehicleModelo} placa {vehiclePlaca} esta listo. Total ${totalGeneral}. Te esperamos para que lo recojas.'
  },
  {
    id: 'recordatorio_mantenimiento',
    name: 'Recordatorio de mantenimiento',
    template: 'Hola {clientName}, tu {vehicleMarca} {vehicleModelo} placa {vehiclePlaca} ya cumplio el periodo de mantenimiento. Coordinamos tu proxima cita?'
  },
  {
    id: 'gracias_pago',
    name: 'Gracias por el pago',
    template: 'Hola {clientName}, gracias por tu pago de ${monto} por el trabajo en {vehiclePlaca}. Estamos a tu orden.'
  }
];

export function templatesByIds(ids) {
  return WHATSAPP_TEMPLATES.filter(t => ids.includes(t.id));
}

/**
 * Limpia un numero ecuatoriano y devuelve formato internacional.
 * Acepta: +593 99 999 9999, 099-999-9999, 0999999999, 593999999999.
 * Devuelve: 593999999999
 */
export function cleanEcuadorianPhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');

  if (digits.startsWith('593') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '593' + digits.slice(1);
  if (digits.length === 9 && digits.startsWith('9')) return '593' + digits;

  return null;
}

/**
 * Renderiza una plantilla con variables.
 */
export function renderTemplate(template, variables = {}) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll('{' + key + '}', String(value ?? ''));
  }
  return result;
}

/**
 * Abre WhatsApp Click-to-Chat con mensaje pre-llenado y registra el evento.
 */
export async function sendWhatsApp({ phone, message, session, context = {} }) {
  const cleaned = cleanEcuadorianPhone(phone);
  if (!cleaned) {
    throw new Error('Numero de telefono invalido');
  }
  if (!message || message.trim().length === 0) {
    throw new Error('Mensaje vacio');
  }

  if (session) {
    try {
      await addDoc(collection(db, '_whatsapp_events'), {
        actorId: session.userId,
        actorRole: session.role,
        toPhone: cleaned,
        message: message.slice(0, 500),
        templateName: context.templateName || null,
        relatedCollection: context.collection || null,
        relatedDocId: context.docId || null,
        action: context.action || 'send',
        sentAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('No se pudo registrar evento WhatsApp:', err);
    }
  }

  const url = 'https://wa.me/' + cleaned + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank', 'noopener,noreferrer');
}
