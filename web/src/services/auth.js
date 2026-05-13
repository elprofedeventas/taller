// services/auth.js
// Auth con PIN propio sobre Firestore. Sin Cloud Functions.
// Patron estandar Nueva Orbita v2.2+ para WAPs en plan Spark.
//
// Cinco capas de defensa + deteccion de cuenta pausada:
//   1. PIN hasheado SHA-256 + salt unico por usuario
//   2. Sesion en React state (no localStorage)
//   3. Reglas Firestore validan forma del dato y actorRole
//   4. Audit log inmutable en coleccion _audit
//   5. Honeypot opcional para detectar actividad anomala
//   v2.2+ Deteccion de pausedReason en login + audit de intentos bloqueados
//
// Offline: la lectura de users durante login() esta envuelta en un
// timeout de 5s. Si Firestore no responde en ese tiempo (sin red, sin
// cache poblada), se lanza Error('OFFLINE'). El audit log en cambio
// se deja encolar offline para sincronizar al reconectar.

import { db } from './firestore';
import {
  collection, getDocs,
  serverTimestamp, addDoc
} from 'firebase/firestore';

const OFFLINE_TIMEOUT_MS = 5000;

async function withOfflineTimeout(promise, ms) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('OFFLINE')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function hashPin(pin, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + ':' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Valida PIN contra Firestore y retorna sesion.
 * v2.2: detecta tambien cuentas pausadas por pago vencido o sin uso,
 * y audita esos intentos para detectar mora activa vs churn silencioso.
 *
 * Throws (errores conocidos):
 *   - 'OFFLINE': la lectura de users no respondio en 5s
 *   - 'ACCOUNT_PAUSED_PAYMENT': pausada por pago vencido
 *   - 'ACCOUNT_INACTIVE': inactiva por otra razon
 *   - 'PIN invalido': formato del PIN incorrecto
 */
export async function login(pin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN invalido: deben ser 4 digitos');
  }

  // v2.2: leemos TODOS los users (no solo active), para detectar pausados.
  // El timeout corta la lectura si Firestore se queda esperando red.
  const snapshot = await withOfflineTimeout(
    getDocs(collection(db, 'users')),
    OFFLINE_TIMEOUT_MS
  );

  for (const userDoc of snapshot.docs) {
    const user = userDoc.data();
    const candidateHash = await hashPin(pin, user.pinSalt);
    if (candidateHash === user.pinHash) {
      // Match en el PIN. Verificar si la cuenta esta activa.
      if (user.active === false) {
        // Sesion ficticia solo para el audit log: el usuario fue
        // identificado pero no se le retorna sesion.
        const blockedSession = {
          userId: userDoc.id,
          role: user.role,
          name: user.name
        };
        if (user.pausedReason === 'PAYMENT_OVERDUE') {
          await logEvent(blockedSession, 'LOGIN_BLOCKED_PAUSED_PAYMENT', 'users');
          throw new Error('ACCOUNT_PAUSED_PAYMENT');
        }
        await logEvent(blockedSession, 'LOGIN_BLOCKED_INACTIVE', 'users');
        throw new Error('ACCOUNT_INACTIVE');
      }

      const session = {
        userId: userDoc.id,
        name: user.name,
        role: user.role,
        locationId: user.locationId || null,
        loggedInAt: new Date()
      };
      await logEvent(session, 'LOGIN_SUCCESS', 'users');
      return session;
    }
  }

  await logFailedLogin();
  return null;
}

export async function createUser(session, { name, pin, role, locationId }) {
  if (session.role !== 'owner') {
    throw new Error('Solo el owner puede crear usuarios');
  }

  const salt = generateSalt();
  const pinHash = await hashPin(pin, salt);

  await addDoc(collection(db, 'users'), withActor(session, {
    name,
    role,
    locationId: locationId || null,
    pinHash,
    pinSalt: salt,
    active: true,
    createdAt: serverTimestamp()
  }));

  await logEvent(session, 'CREATE_USER', 'users');
}

export function withActor(session, data) {
  if (!session) {
    throw new Error('Sin sesion: no se puede escribir a Firestore');
  }
  return {
    ...data,
    actorId: session.userId,
    actorRole: session.role
  };
}

// El audit log se deja encolar offline. Si no hay red, addDoc resuelve
// localmente y sincroniza al reconectar - comportamiento deseado para
// no perder eventos de login bloqueado.
async function logEvent(session, action, collectionName) {
  await addDoc(collection(db, '_audit'), {
    actorId: session.userId,
    actorRole: session.role,
    actorName: session.name || null,
    action,
    collection: collectionName,
    timestamp: serverTimestamp()
  });
}

async function logFailedLogin() {
  await addDoc(collection(db, '_audit'), {
    actorId: 'UNKNOWN',
    actorRole: 'none',
    actorName: null,
    action: 'LOGIN_FAILED',
    collection: 'users',
    timestamp: serverTimestamp()
  });
}
