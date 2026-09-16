import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, Sun, Moon, LogOut, User as UserIcon } from 'lucide-react';
import api from '../services/api';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';
import { toast } from 'sonner';

export default function Header({ activeTitle, theme, toggleTheme }) {
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [checking, setChecking] = useState(true);

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

  const handleLogout = () => {
    logout();
    toast.info('Sesión cerrada correctamente');
  };

  const currentDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const roleInfo = user?.role ? (ROLE_LABELS[user.role] || { label: user.role, color: 'slate' }) : null;

  const getRoleBadgeClasses = (color) => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'cyan':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'amber':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'purple':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <header className="bg-[#101010] border-b border-[#2A2A2A] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors duration-200">
      <div className="min-w-0 flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-[#141824] border border-cyan-500/20 p-0.5 flex md:hidden items-center justify-center shrink-0">
          <img src="/prisma_icon.png" alt="Prisma Lab" className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#EAEAEA] tracking-tight truncate">{activeTitle}</h2>
          <p className="text-[11px] text-[#A0A0A0] flex items-center gap-1 capitalize mt-0.5">
            <Calendar className="w-3 h-3 text-[#666666]" strokeWidth={1.5} />
            {currentDate}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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

        {/* Perfil del Usuario y Logout */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-[#2A2A2A]">
            <div className="hidden lg:flex flex-col items-end leading-tight">
              <span className="text-xs font-medium text-[#EAEAEA] truncate max-w-[130px]">
                {user.full_name || user.username}
              </span>
              {roleInfo && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold mt-0.5 ${getRoleBadgeClasses(
                    roleInfo.color
                  )}`}
                >
                  {roleInfo.label}
                </span>
              )}
            </div>

            <div className="w-7 h-7 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 flex items-center justify-center text-xs font-bold font-mono">
              {user.username.charAt(0).toUpperCase()}
            </div>

            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-1.5 text-rose-400/80 hover:text-rose-300 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-800/30 rounded-sm transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
