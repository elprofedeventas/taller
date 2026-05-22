import { useState, useEffect, useMemo } from 'react';
import {
  getOT, updateOT, changeOTStatus, calculateTotals, round2,
  nextStatus, STATUS_LABEL
} from '../../services/workOrders';
import { getClient, updateClient } from '../../services/clientes';
import { listMechanics } from '../../services/users';
import { listCatalogo } from '../../services/catalogo';
import { getTallerConfig } from '../../services/config';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { templatesByIds } from '../../services/whatsapp';
import BotonFacturar from '../facturacion/BotonFacturar';
import { otToFacturaItems, otToReceptor } from '../facturacion/otHelpers';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import StatusBadge from './StatusBadge';
import Stepper from './Stepper';
import CotizacionPDF from './CotizacionPDF';
import styles from './OTDetail.module.css';

const FINAL_STATUSES = new Set(['entregado', 'cancelado']);

export default function OTDetail({ otId, navigate, auth }) {
  const [ot, setOT] = useState(null);
  const [client, setClient] = useState(null);
  const [mechanics, setMechanics] = useState([]);
  const [catalogoMO, setCatalogoMO] = useState([]);
  const [catalogoRep, setCatalogoRep] = useState([]);
  const [tallerConfig, setTallerConfig] = useState(null);
  const [mostrarCotizacion, setMostrarCotizacion] = useState(false);
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
        const [o, mechs, catMO, catRep, cfg] = await Promise.all([
          getOT(otId),
          listMechanics(),
          listCatalogo('mano_obra').catch(() => []),
          listCatalogo('repuesto').catch(() => []),
          getTallerConfig().catch(() => null)
        ]);
        if (cancelled) return;
        setTallerConfig(cfg);
        if (!o) {
          setError('OT no encontrada.');
        } else {
          setOT(o);
          setTasks(o.tasks || []);
          setParts(o.parts || []);
          setMechanics(mechs);
          setCatalogoMO(catMO);
          setCatalogoRep(catRep);
          // Fetch cliente fresco para precargar receptor de factura.
          if (o.clientId) {
            getClient(o.clientId).then(c => {
              if (!cancelled) setClient(c);
            }).catch(() => {});
          }
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

  // Permisos basados en rol + estado de la OT
  const isMechanic = auth.role === 'mechanic';
  const isOwnerOrManager = auth.role === 'owner' || auth.role === 'manager';

  // costoHora del mecanico asignado (para calcular margen). Lookup en la
  // lista de mecanicos cargados; ausencia -> 0 (no afecta margen).
  const mecanicoAsignado = ot
    ? mechanics.find(m => m.id === ot.mechanicId) || null
    : null;
  const costoHoraMecanico = Number(mecanicoAsignado?.costoHora || 0);

  const computedTotals = useMemo(
    () => calculateTotals(tasks, parts, costoHoraMecanico),
    [tasks, parts, costoHoraMecanico]
  );

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

  function handleTaskDescChange(index, value) {
    // Si el valor matchea un item del catalogo de mano de obra, autocompleta
    // el precioUnit. El usuario puede editarlo despues.
    const match = catalogoMO.find(c => c.nombre === value);
    if (match) {
      handleUpdateTask(index, { descripcion: value, precioUnit: match.precio });
    } else {
      handleUpdateTask(index, { descripcion: value });
    }
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

  function handlePartDescChange(index, value) {
    const match = catalogoRep.find(c => c.nombre === value);
    if (match) {
      handleUpdatePart(index, { descripcion: value, precioUnit: match.precio });
    } else {
      handleUpdatePart(index, { descripcion: value });
    }
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
      // Si hay costoHora del mecanico o costos en parts, tambien persistimos
      // los campos de rentabilidad para que el Panel los pueda agregar
      // por mes sin tener que recalcular desde el mecanico.
      if (isOwnerOrManager) {
        const totals = calculateTotals(tasks, parts, costoHoraMecanico);
        patch.totalLabor = totals.totalLabor;
        patch.totalParts = totals.totalParts;
        patch.totalGeneral = totals.totalGeneral;
        patch.costoRepuestos = totals.costoRepuestos;
        patch.costoManoObra = totals.costoManoObra;
        patch.costoTotal = totals.costoTotal;
        patch.margenBruto = totals.margenBruto;
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
    // Guard: si hay cambios sin guardar en tareas/repuestos, bloquear
    // el avance hasta que el usuario guarde explicitamente.
    if (listsDirty) {
      setError('Primero, guarda el registro de mano de obra y/o repuestos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeOTStatus(auth.session, otId, next);
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
      await changeOTStatus(auth.session, otId, 'cancelado');
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
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{ot.numeroOT || 'Orden de Trabajo'}</h1>
          {ot.numeroOT && <span className={styles.titleSub}>Orden de Trabajo</span>}
        </div>
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

      <Stepper ot={ot} />

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
            <span>{formatPhoneForDisplay(ot.clientPhone)}</span>
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
        {catalogoMO.length > 0 && (
          <datalist id="catalogo-mano-obra">
            {catalogoMO.map(c => (
              <option key={c.id} value={c.nombre}>
                ${Number(c.precio || 0).toFixed(2)}
              </option>
            ))}
          </datalist>
        )}
        {tasks.map((t, i) => (
          <div key={i} className={styles.lineRow}>
            <input
              type="text"
              list={catalogoMO.length > 0 ? 'catalogo-mano-obra' : undefined}
              className={`${styles.lineInput} ${styles.lineDesc}`}
              placeholder="Descripcion"
              value={t.descripcion}
              onChange={e => handleTaskDescChange(i, e.target.value)}
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
        {catalogoRep.length > 0 && (
          <datalist id="catalogo-repuestos">
            {catalogoRep.map(c => (
              <option key={c.id} value={c.nombre}>
                ${Number(c.precio || 0).toFixed(2)}
              </option>
            ))}
          </datalist>
        )}
        {parts.map((p, i) => (
          <div key={i} className={styles.lineRow}>
            <input
              type="text"
              list={catalogoRep.length > 0 ? 'catalogo-repuestos' : undefined}
              className={`${styles.lineInput} ${styles.lineDesc}`}
              placeholder="Descripcion"
              value={p.descripcion}
              onChange={e => handlePartDescChange(i, e.target.value)}
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
            {isOwnerOrManager && (
              <input
                type="number"
                className={`${styles.lineInput} ${styles.lineSmall} ${styles.lineCosto}`}
                placeholder="Costo"
                title="Costo unitario (lo que pagamos al proveedor)"
                value={p.costo || ''}
                onChange={e => handleUpdatePart(i, { costo: e.target.value })}
                step="0.01"
                min="0"
                disabled={!canEditLists || saving}
              />
            )}
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

        {isOwnerOrManager && computedTotals.costoTotal > 0 && (
          <div className={styles.rentabilidadBox}>
            <div className={styles.rentRow}>
              <span>Costo repuestos</span>
              <span>${computedTotals.costoRepuestos.toFixed(2)}</span>
            </div>
            <div className={styles.rentRow}>
              <span>Costo mano de obra</span>
              <span>${computedTotals.costoManoObra.toFixed(2)}</span>
            </div>
            <div className={styles.rentRow}>
              <span>Costo total</span>
              <span>${computedTotals.costoTotal.toFixed(2)}</span>
            </div>
            <div className={styles.rentRowTotal}>
              <span>Margen bruto</span>
              <span>
                ${computedTotals.margenBruto.toFixed(2)}{' '}
                <small>({computedTotals.margenPorcentaje.toFixed(0)}%)</small>
              </span>
            </div>
          </div>
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

      {ot.facturaId && !isMechanic && (
        <section className={styles.facturaVinculada}>
          <div className={styles.facturaInfo}>
            <span className={styles.infoLabel}>Factura emitida</span>
            <span className={styles.facturaNumero}>
              {ot.facturaNumero || ot.facturaId}
            </span>
          </div>
          <button
            type="button"
            className={styles.verFacturaButton}
            onClick={() => navigate('facturacion', { facturaId: ot.facturaId })}
          >
            Ver RIDE
          </button>
        </section>
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
        {ot.status === 'aprobacion' && !isMechanic && (
          <button
            type="button"
            className={styles.cotizacionButton}
            onClick={() => setMostrarCotizacion(true)}
          >
            Enviar cotizacion
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
          <>
            <WhatsAppButton
              phone={ot.clientPhone}
              templates={templatesByIds(['vehiculo_listo'])}
              variables={{
                clientName: ot.clientName,
                vehiclePlaca: ot.vehiclePlaca,
                vehicleMarca: ot.vehicleMarca,
                vehicleModelo: ot.vehicleModelo,
                totalGeneral: computedTotals.totalGeneral.toFixed(2)
              }}
              context={{ collection: 'workOrders', docId: ot.id }}
              buttonLabel="Avisar por WhatsApp"
              auth={auth}
            />
            <button
              type="button"
              className={styles.advanceButton}
              onClick={() => navigate('cobro-form', { otId: ot.id })}
              disabled={saving}
            >
              Cobrar OT
            </button>
          </>
        )}
        {ot.status === 'entregado' && !isMechanic && !ot.facturaId && (
          <BotonFacturar
            auth={auth}
            receptor={otToReceptor(ot, client)}
            items={otToFacturaItems(ot)}
            workOrderId={ot.id}
            label="Emitir factura electronica"
            variant="primary"
            onFacturaEmitida={async (data, finalReceptor) => {
              // Backfill cliente: si el receptor termino con cedula nueva
              // o phone/email que el cliente no tenia, actualizar el cliente
              // para que la proxima factura ya venga precargada.
              if (client && finalReceptor) {
                const cambios = {};
                if (finalReceptor.identificacion && finalReceptor.identificacion !== (client.identificacion || '')) {
                  cambios.identificacion = finalReceptor.identificacion;
                  cambios.tipoId = finalReceptor.tipoId || '05';
                }
                if (finalReceptor.email && finalReceptor.email !== (client.email || '')) {
                  cambios.email = finalReceptor.email;
                }
                if (Object.keys(cambios).length > 0) {
                  try {
                    await updateClient(auth.session, client.id, {
                      name: client.name,
                      phone: client.phone,
                      email: cambios.email !== undefined ? cambios.email : (client.email || null),
                      identificacion: cambios.identificacion !== undefined ? cambios.identificacion : (client.identificacion || ''),
                      tipoId: cambios.tipoId !== undefined ? cambios.tipoId : (client.tipoId || '05')
                    });
                  } catch (_) {}
                }
              }
              try {
                await updateOT(auth.session, ot.id, {
                  facturaId: data.id,
                  facturaNumero: data.numeroFactura,
                  facturaClaveAcceso: data.claveAcceso
                });
                await refreshOT();
              } catch (_) {
                // La factura quedo emitida en facturas/; el vinculo a la
                // OT se pierde silenciosamente si el update falla.
              }
            }}
          />
        )}
      </section>

      {mostrarCotizacion && (
        <CotizacionPDF
          auth={auth}
          ot={ot}
          tasks={tasks}
          parts={parts}
          totales={computedTotals}
          config={tallerConfig}
          onCerrar={() => setMostrarCotizacion(false)}
        />
      )}
    </div>
  );
}
