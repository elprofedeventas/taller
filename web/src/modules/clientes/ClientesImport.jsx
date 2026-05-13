import { useState } from 'react';
import { ExcelImporter } from '../../components/ExcelImporter';
import { createClientsBatch, searchByPhone, searchByName } from '../../services/clientes';
import { createVehiclesBatch } from '../../services/vehiculos';
import { normalizePhone } from '../../utils/normalizePhone';
import { normalizePlaca } from '../../utils/normalizePlaca';
import styles from './ClientesImport.module.css';

export default function ClientesImport({ navigate, auth }) {
  const [tab, setTab] = useState('clientes');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('clientes')}
        >
          &larr; Volver
        </button>
        <h1 className={styles.title}>Importar desde Excel</h1>
      </header>

      <p className={styles.hint}>
        Recomendado: importar primero clientes, despues vehiculos. Cada
        vehiculo necesita un cliente ya registrado (lo busca por telefono
        o por nombre exacto).
      </p>

      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === 'clientes' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setTab('clientes')}
        >
          Clientes
        </button>
        <button
          type="button"
          className={tab === 'vehiculos' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setTab('vehiculos')}
        >
          Vehiculos
        </button>
      </div>

      <div className={styles.body}>
        {tab === 'clientes' ? (
          <ClientesTab auth={auth} />
        ) : (
          <VehiculosTab auth={auth} />
        )}
      </div>
    </div>
  );
}

function ClientesTab({ auth }) {
  const columnMap = {
    'Nombre': 'name',
    'Telefono': 'phone',
    'Email': 'email'
  };
  const requiredColumns = ['Nombre', 'Telefono'];
  const transforms = {
    name: v => String(v || '').trim(),
    phone: v => String(v || '').trim(),
    email: v => (v ? String(v).trim() : null)
  };
  const validators = {
    name: v => !!v && v.length > 0,
    phone: v => !!normalizePhone(v)
  };

  async function handleConfirm(rows) {
    await createClientsBatch(auth.session, rows);
  }

  return (
    <div className={styles.importerWrap}>
      <p className={styles.help}>
        Columnas requeridas: <strong>Nombre</strong>, <strong>Telefono</strong>.
        Opcional: <strong>Email</strong>.
      </p>
      <ExcelImporter
        columnMap={columnMap}
        requiredColumns={requiredColumns}
        transforms={transforms}
        validators={validators}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function VehiculosTab({ auth }) {
  const columnMap = {
    'Placa': 'placa',
    'Marca': 'marca',
    'Modelo': 'modelo',
    'Año': 'year',
    'Color': 'color',
    'Kilometraje': 'lastKm',
    'TelefonoCliente': 'clientPhone',
    'NombreCliente': 'clientName'
  };
  const requiredColumns = ['Placa', 'Marca', 'Modelo'];
  const transforms = {
    placa: v => normalizePlaca(v),
    marca: v => String(v || '').trim(),
    modelo: v => String(v || '').trim(),
    year: v => (v ? Number(v) : null),
    color: v => (v ? String(v).trim() : null),
    lastKm: v => (v && v !== '' ? Number(v) : null),
    clientPhone: v => (v ? String(v).trim() : null),
    clientName: v => (v ? String(v).trim() : null)
  };
  const validators = {
    placa: v => !!v && v.length > 0,
    marca: v => !!v && v.length > 0,
    modelo: v => !!v && v.length > 0
  };

  async function handleConfirm(rows) {
    const errors = [];
    const enriched = [];

    for (const row of rows) {
      let client = null;
      if (row.clientPhone) {
        const matches = await searchByPhone(row.clientPhone);
        if (matches.length > 0) client = matches[0];
      }
      if (!client && row.clientName) {
        const matches = await searchByName(row.clientName);
        const target = row.clientName.toLowerCase().trim();
        client = matches.find(m => (m.nameLower || '').trim() === target) || null;
      }
      if (!client) {
        errors.push(`Placa ${row.placa}: cliente no encontrado (telefono "${row.clientPhone}" o nombre "${row.clientName}").`);
        continue;
      }
      enriched.push({
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        placa: row.placa,
        marca: row.marca,
        modelo: row.modelo,
        year: row.year,
        color: row.color,
        lastKm: row.lastKm
      });
    }

    if (enriched.length > 0) {
      await createVehiclesBatch(auth.session, enriched);
    }
    if (errors.length > 0) {
      throw new Error(
        `${enriched.length} vehiculo(s) creados. ${errors.length} sin cliente:\n` +
        errors.slice(0, 5).join('\n') +
        (errors.length > 5 ? `\n...y ${errors.length - 5} mas.` : '')
      );
    }
  }

  return (
    <div className={styles.importerWrap}>
      <p className={styles.help}>
        Columnas requeridas: <strong>Placa</strong>, <strong>Marca</strong>,
        <strong> Modelo</strong>. Opcional: Año, Color, Kilometraje.
        Para vincular al cliente: <strong>TelefonoCliente</strong> o
        <strong> NombreCliente</strong> (debe coincidir con un cliente ya
        existente).
      </p>
      <ExcelImporter
        columnMap={columnMap}
        requiredColumns={requiredColumns}
        transforms={transforms}
        validators={validators}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
