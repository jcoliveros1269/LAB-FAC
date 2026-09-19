import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Production from './pages/Production';
import Sales from './pages/Sales';
import Accounting from './pages/Accounting';
import Config from './pages/Config';
import ErrorBoundary from './components/ErrorBoundary';

function AppContent() {
  const { user, loading, isAuthenticated, allowedTabs, canAccess } = useAuth();

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('prisma_lab_active_tab') || 'dashboard';
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('prisma_lab_theme') || 'dark';
  });

  // Si el usuario cambia de rol o no tiene permiso a la pestaña guardada, redirigir a la primera permitida
  useEffect(() => {
    if (isAuthenticated && allowedTabs.length > 0 && !canAccess(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [isAuthenticated, allowedTabs, activeTab, canAccess]);

  useEffect(() => {
    localStorage.setItem('prisma_lab_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('prisma_lab_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.body.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body.classList.remove('light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const titles = {
    dashboard: 'Dashboard General & Operaciones 3D',
    production: 'Calculadora 3D & Histórico de Producción',
    inventory: 'Gestión de Inventario & Filamentos',
    sales: 'Cotizaciones, Clientes & Facturación',
    accounting: 'Contabilidad PUC & Estados Financieros',
    config: 'Configuración de Parámetros de Costos'
  };

  // 1. Pantalla de carga mientras se valida la sesión almacenada
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-14 h-14 rounded-2xl bg-[#141824] border border-cyan-500/30 p-2.5 flex items-center justify-center shadow-lg shadow-cyan-950/50">
          <img src="/prisma_icon.png" alt="Prisma Lab" className="w-full h-full object-contain" />
        </div>
        <div className="flex items-center gap-2 text-xs text-[#888888] font-mono">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Iniciando Prisma Lab ERP...</span>
        </div>
      </div>
    );
  }

  // 2. Si no hay sesión iniciada, mostrar Login
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" theme={theme} richColors />
        <Login />
      </>
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'production':
        return <Production setActiveTab={setActiveTab} />;
      case 'inventory':
        return <Inventory setActiveTab={setActiveTab} />;
      case 'sales':
        return <Sales setActiveTab={setActiveTab} />;
      case 'accounting':
        return canAccess('accounting') ? <Accounting /> : <Dashboard setActiveTab={setActiveTab} />;
      case 'config':
        return canAccess('config') ? <Config /> : <Dashboard setActiveTab={setActiveTab} />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased selection:bg-cyan-500 selection:text-black transition-colors duration-200">
      {/* Toast Notifier */}
      <Toaster position="top-right" theme={theme} richColors />

      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header activeTitle={titles[activeTab] || 'Prisma Lab ERP'} theme={theme} toggleTheme={toggleTheme} />

        <main className="flex-1 p-4 md:p-6 w-full space-y-6">
          <ErrorBoundary key={activeTab} onReset={() => setActiveTab('dashboard')}>
            {renderActiveView()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
