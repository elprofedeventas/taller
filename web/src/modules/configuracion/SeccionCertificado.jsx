import { useState, useEffect } from 'react';
import {
  getTallerConfig, setTallerCertificate, borrarTallerCertificado
} from '../../services/config';
import styles from './SeccionCertificado.module.css';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function diasRestantes(isoFecha) {
  if (!isoFecha) return null;
  const diff = new Date(isoFecha) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatFecha(isoFecha) {
  if (!isoFecha) return '-';
  return new Date(isoFecha).toLocaleDateString('es-EC', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

export default function SeccionCertificado({ auth }) {
  const [certActual, setCertActual] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [archivo, setArchivo] = useState(null);
  const [password, setPassword] = useState('');
  const [mostrarPwd, setMostrarPwd] = useState(false);

  const [fase, setFase] = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);
  const [exito, setExito] = useState(null);
  const [borrando, setBorrando] = useState(false);

  async function recargarCert() {
    try {
      const c = await getTallerConfig();
      if (c && c.p12Encrypted) {
        setCertActual({
          nombre: c.p12Nombre || 'certificado.p12',
          fechaExpiracion: c.p12FechaExpiracion || null,
          configuradoEn: c.p12ConfiguradoEn || null
        });
      } else {
        setCertActual(null);
      }
    } catch (_) {
      // silencio: si falla el read dejamos el estado anterior
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await recargarCert();
      if (!cancelled) setCargando(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBorrar() {
    const ok = window.confirm(
      'Vas a borrar el certificado .p12 y su contrasena del taller. ' +
      'No vas a poder emitir facturas hasta cargar uno nuevo. ' +
      'Los datos SRI (RUC, razon social, etc.) se mantienen. ' +
      'Continuar?'
    );
    if (!ok) return;
    setBorrando(true);
    setErrorMsg(null);
    setExito(null);
    try {
      await borrarTallerCertificado(auth.session);
      await recargarCert();
      setExito('Certificado y contrasena eliminados.');
      // Limpia el mensaje de exito a los 3 segundos.
      setTimeout(() => setExito(null), 3000);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBorrando(false);
    }
  }

  if (auth.role !== 'owner') return null;

  const dias = diasRestantes(certActual?.fechaExpiracion);
  const estadoCert =
    !certActual ? 'sin_cert' :
    dias === null ? 'ok' :
    dias < 0 ? 'expirado' :
    dias <= 30 ? 'por_vencer' : 'ok';

  async function guardar() {
    setErrorMsg(null);
    setExito(null);

    if (!archivo) {
      setErrorMsg('Selecciona un archivo .p12.');
      return;
    }
    if (!archivo.name.toLowerCase().endsWith('.p12')) {
      setErrorMsg('El archivo debe ser .p12');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('La contrasena no puede estar vacia.');
      return;
    }
    if (password.length < 4) {
      setErrorMsg('La contrasena parece demasiado corta.');
      return;
    }

    setFase('procesando');

    try {
      const p12Base64 = await fileToBase64(archivo);

      const res = await fetch('/api/facturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'encriptar',
          p12Base64,
          p12Password: password
        })
      });

      const data = await res.json();

      if (!res.ok || !data.p12Encrypted) {
        throw new Error(data.error || 'Error al encriptar el certificado.');
      }

      await setTallerCertificate(auth.session, {
        p12Encrypted: data.p12Encrypted,
        p12Password: password,
        p12Nombre: archivo.name,
        p12FechaExpiracion: data.fechaExpiracion || null
      });

      setCertActual({
        nombre: archivo.name,
        fechaExpiracion: data.fechaExpiracion || null,
        configuradoEn: new Date().toISOString()
      });
      setArchivo(null);
      setPassword('');
      setExito('Certificado guardado correctamente.');
      setFase('ok');
    } catch (e) {
      setErrorMsg(e.message);
      setFase('error');
    }
  }

  function resetForm() {
    setArchivo(null);
    setPassword('');
    setFase('idle');
    setErrorMsg(null);
    setExito(null);
  }

  if (cargando) {
    return <p className={styles.loading}>Cargando configuracion del certificado...</p>;
  }

  const procesando = fase === 'procesando';

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h2 className={styles.sectionTitle}>Certificado digital (.p12)</h2>
        <span className={styles.subtitle}>Requerido para facturacion SRI</span>
      </div>

      {certActual && (
        <div className={`${styles.estadoCard} ${styles[`estado_${estadoCert}`]}`}>
          <div className={styles.estadoMain}>
            <span className={styles.estadoTag}>
              {estadoCert === 'ok' && 'Vigente'}
              {estadoCert === 'por_vencer' && 'Por vencer'}
              {estadoCert === 'expirado' && 'EXPIRADO'}
            </span>
            <span className={styles.estadoNombre}>{certActual.nombre}</span>
          </div>
          <div className={styles.estadoDetalle}>
            {estadoCert === 'expirado' && (
              <span>Certificado vencido. Renuevalo para poder facturar.</span>
            )}
            {estadoCert === 'por_vencer' && (
              <span>
                Vence en {dias} dias ({formatFecha(certActual.fechaExpiracion)}).
                Renuevalo pronto.
              </span>
            )}
            {estadoCert === 'ok' && certActual.fechaExpiracion && (
              <span>Valido hasta {formatFecha(certActual.fechaExpiracion)}.</span>
            )}
            {estadoCert === 'ok' && !certActual.fechaExpiracion && (
              <span>Certificado configurado.</span>
            )}
          </div>
        </div>
      )}

      {certActual && (
        <div className={styles.borrarRow}>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={handleBorrar}
            disabled={borrando}
          >
            {borrando ? 'Borrando...' : '🗑️ Borrar certificado y contrasena'}
          </button>
          <span className={styles.borrarHint}>
            Util para limpiar el .p12 al terminar una demo. Los datos SRI se mantienen.
          </span>
        </div>
      )}

      <div className={styles.formCard}>
        <div className={styles.formTitle}>
          {certActual ? 'Actualizar certificado' : 'Configurar certificado'}
        </div>

        <label className={styles.label}>
          Archivo .p12
          <div className={styles.fileWrap}>
            <label
              className={archivo ? styles.fileLabelOk : styles.fileLabel}
            >
              {archivo ? archivo.name : 'Seleccionar archivo .p12...'}
              <input
                type="file"
                accept=".p12"
                style={{ display: 'none' }}
                onChange={e => {
                  setArchivo(e.target.files[0] || null);
                  setFase('idle');
                  setErrorMsg(null);
                  setExito(null);
                }}
                disabled={procesando}
              />
            </label>
            {archivo && !procesando && (
              <button
                type="button"
                className={styles.fileClear}
                onClick={() => setArchivo(null)}
                aria-label="Quitar archivo"
              >
                &times;
              </button>
            )}
          </div>
          <span className={styles.hint}>
            Emitido por Banco Central del Ecuador o Security Data.
          </span>
        </label>

        <label className={styles.label}>
          Contrasena del certificado
          <div className={styles.pwdWrap}>
            <input
              type={mostrarPwd ? 'text' : 'password'}
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={procesando}
              placeholder="Contrasena del .p12"
              autoComplete="new-password"
            />
            <button
              type="button"
              className={styles.pwdToggle}
              onClick={() => setMostrarPwd(v => !v)}
              disabled={procesando}
            >
              {mostrarPwd ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <span className={styles.hint}>
            Se guarda encriptada con AES-256. Nunca en texto plano.
          </span>
        </label>

        <div className={styles.aviso}>
          El certificado se encripta antes de guardarse en Firestore. La clave
          de encriptacion vive solo en el servidor (env var de Vercel).
        </div>

        {errorMsg && <p className={styles.error} role="alert">{errorMsg}</p>}
        {exito && <p className={styles.feedback} role="status">{exito}</p>}

        <div className={styles.actions}>
          {(archivo || password) && !procesando && (
            <button
              type="button"
              className={styles.btnSec}
              onClick={resetForm}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            className={styles.btnPri}
            onClick={guardar}
            disabled={procesando}
          >
            {procesando
              ? 'Guardando...'
              : certActual
                ? 'Actualizar certificado'
                : 'Guardar certificado'}
          </button>
        </div>
      </div>

      <p className={styles.ayuda}>
        Como obtener el certificado:{' '}
        <a href="https://www.eci.bce.ec" target="_blank" rel="noreferrer">eci.bce.ec</a>
        {' '}o{' '}
        <a href="https://www.securitydata.net.ec" target="_blank" rel="noreferrer">securitydata.net.ec</a>.
      </p>
    </div>
  );
}
