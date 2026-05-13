import { useState, useEffect, useRef } from 'react';
import styles from './Login.module.css';

// PLACEHOLDER: ver PENDIENTES.md seccion "Configuracion pendiente".
const WHATSAPP_URL = 'https://wa.me/593999999999?text=Hola%20Alfredo%2C%20mi%20cuenta%20de%20TALLER%20est%C3%A1%20pausada.';

const ERROR_MESSAGES = {
  'offline': 'Sin conexion. Verifica tu red e intenta de nuevo.',
  'paused-payment': 'Cuenta pausada por pago pendiente.',
  'inactive': 'Cuenta inactiva. Contacta al administrador.',
  'incorrect': 'PIN incorrecto.'
};

function mapError(rawError) {
  if (!rawError) return null;
  if (rawError === 'OFFLINE') return 'offline';
  if (rawError === 'ACCOUNT_PAUSED_PAYMENT') return 'paused-payment';
  if (rawError === 'ACCOUNT_INACTIVE') return 'inactive';
  return 'incorrect';
}

export default function Login({ auth }) {
  const [pin, setPin] = useState('');
  const [displayError, setDisplayError] = useState(null);
  // Flag de reentrada: evita que el auto-submit dispare un segundo
  // intento mientras el primero esta procesandose o acaba de fallar.
  const attempting = useRef(false);

  // Auto-submit al cuarto digito.
  useEffect(() => {
    if (pin.length === 4 && !auth.loading && !attempting.current) {
      attempting.current = true;
      setDisplayError(null);
      auth.login(pin);
    }
  }, [pin, auth]);

  // Procesa el resultado del intento de login. El timeout de 5s
  // contra Firestore vive en services/auth.js (throw 'OFFLINE'),
  // por eso aqui no hay logica de timing ni red.
  useEffect(() => {
    if (!attempting.current || auth.loading) return;
    attempting.current = false;

    const mapped = mapError(auth.error);
    if (!mapped) return;

    setDisplayError(mapped);
    setPin('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading]);

  // Soporte de teclado fisico.
  useEffect(() => {
    function handleKeyDown(e) {
      if (auth.loading) return;
      if (/^\d$/.test(e.key)) {
        setPin(prev => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        setPin('');
        setDisplayError(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [auth.loading]);

  function pressDigit(digit) {
    if (auth.loading) return;
    setPin(prev => (prev.length < 4 ? prev + String(digit) : prev));
  }

  function pressBackspace() {
    if (auth.loading) return;
    setPin(prev => prev.slice(0, -1));
  }

  return (
    <main className={styles.container} aria-labelledby="login-title">
      <div className={styles.card}>
        <h1 id="login-title" className={styles.title}>TALLER</h1>
        <p className={styles.subtitle}>Ingresa tu PIN</p>

        <div
          className={styles.display}
          aria-live="polite"
          aria-label={`PIN: ${pin.length} de 4 digitos ingresados`}
        >
          {[0, 1, 2, 3].map(i => (
            <span
              key={i}
              className={`${styles.dot} ${i < pin.length ? styles.dotFilled : ''}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className={styles.pinpad} role="group" aria-label="Teclado numerico">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <button
              key={d}
              type="button"
              className={styles.key}
              onClick={() => pressDigit(d)}
              disabled={auth.loading}
              aria-label={`Tecla ${d}`}
            >
              {d}
            </button>
          ))}
          <span className={styles.keyEmpty} aria-hidden="true" />
          <button
            type="button"
            className={styles.key}
            onClick={() => pressDigit(0)}
            disabled={auth.loading}
            aria-label="Tecla 0"
          >
            0
          </button>
          <button
            type="button"
            className={styles.keyBackspace}
            onClick={pressBackspace}
            disabled={auth.loading || pin.length === 0}
            aria-label="Borrar"
          >
            &larr;
          </button>
        </div>

        {auth.loading && (
          <p className={styles.loading} role="status">Validando...</p>
        )}

        {displayError && !auth.loading && (
          <div className={styles.errorArea} role="alert">
            <p className={styles.errorText}>{ERROR_MESSAGES[displayError]}</p>
            {displayError === 'paused-payment' && (
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.whatsappButton}
              >
                Contactar por WhatsApp
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
