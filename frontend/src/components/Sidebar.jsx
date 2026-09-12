import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Calculator, 
  Package, 
  FileText, 
  BookOpen, 
  Sliders, 
  Box,
  Download,
  Smartphone
} from 'lucide-react';
import InstallPwaModal, { usePwaInstall } from './InstallPwaModal';

export default function Sidebar({ activeTab, setActiveTab }) {
  const [showInstallModal, setShowInstallModal] = useState(false);
  const { isStandalone, isIOS } = usePwaInstall();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'production', label: 'Calculadora 3D', icon: Calculator },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'sales', label: 'Ventas & Cotizaciones', icon: FileText },
    { id: 'accounting', label: 'Contabilidad PUC', icon: BookOpen },
    { id: 'config', label: 'Configuración', icon: Sliders },
  ];

  return (
    <>
      <aside className="w-full md:w-60 bg-[#101010] border-r border-[#2A2A2A] flex flex-col shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto z-40">
        {/* Brand Header */}
        <div className="p-4 border-b border-[#2A2A2A] flex items-center gap-3">
          <div className="p-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm text-slate-300">
            <Box className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-[#EAEAEA] tracking-tight">PRISMA LAB</h1>
            <p className="text-[10px] text-[#A0A0A0]">ERP Impresión 3D</p>
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

        {/* Install Banner / Button in Sidebar if not installed */}
        {!isStandalone && (
          <div className="p-2 border-t border-[#2A2A2A]">
            <button
              onClick={() => setShowInstallModal(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-sm text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all text-left"
            >
              {isIOS ? (
                <Smartphone className="w-4 h-4 text-indigo-400 shrink-0" strokeWidth={1.5} />
              ) : (
                <Download className="w-4 h-4 text-indigo-400 shrink-0" strokeWidth={1.5} />
              )}
              <div className="truncate">
                <p className="font-semibold text-[11px] leading-tight">Instalar App</p>
                <p className="text-[9px] text-slate-400 leading-tight">iPhone / Android / PC</p>
              </div>
            </button>
          </div>
        )}

        {/* Footer Status */}
        <div className="p-3 border-t border-[#2A2A2A] text-[10px] text-[#666666] flex items-center justify-between">
          <p>Prisma Lab OS • Local</p>
          <span className="text-[9px] text-emerald-400/80 font-mono">v1.2 PWA</span>
        </div>
      </aside>

      {/* Modal */}
      <InstallPwaModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </>
  );
}
