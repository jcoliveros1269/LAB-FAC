import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Production from './pages/Production';
import Sales from './pages/Sales';
import Accounting from './pages/Accounting';
import Config from './pages/Config';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('prisma_lab_active_tab') || 'dashboard';
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('prisma_lab_theme') || 'dark';
  });

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

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'production':
        return <Production setActiveTab={setActiveTab} />;
      case 'inventory':
        return <Inventory />;
      case 'sales':
        return <Sales setActiveTab={setActiveTab} />;
      case 'accounting':
        return <Accounting />;
      case 'config':
        return <Config />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Toast Notifier */}
      <Toaster position="top-right" theme={theme} richColors />

      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header activeTitle={titles[activeTab] || 'Prisma Lab ERP'} theme={theme} toggleTheme={toggleTheme} />

        <main className="flex-1 p-4 md:p-6 w-full space-y-6">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}
