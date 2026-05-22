// modules/facturacion/BotonNotaCredito.jsx
// Boton reutilizable que abre el modal de nota credito sobre una factura.
// Mecanico no tiene acceso. Si la factura no esta AUTORIZADA o ya tiene
// nota credito (anulada=true), el boton no se renderiza.

import { useState } from 'react';
import ModalNotaCredito from './ModalNotaCredito';
import styles from './BotonFacturar.module.css';

export default function BotonNotaCredito({
  auth,
  factura,
  label = 'Emitir nota credito',
  variant = 'secondary',
  onNotaCreditoEmitida = null
}) {
  const [abierto, setAbierto] = useState(false);

  if (auth?.role === 'mechanic') return null;
  if (!factura || factura.estado !== 'AUTORIZADA') return null;
  if (factura.anulada || factura.notaCreditoId) return null;

  const claseBoton = variant === 'primary' ? styles.btnPrimary : styles.btnSecondary;

  return (
    <>
      <button
        type="button"
        className={claseBoton}
        onClick={() => setAbierto(true)}
      >
        {label}
      </button>

      {abierto && (
        <ModalNotaCredito
          auth={auth}
          factura={factura}
          onCerrar={() => setAbierto(false)}
          onNotaCreditoEmitida={(data) => {
            if (onNotaCreditoEmitida) onNotaCreditoEmitida(data);
          }}
        />
      )}
    </>
  );
}
