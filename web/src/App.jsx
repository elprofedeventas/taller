import { useAuth } from './hooks/useAuth';
import Login from './modules/auth/Login';

export default function App() {
  const auth = useAuth();

  if (!auth.isAuthenticated) {
    return <Login auth={auth} />;
  }

  return (
    <div style={{ padding: 24 }}>
      <p>
        Logueado como {auth.name} ({auth.role}).{' '}
        <button onClick={auth.logout}>Cerrar sesion</button>
      </p>
    </div>
  );
}
