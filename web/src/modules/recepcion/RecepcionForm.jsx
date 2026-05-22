import { useState, useEffect } from 'react';
import { searchByPhone, getClient, createClient, updateClient } from '../../services/clientes';
import { searchByPlaca, listVehiclesByClient, createVehicle } from '../../services/vehiculos';
import { createOT } from '../../services/workOrders';
import { formatPhoneForDisplay } from '../../utils/formatPhone';
import styles from './RecepcionForm.module.css';

// Detecta si el input es probable telefono (solo digitos + separadores
// permitidos) o placa (contiene letras). Si solo digitos, asumimos
// telefono y la busqueda por placa simplemente no matchea.
const PHONE_INPUT = /^[0-9+\s()\-]+$/;

function detectInputType(raw) {
  return PHONE_INPUT.test(raw.trim()) ? 'phone' : 'placa';
}

// Deriva el tipo de identificacion SRI por longitud:
//   10 digitos -> '05' Cedula
//   13 digitos -> '04' RUC
//   otro       -> '05' default (puede editarse luego en modal de factura)
function derivarTipoId(identificacion) {
  const limpio = (identificacion || '').replace(/\D/g, '');
  if (limpio.length === 13) return '04';
  return '05';
}

export default function RecepcionForm({ navigate, auth }) {
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);

  const [client, setClient] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [clientVehicles, setClientVehicles] = useState([]);

  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateVehicle, setShowCreateVehicle] = useState(false);

  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientIdentificacion, setNewClientIdentificacion] = useState('');

  // Cedula/RUC inline: visible siempre que haya cliente seleccionado.
  // Para clientes existentes sin identificacion (creados antes del
  // modulo facturacion), permite capturarla al momento de crear la OT
  // y backfillea el cliente para que no haya que reingresar luego.
  const [clientIdentificacion, setClientIdentificacion] = useState('');

  const [newVehPlaca, setNewVehPlaca] = useState('');
  const [newVehMarca, setNewVehMarca] = useState('');
  const [newVehModelo, setNewVehModelo] = useState('');
  const [newVehYear, setNewVehYear] = useState('');
  const [newVehColor, setNewVehColor] = useState('');
  const [newVehLastKm, setNewVehLastKm] = useState('');

  const [problema, setProblema] = useState('');

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Pre-carga cedula/RUC cuando se selecciona o crea un cliente.
  useEffect(() => {
    setClientIdentificacion(client?.identificacion || '');
  }, [client?.id]);

  async function handleSearch(e) {
    if (e) e.preventDefault();
    const input = searchInput.trim();
    if (!input || searching) return;
    setSearching(true);
    setSearchAttempted(true);
    setError(null);
    try {
      const [vMatches, cMatches] = await Promise.all([
        searchByPlaca(input),
        searchByPhone(input)
      ]);

      if (vMatches.length > 0) {
        const v = vMatches[0];
        const c = await getClient(v.clientId);
        setVehicle(v);
        setClient(c);
        setClientVehicles([]);
        setShowCreateClient(false);
        setShowCreateVehicle(false);
      } else if (cMatches.length > 0) {
        const c = cMatches[0];
        const vehs = await listVehiclesByClient(c.id);
        setClient(c);
        setVehicle(null);
        setClientVehicles(vehs);
        setShowCreateClient(false);
        setShowCreateVehicle(false);
      } else {
        setClient(null);
        setVehicle(null);
        setClientVehicles([]);
        const type = detectInputType(input);
        if (type === 'phone') {
          setNewClientPhone(input);
          setNewVehPlaca('');
        } else {
          setNewVehPlaca(input);
          setNewClientPhone('');
        }
        setShowCreateClient(true);
        setShowCreateVehicle(false);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleCreateClient() {
    if (processing) return;
    if (!newClientName.trim() || !newClientPhone.trim()) {
      setError('Nombre y telefono son obligatorios para crear cliente.');
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      const c = await createClient(auth.session, {
        name: newClientName,
        phone: newClientPhone,
        email: newClientEmail,
        identificacion: newClientIdentificacion,
        tipoId: derivarTipoId(newClientIdentificacion)
      });
      setClient(c);
      setClientVehicles([]);
      setShowCreateClient(false);
      setShowCreateVehicle(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleCreateVehicle() {
    if (processing) return;
    if (!client) {
      setError('Falta cliente.');
      return;
    }
    if (!newVehPlaca.trim() || !newVehMarca.trim() || !newVehModelo.trim()) {
      setError('Placa, marca y modelo son obligatorios.');
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      const v = await createVehicle(auth.session, {
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        placa: newVehPlaca,
        marca: newVehMarca,
        modelo: newVehModelo,
        year: newVehYear,
        color: newVehColor,
        lastKm: newVehLastKm
      });
      setVehicle(v);
      setShowCreateVehicle(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleCreateOT() {
    if (processing) return;
    if (!client || !vehicle) {
      setError('Falta cliente o vehiculo.');
      return;
    }
    if (!problema.trim()) {
      setError('Describe el problema reportado.');
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      const idValue = (clientIdentificacion || '').trim();
      const tipoIdValue = derivarTipoId(idValue);

      // Backfillea el cliente si la cedula cambio o no estaba.
      // No bloquea la OT si falla.
      if (idValue && idValue !== (client.identificacion || '')) {
        try {
          await updateClient(auth.session, client.id, {
            name: client.name,
            phone: client.phone,
            email: client.email || null,
            identificacion: idValue,
            tipoId: tipoIdValue
          });
        } catch (_) {
          // no bloquear
        }
      }

      const ot = await createOT(auth.session, {
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientIdentificacion: idValue,
        clientTipoId: tipoIdValue,
        clientEmail: client.email || '',
        clientDireccion: client.direccion || '',
        vehicleId: vehicle.id,
        vehiclePlaca: vehicle.placa,
        vehicleMarca: vehicle.marca,
        vehicleModelo: vehicle.modelo,
        problema
      });
      navigate('ot-detail', { id: ot.id });
    } catch (e) {
      setError(e.message);
      setProcessing(false);
    }
  }

  function handleSelectVehicle(v) {
    setVehicle(v);
    setShowCreateVehicle(false);
  }

  function handleChangeClient() {
    setClient(null);
    setVehicle(null);
    setClientVehicles([]);
    setShowCreateClient(false);
    setShowCreateVehicle(false);
  }

  function handleChangeVehicle() {
    setVehicle(null);
    setShowCreateVehicle(false);
  }

  function handleResetAll() {
    setSearchInput('');
    setSearchAttempted(false);
    setClient(null);
    setVehicle(null);
    setClientVehicles([]);
    setShowCreateClient(false);
    setShowCreateVehicle(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientEmail('');
    setNewClientIdentificacion('');
    setClientIdentificacion('');
    setNewVehPlaca('');
    setNewVehMarca('');
    setNewVehModelo('');
    setNewVehYear('');
    setNewVehColor('');
    setNewVehLastKm('');
    setProblema('');
    setError(null);
  }

  const canCreateOT = !!client && !!vehicle && problema.trim().length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Recepcion</h1>
        {(client || searchAttempted) && (
          <button
            type="button"
            className={styles.resetButton}
            onClick={handleResetAll}
            disabled={processing}
          >
            Limpiar
          </button>
        )}
      </header>

      <section className={styles.section}>
        <h2 className={styles.subtitle}>1. Cliente y vehiculo</h2>

        {!client && (
          <form className={styles.searchForm} onSubmit={handleSearch}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Placa o telefono"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              disabled={searching}
              autoFocus
            />
            <button
              type="submit"
              className={styles.searchButton}
              disabled={searching || !searchInput.trim()}
            >
              {searching ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
        )}

        {client && (
          <div className={styles.entityCard}>
            <div className={styles.entityMain}>
              <span className={styles.entityLabel}>Cliente</span>
              <span className={styles.entityName}>{client.name}</span>
              <span className={styles.entityMeta}>{formatPhoneForDisplay(client.phone)}</span>
            </div>
            <button
              type="button"
              className={styles.changeButton}
              onClick={handleChangeClient}
              disabled={processing}
            >
              Cambiar
            </button>
          </div>
        )}

        {client && (
          <label className={styles.label}>
            Cedula o RUC del cliente (para facturacion)
            <input
              type="text"
              className={styles.input}
              value={clientIdentificacion}
              onChange={e => setClientIdentificacion(e.target.value)}
              disabled={processing}
              placeholder="10 digitos cedula o 13 digitos RUC"
              inputMode="numeric"
              maxLength={13}
            />
          </label>
        )}

        {client && !vehicle && clientVehicles.length > 0 && (
          <div className={styles.vehiclesPick}>
            <p className={styles.vehiclesPickHint}>Selecciona el vehiculo:</p>
            <ul className={styles.vehiclesList}>
              {clientVehicles.map(v => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={styles.vehicleOption}
                    onClick={() => handleSelectVehicle(v)}
                    disabled={processing}
                  >
                    <span className={styles.placa}>{v.placa}</span>
                    <span className={styles.modeloLine}>
                      {v.marca} {v.modelo}{v.year ? ` ${v.year}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!showCreateVehicle && (
              <button
                type="button"
                className={styles.addVehicleButton}
                onClick={() => setShowCreateVehicle(true)}
                disabled={processing}
              >
                + Vehiculo nuevo
              </button>
            )}
          </div>
        )}

        {client && !vehicle && clientVehicles.length === 0 && !showCreateVehicle && (
          <div className={styles.emptyVehicles}>
            <p>Este cliente no tiene vehiculos registrados.</p>
            <button
              type="button"
              className={styles.addVehicleButton}
              onClick={() => setShowCreateVehicle(true)}
              disabled={processing}
            >
              Agregar vehiculo
            </button>
          </div>
        )}

        {client && vehicle && (
          <div className={styles.entityCard}>
            <div className={styles.entityMain}>
              <span className={styles.entityLabel}>Vehiculo</span>
              <span className={styles.placa}>{vehicle.placa}</span>
              <span className={styles.entityMeta}>
                {vehicle.marca} {vehicle.modelo}{vehicle.year ? ` ${vehicle.year}` : ''}
              </span>
            </div>
            <button
              type="button"
              className={styles.changeButton}
              onClick={handleChangeVehicle}
              disabled={processing}
            >
              Cambiar
            </button>
          </div>
        )}

        {searchAttempted && !client && !showCreateClient && !searching && (
          <div className={styles.noMatch}>
            <p>Sin resultados para <strong>{searchInput}</strong>.</p>
            <button
              type="button"
              className={styles.addVehicleButton}
              onClick={() => setShowCreateClient(true)}
            >
              Crear cliente nuevo
            </button>
          </div>
        )}

        {showCreateClient && !client && (
          <div className={styles.subform}>
            <h3 className={styles.subformTitle}>Nuevo cliente</h3>
            <label className={styles.label}>
              Nombre
              <input
                type="text"
                className={styles.input}
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                disabled={processing}
                autoFocus
              />
            </label>
            <label className={styles.label}>
              Telefono
              <input
                type="tel"
                className={styles.input}
                value={newClientPhone}
                onChange={e => setNewClientPhone(e.target.value)}
                disabled={processing}
                placeholder="0987654321"
              />
            </label>
            <label className={styles.label}>
              Cedula o RUC (opcional, para facturacion)
              <input
                type="text"
                className={styles.input}
                value={newClientIdentificacion}
                onChange={e => setNewClientIdentificacion(e.target.value)}
                disabled={processing}
                placeholder="10 digitos cedula o 13 digitos RUC"
                inputMode="numeric"
                maxLength={13}
              />
            </label>
            <label className={styles.label}>
              Email (opcional)
              <input
                type="email"
                className={styles.input}
                value={newClientEmail}
                onChange={e => setNewClientEmail(e.target.value)}
                disabled={processing}
              />
            </label>
            <button
              type="button"
              className={styles.subformSubmit}
              onClick={handleCreateClient}
              disabled={processing}
            >
              {processing ? 'Creando...' : 'Crear cliente'}
            </button>
          </div>
        )}

        {showCreateVehicle && client && !vehicle && (
          <div className={styles.subform}>
            <h3 className={styles.subformTitle}>Nuevo vehiculo</h3>
            <label className={styles.label}>
              Placa
              <input
                type="text"
                className={styles.input}
                value={newVehPlaca}
                onChange={e => setNewVehPlaca(e.target.value)}
                disabled={processing}
                placeholder="ABC-1234"
                autoFocus
              />
            </label>
            <label className={styles.label}>
              Marca
              <input
                type="text"
                className={styles.input}
                value={newVehMarca}
                onChange={e => setNewVehMarca(e.target.value)}
                disabled={processing}
              />
            </label>
            <label className={styles.label}>
              Modelo
              <input
                type="text"
                className={styles.input}
                value={newVehModelo}
                onChange={e => setNewVehModelo(e.target.value)}
                disabled={processing}
              />
            </label>
            <div className={styles.row}>
              <label className={`${styles.label} ${styles.half}`}>
                Anio (opc)
                <input
                  type="number"
                  className={styles.input}
                  value={newVehYear}
                  onChange={e => setNewVehYear(e.target.value)}
                  disabled={processing}
                  min="1900"
                  max="2100"
                />
              </label>
              <label className={`${styles.label} ${styles.half}`}>
                Color (opc)
                <input
                  type="text"
                  className={styles.input}
                  value={newVehColor}
                  onChange={e => setNewVehColor(e.target.value)}
                  disabled={processing}
                />
              </label>
            </div>
            <label className={styles.label}>
              Ultimo kilometraje (opc)
              <input
                type="number"
                className={styles.input}
                value={newVehLastKm}
                onChange={e => setNewVehLastKm(e.target.value)}
                disabled={processing}
                min="0"
              />
            </label>
            <button
              type="button"
              className={styles.subformSubmit}
              onClick={handleCreateVehicle}
              disabled={processing}
            >
              {processing ? 'Creando...' : 'Crear vehiculo'}
            </button>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.subtitle}>2. Problema reportado</h2>
        <textarea
          className={styles.textarea}
          rows={5}
          value={problema}
          onChange={e => setProblema(e.target.value)}
          disabled={!client || !vehicle || processing}
          placeholder={
            client && vehicle
              ? 'Describe el problema (ej. "no enciende", "fuga de aceite", "ruido al frenar")'
              : 'Primero identifica cliente y vehiculo arriba.'
          }
        />
      </section>

      <section className={styles.section}>
        {error && (
          <p className={styles.error} role="alert">{error}</p>
        )}
        <button
          type="button"
          className={styles.submitOT}
          onClick={handleCreateOT}
          disabled={!canCreateOT || processing}
        >
          {processing ? 'Creando OT...' : 'Crear OT'}
        </button>
      </section>
    </div>
  );
}
