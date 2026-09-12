import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Share, 
  PlusSquare, 
  CheckCircle2, 
  X, 
  Smartphone, 
  Monitor, 
  HelpCircle,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.navigator.standalone === true || 
        window.matchMedia('(display-mode: standalone)').matches ||
        document.referrer.includes('android-app://');
      setIsStandalone(Boolean(isStandaloneMode));
      setIsInstalled(Boolean(isStandaloneMode));
    };

    checkStandalone();

    // Check platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMobileDevice = isAppleDevice || /android|webos|blackberry|iemobile|opera mini/i.test(userAgent);
    
    setIsIOS(isAppleDevice);
    setIsMobile(isMobileDevice);

    // Capture Chrome/Android/Desktop install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) {
      return false;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  };

  return {
    deferredPrompt,
    isStandalone,
    isIOS,
    isMobile,
    isInstalled,
    canPromptDirectly: Boolean(deferredPrompt),
    triggerInstall
  };
}

export default function InstallPwaModal({ isOpen, onClose }) {
  const { isIOS, isStandalone, canPromptDirectly, triggerInstall } = usePwaInstall();
  const [installing, setInstalling] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  if (!isOpen) return null;

  const handleDirectInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await triggerInstall();
      if (accepted) {
        setInstalledSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (e) {
      console.error('Error triggering install:', e);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#141414] border border-[#2A2A2A] rounded-xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#222222] transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with App Brand */}
        <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-[#262626]">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center shrink-0">
            <img src="/favicon.svg" alt="Prisma Lab Logo" className="w-10 h-10 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[#EAEAEA]">Instalar Prisma Lab</h3>
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
                PWA
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Accede a pantalla completa como una App nativa en tu dispositivo
            </p>
          </div>
        </div>

        {isStandalone ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">¡Prisma Lab ya está instalada!</h4>
            <p className="text-xs text-slate-400">
              Estás ejecutando la aplicación en modo nativo independiente (Standalone).
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-[#222222] hover:bg-[#2A2A2A] border border-[#333333] text-xs font-medium rounded-lg transition-colors"
            >
              Entendido
            </button>
          </div>
        ) : isIOS ? (
          /* iOS Safari Specific Guide */
          <div className="space-y-4">
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-lg p-3 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-200">
                <strong>En iPhone / iPad (Safari)</strong> Apple requiere instalar mediante el menú Compartir. Sigue estos 3 pasos:
              </p>
            </div>

            <div className="space-y-3">
              {/* Step 1 */}
              <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3 flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </div>
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-white">Toca el botón Compartir</span>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    En la barra inferior o superior de Safari, presiona el icono <Share className="w-3.5 h-3.5 inline text-blue-400 mx-1 align-text-bottom" /> (cuadro con flecha hacia arriba).
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3 flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </div>
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-white">Selecciona "Añadir a pantalla de inicio"</span>
                  <p className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-1 flex-wrap">
                    Desliza hacia abajo en la lista y pulsa <PlusSquare className="w-3.5 h-3.5 text-indigo-400 inline" /> <span className="text-slate-200">"Añadir a la pantalla de inicio"</span>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3 flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </div>
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-white">Pulsa "Añadir"</span>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    En la esquina superior derecha, confirma tocando <strong className="text-emerald-400">Añadir</strong>. ¡Listo! Tendrás el ícono de Prisma Lab en tu pantalla principal.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#111111] rounded-lg p-3 border border-[#222222] text-[11px] text-slate-400 space-y-1">
              <p className="flex items-center gap-1.5 font-medium text-slate-300">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                ¿Usas Chrome u otro navegador en iPhone?
              </p>
              <p>
                Para instalarla como aplicación completa con modo sin barra de navegación, abre la dirección en el navegador <strong>Safari</strong> de iOS.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
            >
              ¡Entendido, voy a añadirla!
            </button>
          </div>
        ) : canPromptDirectly ? (
          /* Android / Desktop Chrome Direct Prompt */
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Instala Prisma Lab directamente en tu dispositivo o computadora para una experiencia optimizada de pantalla completa, carga instantánea y mayor rendimiento.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#1A1A1A] p-2.5 rounded-lg border border-[#2A2A2A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-300">Modo Pantalla Completa</span>
              </div>
              <div className="bg-[#1A1A1A] p-2.5 rounded-lg border border-[#2A2A2A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-300">Acceso Rápido</span>
              </div>
            </div>

            {installedSuccess ? (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                ¡Instalación completada con éxito!
              </div>
            ) : (
              <button
                onClick={handleDirectInstall}
                disabled={installing}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
              >
                <Download className="w-4 h-4" />
                {installing ? 'Instalando...' : 'Instalar Prisma Lab Ahora'}
              </button>
            )}
          </div>
        ) : (
          /* Generic Fallback (Desktop Browser or other mobile) */
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Puedes añadir Prisma Lab a la pantalla principal o instalarla desde tu navegador:
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3 flex items-start gap-3">
                <Smartphone className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <strong className="text-white block">En Teléfonos Móviles / Tablets:</strong>
                  <span className="text-slate-400 text-[11px]">
                    Abre el menú del navegador (tres puntos <span className="text-white">⋮</span> o botón compartir <Share className="w-3 h-3 inline" />) y selecciona <strong>"Añadir a la pantalla principal"</strong> o <strong>"Instalar aplicación"</strong>.
                  </span>
                </div>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3 flex items-start gap-3">
                <Monitor className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <div>
                  <strong className="text-white block">En Computadora (Chrome / Edge / Brave):</strong>
                  <span className="text-slate-400 text-[11px]">
                    Haz clic en el icono de instalación <Download className="w-3 h-3 inline text-cyan-400" /> en el extremo derecho de la barra de direcciones de tu navegador.
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 px-4 bg-[#222222] hover:bg-[#2A2A2A] border border-[#333333] text-xs font-medium rounded-lg transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Floating Prompt Banner for Mobile Users (Shows once until dismissed)
export function MobileInstallBanner() {
  const { isStandalone, isMobile } = usePwaInstall();
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('prisma_pwa_banner_dismissed') === 'true';
  });

  if (isStandalone || !isMobile || dismissed) {
    return (
      <>
        <InstallPwaModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('prisma_pwa_banner_dismissed', 'true');
  };

  return (
    <>
      <div className="bg-gradient-to-r from-indigo-950/90 via-slate-900/95 to-slate-950/95 border-b border-indigo-500/30 px-4 py-2.5 flex items-center justify-between gap-3 text-xs z-30 sticky top-0 md:hidden backdrop-blur-md">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
            <Download className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="truncate">
            <p className="font-semibold text-white truncate text-[11px]">Instala Prisma Lab en tu iPhone / Móvil</p>
            <p className="text-[10px] text-slate-400 truncate">Acceso rápido en pantalla completa</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setModalOpen(true)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium rounded shadow-sm transition-colors"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-white rounded"
            title="Descartar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <InstallPwaModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
