import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, Sun, Moon, Download, Smartphone } from 'lucide-react';
import api from '../services/api';
import InstallPwaModal, { usePwaInstall } from './InstallPwaModal';

export default function Header({ activeTitle, theme, toggleTheme }) {
  const [isOnline, setIsOnline] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const { isStandalone, isIOS } = usePwaInstall();

  const checkHealth = async () => {
    setChecking(true);
    try {
      await api.get('/health');
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  const currentDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return (
    <>
      <header className="bg-[#101010] border-b border-[#2A2A2A] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors duration-200">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#EAEAEA] tracking-tight truncate">{activeTitle}</h2>
          <p className="text-[11px] text-[#A0A0A0] flex items-center gap-1 capitalize mt-0.5">
            <Calendar className="w-3 h-3 text-[#666666]" strokeWidth={1.5} />
            {currentDate}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Botón Instalar App (Oculto si ya está instalada en modo standalone) */}
          {!isStandalone && (
            <button
              onClick={() => setShowInstallModal(true)}
              title="Instalar App en iPhone / Android / Computadora"
              className="px-2.5 py-1.5 text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-600/20 border border-indigo-500/30 rounded-sm transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer shadow-sm animate-pulse hover:animate-none"
            >
              {isIOS ? (
                <Smartphone className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.5} />
              ) : (
                <Download className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.5} />
              )}
              <span className="text-[11px] font-semibold">Instalar App</span>
            </button>
          )}

          {/* Toggle Modo Oscuro / Modo Claro */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            className="px-2.5 py-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#1A1A1A] hover:bg-[#222222] border border-[#2A2A2A] rounded-sm transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer shadow-sm"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.5} />
                <span className="hidden md:inline text-[11px]">Modo Claro</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                <span className="hidden md:inline text-[11px]">Modo Oscuro</span>
              </>
            )}
          </button>

          <button
            onClick={checkHealth}
            title="Verificar conexión Backend"
            className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#1A1A1A] hover:bg-[#222222] border border-[#2A2A2A] rounded-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm text-[11px] text-[#A0A0A0]">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span>{isOnline ? 'Conectado' : 'Sin API'}</span>
          </div>
        </div>
      </header>

      {/* Modal de instalación PWA */}
      <InstallPwaModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </>
  );
}
