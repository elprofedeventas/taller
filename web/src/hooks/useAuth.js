// hooks/useAuth.js
import { useState, useCallback } from 'react';
import { login as loginService } from '../services/auth';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (pin) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginService(pin);
      if (result) {
        setSession(result);
        return result;
      } else {
        setError('PIN incorrecto');
        return null;
      }
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
  }, []);

  return {
    session,
    role: session?.role || null,
    userId: session?.userId || null,
    name: session?.name || null,
    isAuthenticated: !!session,
    login,
    logout,
    loading,
    error
  };
}
