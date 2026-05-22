// services/catalogo.js
// Catalogo de servicios (mano de obra) y repuestos preconfigurados con
// precio sugerido. Usado en OTDetail para autocompletar tareas/repuestos
// y en ConfiguracionForm para gestionar el catalogo.
//
// Modelo: catalogo/{id} = {
//   nombre: 'Cambio de aceite',
//   precio: 35.00,
//   tipo: 'mano_obra' | 'repuesto',
//   activo: true,
//   createdAt, createdBy
// }

import { db } from './firestore';
import { withActor } from './auth';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';

const COLLECTION = 'catalogo';

function catalogoCollection() {
  return collection(db, COLLECTION);
}

export async function listCatalogo(tipo) {
  // tipo opcional: 'mano_obra' | 'repuesto' | null (todos)
  const q = tipo
    ? query(catalogoCollection(), where('tipo', '==', tipo), orderBy('nombre', 'asc'))
    : query(catalogoCollection(), orderBy('nombre', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCatalogoItem(session, { nombre, precio, tipo }) {
  if (!nombre || !nombre.trim()) throw new Error('Nombre requerido.');
  if (!['mano_obra', 'repuesto'].includes(tipo)) {
    throw new Error('Tipo invalido. Debe ser mano_obra o repuesto.');
  }
  const data = withActor(session, {
    nombre: nombre.trim(),
    precio: Number(precio) || 0,
    tipo,
    activo: true,
    createdAt: serverTimestamp(),
    createdBy: session.userId
  });
  const ref = await addDoc(catalogoCollection(), data);
  return { id: ref.id, ...data };
}

export async function updateCatalogoItem(session, id, { nombre, precio }) {
  const patch = withActor(session, {});
  if (nombre !== undefined) patch.nombre = String(nombre).trim();
  if (precio !== undefined) patch.precio = Number(precio) || 0;
  await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function deleteCatalogoItem(_session, id) {
  await deleteDoc(doc(db, COLLECTION, id));
}
