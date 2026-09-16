import React from 'react';
import { 
  LayoutDashboard, 
  Calculator, 
  Package, 
  FileText, 
  BookOpen, 
  Sliders
} from 'lucide-react';

import { APP_VERSION, APP_BUILD_INFO } from '../version';

export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'production', label: 'Calculadora 3D', icon: Calculator },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'sales', label: 'Ventas & Cotizaciones', icon: FileText },
    { id: 'accounting', label: 'Contabilidad PUC', icon: BookOpen },
    { id: 'config', label: 'Configuración', icon: Sliders },
  ];

  return (
    <aside className="w-full md:w-60 bg-[#101010] border-r border-[#2A2A2A] flex flex-col shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto z-40">
      {/* Brand Header */}
      <div className="p-3.5 border-b border-[#2A2A2A] flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#141824] border border-cyan-500/20 p-1 flex items-center justify-center shrink-0 shadow-sm shadow-cyan-950/30">
          <img src="/prisma_icon.png" alt="Prisma Lab" className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-sm text-[#EAEAEA] tracking-tight leading-tight">
            PRISMA LAB
          </h1>
          <p className="text-[10px] text-cyan-400/80 font-medium leading-tight">ERP Impresión 3D</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-0.5 flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-sm transition-colors text-left ${
                isActive
                  ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                  : 'text-[#A0A0A0] hover:text-[#EAEAEA] hover:bg-[#1A1A1A]/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-slate-200' : 'text-[#666666]'}`} strokeWidth={1.5} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Status */}
      <div className="p-3 border-t border-[#2A2A2A] text-[10px] text-[#666666] flex items-center justify-between">
        <p className="text-[#888888] font-medium">Prisma Lab OS • Local</p>
        <button
          type="button"
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then((names) => {
                names.forEach((name) => caches.delete(name));
              });
            }
            window.location.href = window.location.pathname + '?v=' + Date.now();
          }}
          title={`Versión instalada: ${APP_BUILD_INFO}. Haz clic para forzar recarga limpia sin caché.`}
          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono font-bold bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          {APP_VERSION}
        </button>
      </div>
    </aside>
  );
}
