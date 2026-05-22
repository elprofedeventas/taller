import { useState, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import Login from './modules/auth/Login';
import ClientesList from './modules/clientes/ClientesList';
import ClienteDetail from './modules/clientes/ClienteDetail';
import ClienteForm from './modules/clientes/ClienteForm';
import VehiculoDetail from './modules/vehiculos/VehiculoDetail';
import VehiculoForm from './modules/vehiculos/VehiculoForm';
import RecepcionForm from './modules/recepcion/RecepcionForm';
import ClientesImport from './modules/clientes/ClientesImport';
import { ConnectionStatus } from './components/ConnectionStatus';
import ColaOT from './modules/ot/ColaOT';
import OTDetail from './modules/ot/OTDetail';
import TableroOT from './modules/tablero/TableroOT';
import ContactarList from './modules/contactar/ContactarList';
import UsuariosList from './modules/usuarios/UsuariosList';
import UsuarioForm from './modules/usuarios/UsuarioForm';
import CajaList from './modules/caja/CajaList';
import CobroForm from './modules/caja/CobroForm';
import Comprobante from './modules/caja/Comprobante';
import ConfiguracionForm from './modules/configuracion/ConfiguracionForm';
import PanelDueno from './modules/panel/PanelDueno';
import HistoricoView from './modules/panel/HistoricoView';
import PantallaFacturacion from './modules/facturacion/PantallaFacturacion';
import styles from './App.module.css';

const MODULES = [
  { route: 'clientes', label: 'Clientes', enabled: true, allowedRoles: null },
  { route: 'recepcion', label: 'Recepcion', enabled: true, allowedRoles: null },
  { route: 'tablero', label: 'Tablero', enabled: true, allowedRoles: null },
  { route: 'ot', label: 'OTs', enabled: true, allowedRoles: null },
  { route: 'caja', label: 'Caja', enabled: true, allowedRoles: null },
  { route: 'contactar', label: 'Contactar', enabled: true, allowedRoles: ['owner', 'manager', 'recepcionista'] },
  { route: 'facturacion', label: 'Facturacion', enabled: true, allowedRoles: ['owner', 'manager', 'recepcionista'] },
  { route: 'panel', label: 'Panel', enabled: true, allowedRoles: ['owner', 'manager'] },
  { route: 'usuarios', label: 'Usuarios', enabled: true, allowedRoles: ['owner'] },
  { route: 'configuracion', label: 'Configuracion', enabled: true, allowedRoles: ['owner'] }
];

function moduleOfRoute(routeName) {
  if (routeName === 'clientes-import') return 'clientes';
  if (routeName.startsWith('cliente') || routeName.startsWith('vehiculo')) return 'clientes';
  if (routeName === 'ot-detail') return 'ot';
  if (routeName === 'usuario-form') return 'usuarios';
  if (routeName === 'cobro-form' || routeName === 'comprobante') return 'caja';
  if (routeName === 'historico') return 'panel';
  return routeName;
}

export default function App() {
  const auth = useAuth();
  const [route, setRoute] = useState({ name: 'clientes', params: {}, nonce: 0 });

  const navigate = useCallback((name, params = {}) => {
    setRoute(prev => ({ name, params, nonce: prev.nonce + 1 }));
  }, []);

  if (!auth.isAuthenticated) {
    return <Login auth={auth} />;
  }

  const activeModule = moduleOfRoute(route.name);

  return (
    <div className={styles.app}>
      <nav className={styles.topNav}>
        <span className={styles.brand}>TALLER</span>
        <div className={styles.modules}>
          {MODULES
            .filter(m => !m.allowedRoles || m.allowedRoles.includes(auth.role))
            .map(m => (
              <button
                key={m.route}
                type="button"
                className={
                  activeModule === m.route
                    ? `${styles.module} ${styles.moduleActive}`
                    : styles.module
                }
                disabled={!m.enabled}
                onClick={() => m.enabled && navigate(m.route)}
              >
                {m.label}
              </button>
            ))}
        </div>
        <div className={styles.session}>
          <span className={styles.user}>{auth.name} ({auth.role})</span>
          <button
            type="button"
            className={styles.logout}
            onClick={auth.logout}
          >
            Cerrar sesion
          </button>
        </div>
      </nav>

      <ConnectionStatus />

      <main className={styles.content}>
        {renderRoute(route, navigate, auth)}
      </main>
    </div>
  );
}

function renderRoute(route, navigate, auth) {
  const k = route.nonce;
  switch (route.name) {
    case 'clientes':
      return <ClientesList key={`cl-${k}`} navigate={navigate} />;
    case 'cliente-detail':
      return <ClienteDetail key={`cd-${k}`} clienteId={route.params.id} navigate={navigate} auth={auth} />;
    case 'clientes-import':
      return <ClientesImport key={`ci-${k}`} navigate={navigate} auth={auth} />;
    case 'cliente-form':
      return <ClienteForm key={`cf-${k}`} clienteId={route.params.id || null} navigate={navigate} auth={auth} />;
    case 'vehiculo-detail':
      return <VehiculoDetail key={`vd-${k}`} vehiculoId={route.params.id} navigate={navigate} />;
    case 'vehiculo-form':
      return (
        <VehiculoForm
          key={`vf-${k}`}
          vehiculoId={route.params.id || null}
          clienteId={route.params.clienteId || null}
          navigate={navigate}
          auth={auth}
        />
      );
    case 'recepcion':
      return (
        <RecepcionForm
          key={`rec-${k}`}
          navigate={navigate}
          auth={auth}
          preselectVehicleId={route.params.vehicleId || null}
          preselectClientId={route.params.clientId || null}
        />
      );
    case 'ot':
      return <ColaOT key={`cola-${k}`} navigate={navigate} auth={auth} />;
    case 'tablero':
      return <TableroOT key={`tab-${k}`} navigate={navigate} auth={auth} />;
    case 'contactar':
      return <ContactarList key={`cont-${k}`} navigate={navigate} auth={auth} />;
    case 'ot-detail':
      return (
        <OTDetail
          key={`otd-${k}`}
          otId={route.params.id}
          navigate={navigate}
          auth={auth}
        />
      );
    case 'usuarios':
      return <UsuariosList key={`u-${k}`} navigate={navigate} auth={auth} />;
    case 'usuario-form':
      return (
        <UsuarioForm
          key={`uf-${k}`}
          usuarioId={route.params.id || null}
          navigate={navigate}
          auth={auth}
        />
      );
    case 'caja':
      return <CajaList key={`caja-${k}`} navigate={navigate} auth={auth} />;
    case 'cobro-form':
      return (
        <CobroForm
          key={`cobro-${k}`}
          otId={route.params.otId}
          navigate={navigate}
          auth={auth}
        />
      );
    case 'comprobante':
      return (
        <Comprobante
          key={`comp-${k}`}
          paymentId={route.params.id}
          navigate={navigate}
          auth={auth}
        />
      );
    case 'configuracion':
      return <ConfiguracionForm key={`cfg-${k}`} auth={auth} />;
    case 'facturacion':
      return (
        <PantallaFacturacion
          key={`fac-${k}`}
          navigate={navigate}
          auth={auth}
          autoOpenFacturaId={route.params.facturaId || null}
        />
      );
    case 'panel':
      return <PanelDueno key={`panel-${k}`} navigate={navigate} auth={auth} />;
    case 'historico':
      return <HistoricoView key={`hist-${k}`} navigate={navigate} auth={auth} />;
    default:
      return <ClientesList key={`cl-${k}`} navigate={navigate} />;
  }
}
