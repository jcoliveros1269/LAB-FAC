import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const ROLE_PERMISSIONS = {
  ADMIN: ['dashboard', 'production', 'inventory', 'sales', 'accounting', 'config'],
  OPERATOR: ['dashboard', 'production', 'inventory'],
  SELLER: ['dashboard', 'sales', 'inventory'],
};

export const ROLE_LABELS = {
  ADMIN: { label: 'Administrador', color: 'emerald' },
  OPERATOR: { label: 'Operador Taller', color: 'cyan' },
  SELLER: { label: 'Ventas & Cotizaciones', color: 'amber' },
  CUSTOM: { label: 'Personalizado', color: 'purple' },
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('prisma_lab_token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('prisma_lab_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Verificar validez del token en el arranque
  useEffect(() => {
    const verifySession = async () => {
      if (token) {
        try {
          const res = await authService.getMe();
          if (res?.data) {
            setUser(res.data);
            localStorage.setItem('prisma_lab_user', JSON.stringify(res.data));
          }
        } catch (err) {
          console.warn('Sesión previa inválida o expirada:', err);
          logout();
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    verifySession();
  }, [token]);

  const login = async (username, password) => {
    const res = await authService.login(username, password);
    const { access_token, user: userData } = res.data;

    localStorage.setItem('prisma_lab_token', access_token);
    localStorage.setItem('prisma_lab_user', JSON.stringify(userData));

    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('prisma_lab_token');
    localStorage.removeItem('prisma_lab_user');
    setToken(null);
    setUser(null);
  };

  // Calcular pestañas permitidas dinámicamente según allowed_modules o rol
  const allowedTabs = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'ADMIN') {
      return ['dashboard', 'production', 'inventory', 'sales', 'accounting', 'config'];
    }
    if (user.allowed_modules) {
      return user.allowed_modules.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean);
    }
    return ROLE_PERMISSIONS[user.role] || ['dashboard'];
  }, [user]);

  const canAccess = (tabId) => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    return allowedTabs.includes(tabId);
  };

  // Capacidades operativas granulares
  const canDelete = Boolean(user && (user.role === 'ADMIN' || (user.can_delete && !user.read_only)));
  const canEdit = Boolean(user && (user.role === 'ADMIN' || (user.can_edit && !user.read_only)));
  const isReadOnly = Boolean(user && user.role !== 'ADMIN' && user.read_only);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        isAuthenticated: Boolean(token && user),
        login,
        logout,
        canAccess,
        allowedTabs,
        canDelete,
        canEdit,
        isReadOnly,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
