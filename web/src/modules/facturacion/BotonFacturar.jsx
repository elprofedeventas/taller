import { useState } from 'react';
import ModalFacturacion from './ModalFacturacion';
import styles from './BotonFacturar.module.css';

/**
 * Boton reutilizable que abre el modal de facturacion SRI.
 * Props (todas opcionales excepto auth):
 *   auth              - sesion (obligatoria, para escribir en Firestore).
 *   receptor          - datos pre-cargados del comprador.
 *   items             - items pre-cargados.
 *   workOrderId       - id de la OT relacionada (denorm en doc facturas).
 *   paymentId         - id del payment relacionado.
 *   label             - texto del boton (default: "Emitir Factura SRI").
 *   variant           - 'primary' | 'secondary' (default 'secondary').
 *   onFacturaEmitida  - callback({id, claveAcceso, ...}) cuando emite OK.
 */
export default function BotonFacturar({
  auth,
  receptor = null,
  items = null,
  workOrderId = null,
  paymentId = null,
  label = 'Emitir Factura SRI',
  variant = 'secondary',
  onFacturaEmitida = null
}) {
  const [abierto, setAbierto] = useState(false);

  if (auth?.role === 'mechanic') return null;

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
        <ModalFacturacion
          auth={auth}
          onCerrar={() => setAbierto(false)}
          receptorInicial={receptor}
          itemsIniciales={items}
          workOrderId={workOrderId}
          paymentId={paymentId}
          onFacturaEmitida={(result) => {
            if (onFacturaEmitida) onFacturaEmitida(result);
          }}
        />
      )}
    </>
  );
}
