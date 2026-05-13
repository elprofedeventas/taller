import { useState, useEffect, useMemo } from 'react';
import {
  getOT, updateOT, calculateTotals, round2,
  nextStatus, STATUS_LABEL
} from '../../services/workOrders';
import { listMechanics } from '../../services/users';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { templatesByIds } from '../../services/whatsapp';
import StatusBadge from './StatusBadge';
import styles from './OTDetail.module.css';

const FINAL_STATUSES = new Set(['entregado', 'cancelado']);

export default function OTDetail({ otId, navigate, auth }) {
  const [ot, setOT] = useState(null);
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editable working state (no se persiste hasta Guardar)
  const [tasks, setTasks] = useState([]);
  const [parts, setParts] = useState([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [o, mechs] = await Promise.all([getOT(otId), listMechanics()]);
        if (cancelled) return;
        if (!o) {
          setError('OT no encontrada.');
        } else {
          setOT(o);
          setTasks(o.tasks || []);
          setParts(o.parts || []);
          setMechanics(mechs);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [otId]);

  const computedTotals = useMemo(
    () => calculateTotals(tasks, parts),
    [tasks, parts]
  );

  // Permisos basados en rol + estado de la OT
  const isMechanic = auth.role === 'mechanic';
  const isOwnerOrManager = auth.role === 'owner' || auth.role === 'manager';

  const isMyOT = ot && ot.mechanicId === auth.userId;
  const isFinal = ot && FINAL_STATUSES.has(ot.status);

  const canEditLists =
    !isFinal && (
      !isMechanic
        ? true
        : isMyOT
    );
  const canChangeMechanic = !isMechanic && !isFinal;
  const canAdvanceStatus =
    !isFinal && (
      isMechanic
        ? isMyOT
        : true
    );
  const canCancel = isOwnerOrManager && !isFinal;

  const next = ot ? nextStatus(ot.status) : null;
  const persistedTotalsDiverge = ot && (
    round2(ot.totalLabor) !== computedTotals.totalLabor ||
    round2(ot.totalParts) !== computedTotals.totalParts ||
    round2(ot.totalGeneral) !== computedTotals.totalGeneral
  );

  function handleAddTask() {
    setTasks(prev => [...prev, { descripcion: '', horas: 1, precioUnit: 0, total: 0 }]);
  }

  function handleUpdateTask(index, fields) {
    setTasks(prev => prev.map((t, i) => {
      if (i !== index) return t;
      const merged = { ...t, ...fields };
      merged.total = round2(Number(merged.horas || 0) * Number(merged.precioUnit || 0));
      return merged;
    }));
  }

  function handleRemoveTask(index) {
    setTasks(prev => prev.filter((_, i) => i !== index));
  }

  function handleAddPart() {
    setParts(prev => [...prev, { descripcion: '', cantidad: 1, precioUnit: 0, total: 0 }]);
  }

  function handleUpdatePart(index, fields) {
    setParts(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const merged = { ...p, ...fields };
      merged.total = round2(Number(merged.cantidad || 0) * Number(merged.precioUnit || 0));
      return merged;
    }));
  }

  function handleRemovePart(index) {
    setParts(prev => prev.filter((_, i) => i !== index));
  }

  async function refreshOT() {
    const fresh = await getOT(otId);
    if (fresh) {
      setOT(fresh);
      setTasks(fresh.tasks || []);
      setParts(fresh.parts || []);
    }
  }

  async function handleSaveLists() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const patch = { tasks, parts };
      // Solo owner/manager pueden persistir totales (rules Firestore).
      if (isOwnerOrManager) {
        const totals = calculateTotals(tasks, parts);
        patch.totalLabor = totals.totalLabor;
        patch.totalParts = totals.totalParts;
        patch.totalGeneral = totals.totalGeneral;
      }
      await updateOT(auth.session, otId, patch);
      await refreshOT();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignMechanic(newMechId) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const mech = mechanics.find(m => m.id === newMechId);
      await updateOT(auth.session, otId, {
        mechanicId: newMechId || null,
        mechanicName: mech ? mech.name : null
      });
      await refreshOT();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvanceStatus() {
    if (saving || !ot || !next) return;
    setSaving(true);
    setError(null);
    try {
      await updateOT(auth.session, otId, { status: next });
      await refreshOT();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (saving || !ot) return;
    const ok = window.confirm('Cancelar esta OT? La accion no se puede deshacer.');
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await updateOT(auth.session, otId, { status: 'cancelado' });
      await refreshOT();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className={styles.container}><p>Cargando...</p></div>;
  }
  if (error && !ot) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.back} onClick={() => navigate('ot')}>
          &larr; Volver
        </button>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }
  if (!ot) return null;

  // Mecanico intentando abrir OT que no es suya.
  if (isMechanic && !isMyOT) {
    return (
      <div className={styles.container}>
        <button type="button" className={styles.back} onClick={() => navigate('ot')}>
          &larr; Volver
        </button>
        <p className={styles.error}>Esta OT no esta asignada a ti.</p>
      </div>
    );
  }

  const listsDirty =
    JSON.stringify(tasks) !== JSON.stringify(ot.tasks || []) ||
    JSON.stringify(parts) !== JSON.stringify(ot.parts || []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('ot')}
        >
          &larr; Volver
        </button>
        <h1 className={styles.title}>Orden de Trabajo</h1>
        <StatusBadge status={ot.status} />
        <WhatsAppButton
          phone={ot.clientPhone}
          templates={templatesByIds([
            'confirmacion_recepcion',
            'cotizacion_lista',
            'vehiculo_listo'
          ])}
          variables={{
            clientName: ot.clientName,
            vehiclePlaca: ot.vehiclePlaca,
            vehicleMarca: ot.vehicleMarca,
            vehicleModelo: ot.vehicleModelo,
            totalGeneral: computedTotals.totalGeneral.toFixed(2)
          }}
          context={{ collection: 'workOrders', docId: ot.id }}
          buttonLabel="WhatsApp"
          auth={auth}
        />
      </header>

      <section className={styles.section}>
        <h2 className={styles.subtitle}>Vehiculo y cliente</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Placa</span>
            <span className={styles.placa}>{ot.vehiclePlaca}</span>
          </div>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Modelo</span>
            <span>{ot.vehicleMarca} {ot.vehicleModelo}</span>
          </div>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Cliente</span>
            <span>{ot.clientName}</span>
          </div>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Telefono</span>
            <span>{ot.clientPhone}</span>
          </div>
        </div>
        <div className={styles.problemaBlock}>
          <span className={styles.infoLabel}>Problema reportado</span>
          <p className={styles.problemaText}>{ot.problema || '—'}</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subtitle}>Mecanico asignado</h2>
        {canChangeMechanic ? (
          <select
            className={styles.select}
            value={ot.mechanicId || ''}
            onChange={e => handleAssignMechanic(e.target.value)}
            disabled={saving}
          >
            <option value="">Sin asignar</option>
            {mechanics.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <p className={styles.staticInfo}>{ot.mechanicName || 'Sin asignar'}</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.subtitle}>Mano de obra</h2>
          <span className={styles.totalSection}>
            ${computedTotals.totalLabor.toFixed(2)}
          </span>
        </div>
        {tasks.length === 0 && (
          <p className={styles.emptyHint}>Sin tareas registradas.</p>
        )}
        {tasks.map((t, i) => (
          <div key={i} className={styles.lineRow}>
            <input
              type="text"
              className={`${styles.lineInput} ${styles.lineDesc}`}
              placeholder="Descripcion"
              value={t.descripcion}
              onChange={e => handleUpdateTask(i, { descripcion: e.target.value })}
              disabled={!canEditLists || saving}
            />
            <input
              type="number"
              className={`${styles.lineInput} ${styles.lineSmall}`}
              placeholder="Horas"
              value={t.horas}
              onChange={e => handleUpdateTask(i, { horas: e.target.value })}
              step="0.5"
              min="0"
              disabled={!canEditLists || saving}
            />
            <input
              type="number"
              className={`${styles.lineInput} ${styles.lineSmall}`}
              placeholder="Precio"
              value={t.precioUnit}
              onChange={e => handleUpdateTask(i, { precioUnit: e.target.value })}
              step="0.01"
              min="0"
              disabled={!canEditLists || saving}
            />
            <span className={styles.lineTotal}>
              ${Number(t.total || 0).toFixed(2)}
            </span>
            {canEditLists && (
              <button
                type="button"
                className={styles.removeLine}
                onClick={() => handleRemoveTask(i)}
                disabled={saving}
                aria-label="Eliminar tarea"
              >
                &times;
              </button>
            )}
          </div>
        ))}
        {canEditLists && (
          <button
            type="button"
            className={styles.addLine}
            onClick={handleAddTask}
            disabled={saving}
          >
            + Tarea
          </button>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.subtitle}>Repuestos</h2>
          <span className={styles.totalSection}>
            ${computedTotals.totalParts.toFixed(2)}
          </span>
        </div>
        {parts.length === 0 && (
          <p className={styles.emptyHint}>Sin repuestos registrados.</p>
        )}
        {parts.map((p, i) => (
          <div key={i} className={styles.lineRow}>
            <input
              type="text"
              className={`${styles.lineInput} ${styles.lineDesc}`}
              placeholder="Descripcion"
              value={p.descripcion}
              onChange={e => handleUpdatePart(i, { descripcion: e.target.value })}
              disabled={!canEditLists || saving}
            />
            <input
              type="number"
              className={`${styles.lineInput} ${styles.lineSmall}`}
              placeholder="Cantidad"
              value={p.cantidad}
              onChange={e => handleUpdatePart(i, { cantidad: e.target.value })}
              step="1"
              min="0"
              disabled={!canEditLists || saving}
            />
            <input
              type="number"
              className={`${styles.lineInput} ${styles.lineSmall}`}
              placeholder="Precio"
              value={p.precioUnit}
              onChange={e => handleUpdatePart(i, { precioUnit: e.target.value })}
              step="0.01"
              min="0"
              disabled={!canEditLists || saving}
            />
            <span className={styles.lineTotal}>
              ${Number(p.total || 0).toFixed(2)}
            </span>
            {canEditLists && (
              <button
                type="button"
                className={styles.removeLine}
                onClick={() => handleRemovePart(i)}
                disabled={saving}
                aria-label="Eliminar repuesto"
              >
                &times;
              </button>
            )}
          </div>
        ))}
        {canEditLists && (
          <button
            type="button"
            className={styles.addLine}
            onClick={handleAddPart}
            disabled={saving}
          >
            + Repuesto
          </button>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.totalsBlock}>
          <span className={styles.totalGeneralLabel}>Total general</span>
          <span className={styles.totalGeneralValue}>
            ${computedTotals.totalGeneral.toFixed(2)}
          </span>
        </div>
        {persistedTotalsDiverge && !isOwnerOrManager && (
          <p className={styles.divergeHint}>
            Los totales mostrados se calculan en vivo. Se persistiran al
            cierre con cobro o cuando un manager guarde la OT.
          </p>
        )}
      </section>

      {error && (
        <p className={styles.error} role="alert">{error}</p>
      )}

      {canEditLists && (
        <div className={styles.actionsBar}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSaveLists}
            disabled={saving || !listsDirty}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}

      <section className={styles.statusActions}>
        {canAdvanceStatus && next && (
          <button
            type="button"
            className={styles.advanceButton}
            onClick={handleAdvanceStatus}
            disabled={saving}
          >
            Marcar como {STATUS_LABEL[next]}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancelar OT
          </button>
        )}
        {ot.status === 'listo' && !isMechanic && (
          <button
            type="button"
            className={styles.advanceButton}
            onClick={() => navigate('cobro-form', { otId: ot.id })}
            disabled={saving}
          >
            Cobrar OT
          </button>
        )}
      </section>
    </div>
  );
}
