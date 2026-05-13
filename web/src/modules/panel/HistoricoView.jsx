import { useState } from 'react';
import { HistoricoViewer } from '../../components/HistoricoViewer';
import { ExcelExporter } from '../../components/ExcelExporter';
import styles from './HistoricoView.module.css';

const EXPORT_SOURCES = [
  { name: 'workOrders', collection: 'workOrders', dateField: 'createdAt' },
  { name: 'payments', collection: 'payments', dateField: 'paidAt' },
  { name: 'clients', collection: 'clients' },
  { name: 'vehicles', collection: 'vehicles' }
];

const COLUMNAS_OT = [
  { key: 'vehiclePlaca', label: 'Placa' },
  { key: 'clientName', label: 'Cliente' },
  { key: 'status', label: 'Status' },
  { key: 'mechanicName', label: 'Mecanico' },
  { key: 'totalGeneral', label: 'Total', render: v => `$${Number(v || 0).toFixed(2)}` }
];

const COLUMNAS_PAYMENT = [
  { key: 'clientName', label: 'Cliente' },
  { key: 'vehiclePlaca', label: 'Placa' },
  { key: 'formaPago', label: 'Forma de pago' },
  { key: 'monto', label: 'Monto', render: v => `$${Number(v || 0).toFixed(2)}` },
  { key: 'receivedByName', label: 'Cobrado por' }
];

export default function HistoricoView({ navigate, auth }) {
  const [tab, setTab] = useState('workOrders');

  if (auth.role !== 'owner' && auth.role !== 'manager') {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Acceso restringido.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('panel')}
        >
          &larr; Volver al panel
        </button>
        <h1 className={styles.title}>Historico</h1>
      </header>

      <section className={styles.exportSection}>
        <h2 className={styles.exportTitle}>Respaldo Excel</h2>
        <p className={styles.exportHint}>
          Descarga workOrders, payments, clients y vehicles del periodo
          seleccionado en un solo archivo .xlsx.
        </p>
        <ExcelExporter
          sources={EXPORT_SOURCES}
          filenamePrefix="taller-respaldo"
          auth={auth}
        />
      </section>

      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === 'workOrders' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setTab('workOrders')}
        >
          OTs cerradas
        </button>
        <button
          type="button"
          className={tab === 'payments' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setTab('payments')}
        >
          Cobros
        </button>
      </div>

      <div className={styles.body}>
        {tab === 'workOrders' ? (
          <HistoricoViewer
            entidad="workOrders"
            columnas={COLUMNAS_OT}
            auth={auth}
          />
        ) : (
          <HistoricoViewer
            entidad="payments"
            columnas={COLUMNAS_PAYMENT}
            auth={auth}
          />
        )}
      </div>
    </div>
  );
}
