import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../version';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error('Por favor ingresa usuario y contraseña');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const user = await login(username.trim(), password);
      toast.success(`¡Bienvenido de nuevo, ${user.full_name || user.username}!`);
    } catch (err) {
      console.error('Error en inicio de sesión:', err);
      if (!err.response) {
        detail = 'No se pudo conectar con el servidor Backend (puerto 8000). Por favor inicia los servicios con la opción [1] en el Panel de Control.';
      } else if (err.response?.status === 404 || err.response?.data?.detail === 'Not Found') {
        detail = 'El servidor Backend se encuentra en una versión anterior o requiere reiniciarse. Por favor usa la opción [3] (Reiniciar Servidores) o [5] (Actualizar) en el Panel de Control (start_app.bat).';
      } else if (err.response?.data?.detail) {
        detail = err.response.data.detail;
      }
      setErrorMsg(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#EAEAEA] flex items-center justify-center p-4 relative overflow-hidden selection:bg-cyan-500 selection:text-black">
      {/* Luces de Fondo Dinámicas */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Contenedor Principal */}
        <div className="bg-[#121212]/90 backdrop-blur-xl border border-[#2A2A2A] rounded-xl p-8 shadow-2xl shadow-black/80">
          {/* Logo y Encabezado */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#181D2A] border border-cyan-500/30 p-2.5 flex items-center justify-center shadow-lg shadow-cyan-950/50 mb-4 transition-transform hover:scale-105 duration-200">
              <img src="/prisma_icon.png" alt="Prisma Lab" className="w-full h-full object-contain" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono font-medium mb-2">
              <Sparkles className="w-3 h-3" />
              <span>Prisma Lab ERP • Local</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Acceso al Sistema</h1>
            <p className="text-xs text-[#888888] mt-1">
              Producción 3D, Cotizaciones & Contabilidad
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-rose-950/40 border border-rose-600/40 text-rose-300 text-xs rounded-lg flex items-center gap-2 animate-shake">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs text-[#A0A0A0] font-medium mb-1.5">
                Nombre de Usuario
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-[#666666] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej: admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-cyan-500/80 text-white pl-9 pr-3 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#A0A0A0] font-medium mb-1.5">
                Contraseña
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[#666666] absolute left-3 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-cyan-500/80 text-white pl-9 pr-10 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-[#666666] hover:text-[#CCCCCC] transition-colors p-0.5"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg text-sm transition-all duration-200 shadow-md shadow-cyan-950/40 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Aplicativo</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer versión */}
        <div className="text-center mt-4 text-[10px] text-[#555555] font-mono">
          Prisma Lab ERP • Versión {APP_VERSION} • Base de Datos Segura
        </div>
      </div>
    </div>
  );
}
