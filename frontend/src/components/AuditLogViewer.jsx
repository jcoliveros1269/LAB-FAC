import React, { useState, useEffect } from 'react';
import {
  FileText, RefreshCw, Filter, Shield, User, Clock,
  Search, AlertCircle, CheckCircle2, Trash2, Edit3, Key, LogIn
} from 'lucide-react';
import { authService } from '../services/api';
import { toast } from 'sonner';

const MODULE_COLORS = {
  auth: 'bg-purple-950/40 text-purple-400 border-purple-800/40',
  inventory: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40',
  sales: 'bg-cyan-950/40 text-cyan-400 border-cyan-800/40',
  accounting: 'bg-amber-950/40 text-amber-400 border-amber-800/40',
  production: 'bg-blue-950/40 text-blue-400 border-blue-800/40',
  config: 'bg-zinc-800 text-zinc-300 border-zinc-700',
};

const ACTION_ICONS = {
  LOGIN: <LogIn className="w-3.5 h-3.5 text-blue-400" />,
  CREATE_USER: <User className="w-3.5 h-3.5 text-emerald-400" />,
  UPDATE_USER: <Edit3 className="w-3.5 h-3.5 text-amber-400" />,
  DELETE_USER: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  PASSWORD_RESET: <Key className="w-3.5 h-3.5 text-amber-400" />,
  CHANGE_PASSWORD: <Key className="w-3.5 h-3.5 text-cyan-400" />,
  CREATE_MATERIAL: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  DELETE_MATERIAL: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  DELETE_PRODUCT: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  DELETE_SUPPLY: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  CREATE_DOCUMENT: <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />,
  DELETE_DOCUMENT: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  DELETE_PUC: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  DELETE_JOURNAL: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
  DELETE_CASHFLOW: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
};

export default function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [limit, setLimit] = useState(100);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { limit };
      if (selectedModule) params.module = selectedModule;
      if (selectedAction) params.action = selectedAction;
      if (searchUser.trim()) params.username = searchUser.trim();

      const res = await authService.getAuditLogs(params);
      setLogs(res.data || []);
    } catch (err) {
      console.error('Error al cargar bitácora de auditoría:', err);
      toast.error('No se pudo cargar la bitácora de auditoría');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedModule, selectedAction, limit]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#181818] border border-[#2A2A2A] rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <FileText className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-white tracking-wide">
              Bitácora de Auditoría & Trazabilidad
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#252525] text-[#909090] border border-[#333]">
              {logs.length} eventos
            </span>
          </div>
          <p className="text-xs text-[#808080]">
            Registro inmutable de inicio de sesión, altas, modificaciones y eliminaciones de registros críticos en el sistema ERP.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 bg-[#202020] hover:bg-[#282828] text-zinc-300 hover:text-white rounded-md text-xs font-mono border border-[#333] transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-[#141414] border border-[#242424] rounded-lg p-3.5 flex flex-wrap items-center gap-3">
        {/* Filtro Módulo */}
        <div className="flex items-center gap-1.5 text-xs text-[#808080]">
          <Filter className="w-3.5 h-3.5" />
          <span>Módulo:</span>
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="bg-[#1F1F1F] border border-[#2F2F2F] text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="">Todos los módulos</option>
            <option value="auth">Autenticación / Usuarios</option>
            <option value="inventory">Inventario & Materiales</option>
            <option value="sales">Ventas & Documentos</option>
            <option value="accounting">Contabilidad & PUC</option>
            <option value="production">Producción 3D</option>
          </select>
        </div>

        {/* Filtro Acción */}
        <div className="flex items-center gap-1.5 text-xs text-[#808080]">
          <span>Acción:</span>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-[#1F1F1F] border border-[#2F2F2F] text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="">Todas las acciones</option>
            <option value="LOGIN">LOGIN</option>
            <option value="CREATE_USER">CREATE_USER</option>
            <option value="UPDATE_USER">UPDATE_USER</option>
            <option value="DELETE_USER">DELETE_USER</option>
            <option value="PASSWORD_RESET">PASSWORD_RESET</option>
            <option value="CREATE_MATERIAL">CREATE_MATERIAL</option>
            <option value="DELETE_MATERIAL">DELETE_MATERIAL</option>
            <option value="CREATE_DOCUMENT">CREATE_DOCUMENT</option>
            <option value="DELETE_DOCUMENT">DELETE_DOCUMENT</option>
            <option value="DELETE_PUC">DELETE_PUC</option>
            <option value="DELETE_JOURNAL">DELETE_JOURNAL</option>
            <option value="DELETE_CASHFLOW">DELETE_CASHFLOW</option>
          </select>
        </div>

        {/* Filtro Usuario */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              placeholder="Filtrar por usuario..."
              className="bg-[#1F1F1F] border border-[#2F2F2F] text-white text-xs rounded pl-7 pr-2.5 py-1.5 w-36 sm:w-44 focus:outline-none focus:border-cyan-500"
            />
            <Search className="w-3 h-3 text-[#666] absolute left-2 top-2.5" />
          </div>
          {searchUser && (
            <button
              type="button"
              onClick={() => { setSearchUser(''); setTimeout(fetchLogs, 50); }}
              className="text-xs text-[#707070] hover:text-white"
            >
              Limpiar
            </button>
          )}
        </form>

        {/* Límite */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[#808080]">
          <span>Mostrar:</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-[#1F1F1F] border border-[#2F2F2F] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* Tabla de Eventos */}
      <div className="bg-[#181818] border border-[#2A2A2A] rounded-lg overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1F1F1F] text-[#8E8E8E] font-mono uppercase text-[11px] border-b border-[#2A2A2A]">
              <tr>
                <th className="py-3 px-4">Fecha & Hora</th>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Módulo</th>
                <th className="py-3 px-4">Acción</th>
                <th className="py-3 px-4">Detalle / Operación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242424]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#707070]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                      <span>Cargando bitácora de auditoría...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#707070]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-6 h-6 text-[#555]" />
                      <span>No se encontraron eventos que coincidan con los filtros seleccionados.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const modColor = MODULE_COLORS[log.module] || 'bg-zinc-800 text-zinc-300 border-zinc-700';
                  const actionIcon = ACTION_ICONS[log.action] || <Clock className="w-3.5 h-3.5 text-zinc-400" />;

                  return (
                    <tr key={log.id} className="hover:bg-[#1E1E1E] transition-colors">
                      {/* Fecha */}
                      <td className="py-3 px-4 font-mono text-[11px] text-[#A0A0A0] whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>

                      {/* Usuario */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#282828] border border-[#3A3A3A] flex items-center justify-center text-[10px] font-bold text-white uppercase">
                            {log.username?.charAt(0) || 'U'}
                          </div>
                          <span className="font-medium text-white font-mono text-xs">
                            {log.username}
                          </span>
                        </div>
                      </td>

                      {/* Módulo */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${modColor}`}>
                          {log.module?.toUpperCase()}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {actionIcon}
                          <span className="font-mono text-[11px] text-[#C0C0C0] font-semibold">
                            {log.action}
                          </span>
                        </div>
                      </td>

                      {/* Detalle */}
                      <td className="py-3 px-4 text-[#D0D0D0] text-xs">
                        {log.description}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
