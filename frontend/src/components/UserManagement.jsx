import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Shield, ShieldCheck, ShieldAlert, Key, Edit2, Trash2,
  Check, X, Lock, Unlock, Eye, EyeOff, AlertCircle, Sparkles, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { authService } from '../services/api';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';

const MODULE_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard General', desc: 'Panel resumen de indicadores y métricas' },
  { id: 'production', label: 'Calculadora 3D & Producción', desc: 'Costeo de piezas y registro de tiradas' },
  { id: 'inventory', label: 'Inventario & Materiales', desc: 'Control de filamentos, insumos y compras' },
  { id: 'sales', label: 'Ventas & Cotizaciones', desc: 'Clientes, cotizaciones y facturas' },
  { id: 'accounting', label: 'Contabilidad PUC & Finanzas', desc: 'Catálogo contable, libro diario y balances' },
  { id: 'config', label: 'Configuración del Sistema', desc: 'Parámetros técnicos y gestión de usuarios' },
];

const PRESETS = {
  ADMIN: {
    role: 'ADMIN',
    can_delete: true,
    can_edit: true,
    read_only: false,
    allowed_modules: 'dashboard,production,inventory,sales,accounting,config'
  },
  OPERATOR: {
    role: 'OPERATOR',
    can_delete: false,
    can_edit: true,
    read_only: false,
    allowed_modules: 'dashboard,production,inventory'
  },
  SELLER: {
    role: 'SELLER',
    can_delete: false,
    can_edit: true,
    read_only: false,
    allowed_modules: 'dashboard,sales,inventory'
  },
  CUSTOM: {
    role: 'CUSTOM',
    can_delete: false,
    can_edit: true,
    read_only: false,
    allowed_modules: 'dashboard,production,inventory'
  }
};

const ROLE_MATRICES = {
  ADMIN: {
    dashboard: { read: true, write: true, delete: true },
    production: { read: true, write: true, delete: true },
    inventory: { read: true, write: true, delete: true },
    sales: { read: true, write: true, delete: true },
    accounting: { read: true, write: true, delete: true },
    config: { read: true, write: true, delete: true },
  },
  OPERATOR: {
    dashboard: { read: true, write: false, delete: false },
    production: { read: true, write: true, delete: false },
    inventory: { read: true, write: true, delete: false },
    sales: { read: false, write: false, delete: false },
    accounting: { read: false, write: false, delete: false },
    config: { read: false, write: false, delete: false },
  },
  SELLER: {
    dashboard: { read: true, write: false, delete: false },
    production: { read: false, write: false, delete: false },
    inventory: { read: true, write: false, delete: false },
    sales: { read: true, write: true, delete: false },
    accounting: { read: false, write: false, delete: false },
    config: { read: false, write: false, delete: false },
  },
  CUSTOM: {
    dashboard: { read: true, write: false, delete: false },
    production: { read: true, write: true, delete: false },
    inventory: { read: true, write: true, delete: false },
    sales: { read: true, write: false, delete: false },
    accounting: { read: false, write: false, delete: false },
    config: { read: false, write: false, delete: false },
  }
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal Crear / Editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = crear nuevo
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'OPERATOR',
    is_active: true,
    can_delete: false,
    can_edit: true,
    read_only: false,
    allowed_modules: ['dashboard', 'production', 'inventory'],
    permissions_matrix: ROLE_MATRICES.OPERATOR
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal Reset Password
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Cargar lista de usuarios
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await authService.getUsers();
      setUsers(res.data || []);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      toast.error('Error al cargar la lista de usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Aplicar Preset al cambiar de rol
  const handleRolePreset = (roleKey) => {
    const preset = PRESETS[roleKey] || PRESETS.CUSTOM;
    const modulesArr = preset.allowed_modules.split(',').map(m => m.trim());
    const matrix = ROLE_MATRICES[roleKey] || ROLE_MATRICES.CUSTOM;
    setFormData(prev => ({
      ...prev,
      role: roleKey,
      can_delete: preset.can_delete,
      can_edit: preset.can_edit,
      read_only: preset.read_only,
      allowed_modules: modulesArr,
      permissions_matrix: JSON.parse(JSON.stringify(matrix))
    }));
  };

  // Abrir Modal de Creación
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      full_name: '',
      role: 'OPERATOR',
      is_active: true,
      can_delete: false,
      can_edit: true,
      read_only: false,
      allowed_modules: ['dashboard', 'production', 'inventory'],
      permissions_matrix: JSON.parse(JSON.stringify(ROLE_MATRICES.OPERATOR))
    });
    setShowPassword(false);
    setModalOpen(true);
  };

  // Abrir Modal de Edición
  const handleOpenEdit = (u) => {
    setEditingUser(u);
    const modulesArr = (u.allowed_modules || '').split(',').map(m => m.trim()).filter(Boolean);
    let matrix = null;
    if (u.permissions_matrix) {
      try {
        matrix = JSON.parse(u.permissions_matrix);
      } catch (e) {
        matrix = null;
      }
    }
    if (!matrix) {
      matrix = JSON.parse(JSON.stringify(ROLE_MATRICES[u.role] || ROLE_MATRICES.CUSTOM));
      MODULE_OPTIONS.forEach(mod => {
        const allowed = modulesArr.includes(mod.id);
        matrix[mod.id] = {
          read: allowed,
          write: allowed && u.can_edit && !u.read_only,
          delete: allowed && u.can_delete && !u.read_only
        };
      });
    }

    setFormData({
      username: u.username,
      password: '',
      full_name: u.full_name || '',
      role: u.role || 'OPERATOR',
      is_active: Boolean(u.is_active),
      can_delete: Boolean(u.can_delete),
      can_edit: Boolean(u.can_edit),
      read_only: Boolean(u.read_only),
      allowed_modules: modulesArr.length > 0 ? modulesArr : ['dashboard'],
      permissions_matrix: matrix
    });
    setShowPassword(false);
    setModalOpen(true);
  };

  // Cambio en celda de la Matriz de Permisos
  const handleMatrixChange = (modId, action) => {
    if (formData.role === 'ADMIN') return;
    setFormData(prev => {
      const currentMatrix = { ...(prev.permissions_matrix || ROLE_MATRICES.CUSTOM) };
      const modPerms = { ...(currentMatrix[modId] || { read: false, write: false, delete: false }) };
      const newVal = !modPerms[action];
      modPerms[action] = newVal;

      if (action !== 'read' && newVal) {
        modPerms.read = true;
      }
      if (action === 'read' && !newVal) {
        modPerms.write = false;
        modPerms.delete = false;
      }

      currentMatrix[modId] = modPerms;

      const newAllowed = Object.keys(currentMatrix).filter(m => currentMatrix[m]?.read);
      const anyDelete = Object.values(currentMatrix).some(p => p?.delete);
      const anyWrite = Object.values(currentMatrix).some(p => p?.write);

      return {
        ...prev,
        role: 'CUSTOM',
        permissions_matrix: currentMatrix,
        allowed_modules: newAllowed,
        can_delete: anyDelete,
        can_edit: anyWrite
      };
    });
  };

  // Toggle Módulo
  const handleToggleModule = (modId) => {
    if (formData.role === 'ADMIN') return; // Admin siempre tiene todos
    setFormData(prev => {
      const exists = prev.allowed_modules.includes(modId);
      const updated = exists
        ? prev.allowed_modules.filter(m => m !== modId)
        : [...prev.allowed_modules, modId];
      return { ...prev, allowed_modules: updated };
    });
  };

  // Guardar (Crear o Actualizar)
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!editingUser && !formData.username.trim()) {
      toast.error('El nombre de usuario es obligatorio');
      return;
    }
    if (!editingUser && (!formData.password || formData.password.length < 4)) {
      toast.error('La contraseña inicial debe tener al menos 4 caracteres');
      return;
    }
    if (!formData.full_name.trim()) {
      toast.error('Ingresa el nombre completo del usuario');
      return;
    }
    if (formData.allowed_modules.length === 0) {
      toast.error('Debes seleccionar al menos un módulo permitido');
      return;
    }

    setSaving(true);
    try {
      const modulesStr = formData.role === 'ADMIN'
        ? 'dashboard,production,inventory,sales,accounting,config'
        : formData.allowed_modules.join(',');

      const matrixStr = JSON.stringify(
        formData.role === 'ADMIN' ? ROLE_MATRICES.ADMIN : (formData.permissions_matrix || ROLE_MATRICES.CUSTOM)
      );

      if (editingUser) {
        // Actualizar
        const payload = {
          full_name: formData.full_name.trim(),
          role: formData.role,
          is_active: formData.is_active,
          can_delete: formData.role === 'ADMIN' ? true : formData.can_delete,
          can_edit: formData.role === 'ADMIN' ? true : formData.can_edit,
          read_only: formData.role === 'ADMIN' ? false : formData.read_only,
          allowed_modules: modulesStr,
          permissions_matrix: matrixStr,
        };
        if (formData.password.trim()) {
          payload.password = formData.password.trim();
        }

        await authService.updateUser(editingUser.id, payload);
        toast.success(`Usuario '${editingUser.username}' actualizado correctamente`);
      } else {
        // Crear
        const payload = {
          username: formData.username.trim().toLowerCase(),
          password: formData.password.trim(),
          full_name: formData.full_name.trim(),
          role: formData.role,
          is_active: formData.is_active,
          can_delete: formData.role === 'ADMIN' ? true : formData.can_delete,
          can_edit: formData.role === 'ADMIN' ? true : formData.can_edit,
          read_only: formData.role === 'ADMIN' ? false : formData.read_only,
          allowed_modules: modulesStr,
          permissions_matrix: matrixStr,
        };

        await authService.createUser(payload);
        toast.success(`Usuario '${formData.username}' creado exitosamente`);
      }

      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Error al guardar usuario:', err);
      const detail = err.response?.data?.detail || 'Error al procesar la solicitud';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  // Restablecer Clave
  const handleOpenReset = (u) => {
    setResetTargetUser(u);
    setNewPassword('');
    setShowResetPassword(false);
    setResetModalOpen(true);
  };

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      toast.error('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }
    setResetting(true);
    try {
      await authService.resetUserPassword(resetTargetUser.id, newPassword);
      toast.success(`Contraseña de '${resetTargetUser.username}' restablecida con éxito`);
      setResetModalOpen(false);
    } catch (err) {
      console.error('Error al restablecer contraseña:', err);
      toast.error(err.response?.data?.detail || 'Error al restablecer contraseña');
    } finally {
      setResetting(false);
    }
  };

  // Eliminar Usuario
  const handleDeleteUser = async (u) => {
    if (u.username.toLowerCase() === 'admin') {
      toast.error('No se puede eliminar la cuenta del Administrador principal');
      return;
    }
    if (u.id === currentUser?.id) {
      toast.error('No puedes eliminar tu propia cuenta activa');
      return;
    }
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario '${u.username}' (${u.full_name})?`)) {
      return;
    }

    try {
      await authService.deleteUser(u.id);
      toast.success(`Usuario '${u.username}' eliminado correctamente`);
      fetchUsers();
    } catch (err) {
      console.error('Error al eliminar usuario:', err);
      toast.error(err.response?.data?.detail || 'Error al eliminar usuario');
    }
  };

  // Métricas
  const totalCount = users.length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const activeCount = users.filter(u => u.is_active).length;

  return (
    <div className="space-y-4 w-full">
      {/* Encabezado y Métricas */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Gestión de Usuarios & Control de Accesos
            </h2>
          </div>
          <p className="text-xs text-[#8E8E8E] mt-1">
            Administra credenciales del equipo y delimita permisos de lectura, edición, borrado y módulos visibles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 bg-[#121212] hover:bg-[#222222] text-[#A0A0A0] hover:text-white border border-[#2A2A2A] rounded-sm text-xs transition-colors"
            title="Refrescar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-sm text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950/40 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-sm">
          <div className="text-[10px] text-[#808080] uppercase font-mono tracking-wider">Total Usuarios</div>
          <div className="text-xl font-bold text-white mt-0.5">{totalCount}</div>
        </div>
        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-sm">
          <div className="text-[10px] text-emerald-400/80 uppercase font-mono tracking-wider">Administradores</div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">{adminCount}</div>
        </div>
        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-sm">
          <div className="text-[10px] text-cyan-400/80 uppercase font-mono tracking-wider">Operadores / Ventas</div>
          <div className="text-xl font-bold text-cyan-400 mt-0.5">{totalCount - adminCount}</div>
        </div>
        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-sm">
          <div className="text-[10px] text-blue-400/80 uppercase font-mono tracking-wider">Cuentas Activas</div>
          <div className="text-xl font-bold text-blue-400 mt-0.5">{activeCount}</div>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1A1A1A] text-[#8A8A8A] uppercase font-mono text-[10px] border-b border-[#2A2A2A]">
                <th className="p-3">Usuario & Nombre</th>
                <th className="p-3">Rol</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Capacidades</th>
                <th className="p-3">Módulos Asignados</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202020] text-[#D0D0D0]">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-[#808080]">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-[#808080]">
                    No se encontraron usuarios registrados.
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const isCurrent = currentUser?.id === u.id;
                  const isMainAdmin = u.username.toLowerCase() === 'admin';
                  const roleConfig = ROLE_LABELS[u.role] || { label: u.role, color: 'slate' };
                  const modules = (u.allowed_modules || '').split(',').map(m => m.trim()).filter(Boolean);

                  return (
                    <tr key={u.id} className="hover:bg-[#1C1C1C] transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            u.role === 'ADMIN'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                              : 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white">{u.username}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                  Tú
                                </span>
                              )}
                              {isMainAdmin && (
                                <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  Principal
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#7A7A7A]">{u.full_name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                          u.role === 'ADMIN'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : u.role === 'OPERATOR'
                            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                            : u.role === 'SELLER'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        }`}>
                          {roleConfig.label}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          u.is_active
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-950/60 text-rose-400 border border-rose-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {u.role === 'ADMIN' ? (
                            <span className="text-[10px] text-emerald-400 font-mono">Control Total</span>
                          ) : (
                            <>
                              <span className={`px-1.5 py-0.5 text-[9px] rounded font-mono ${
                                u.read_only
                                  ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-[#A0A0A0]'
                              }`}>
                                {u.read_only ? 'Solo Lectura' : 'Lectura/Escritura'}
                              </span>
                              <span className={`px-1.5 py-0.5 text-[9px] rounded font-mono ${
                                u.can_delete
                                  ? 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                                  : 'bg-slate-800 text-[#6E6E6E]'
                              }`}>
                                {u.can_delete ? 'Puede Borrar' : 'Sin Borrado'}
                              </span>
                              {u.permissions_matrix && (
                                <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                                  Matriz Granular
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {u.role === 'ADMIN' ? (
                            <span className="text-[10px] text-[#A0A0A0] font-mono">Todos los módulos (6)</span>
                          ) : (
                            modules.map(m => (
                              <span key={m} className="px-1.5 py-0.5 bg-[#202020] border border-[#303030] text-[9px] text-[#B0B0B0] rounded">
                                {m}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenReset(u)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-[#252525] rounded transition-colors"
                            title="Restablecer Contraseña"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-[#252525] rounded transition-colors"
                            title="Editar Datos y Permisos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!isMainAdmin && !isCurrent && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-[#252525] rounded transition-colors"
                              title="Eliminar Usuario"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR USUARIO */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-[#2D2D2D] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  {editingUser ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingUser ? `Editar Usuario: ${editingUser.username}` : 'Crear Nuevo Usuario'}
                  </h3>
                  <p className="text-[11px] text-[#808080]">
                    Configura las credenciales y el alcance de permisos del usuario.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#808080] hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* Plantillas Rápidas de Rol */}
              <div>
                <label className="block text-[11px] font-mono text-[#8E8E8E] uppercase mb-1.5">
                  Plantilla de Rol
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {['ADMIN', 'OPERATOR', 'SELLER', 'CUSTOM'].map((rk) => {
                    const isSelected = formData.role === rk;
                    return (
                      <button
                        key={rk}
                        type="button"
                        onClick={() => handleRolePreset(rk)}
                        className={`px-2 py-1.5 rounded text-xs font-mono border transition-all text-center ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500'
                            : 'bg-[#1C1C1C] text-[#808080] border-[#2A2A2A] hover:bg-[#252525] hover:text-white'
                        }`}
                      >
                        {ROLE_LABELS[rk]?.label || rk}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Datos Generales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#B0B0B0] mb-1">Nombre de Usuario *</label>
                  <input
                    type="text"
                    disabled={Boolean(editingUser)}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                    placeholder="ej: operador1"
                    className="w-full bg-[#1F1F1F] border border-[#2D2D2D] text-white text-xs rounded p-2 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                  {editingUser && (
                    <span className="text-[10px] text-[#606060]">El username no se puede cambiar.</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-[#B0B0B0] mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="ej: Juan Pérez"
                    className="w-full bg-[#1F1F1F] border border-[#2D2D2D] text-white text-xs rounded p-2 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div>
                <label className="block text-xs text-[#B0B0B0] mb-1">
                  {editingUser ? 'Nueva Contraseña (dejar en blanco para conservar actual)' : 'Contraseña Inicial *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? '••••••••' : 'Mínimo 4 caracteres'}
                    className="w-full bg-[#1F1F1F] border border-[#2D2D2D] text-white text-xs rounded p-2 pr-9 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#707070] hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Estado Activo */}
              <div className="flex items-center justify-between p-2.5 bg-[#1F1F1F] border border-[#2A2A2A] rounded">
                <div>
                  <div className="text-xs font-medium text-white">Cuenta Activa</div>
                  <div className="text-[10px] text-[#808080]">Permite al usuario iniciar sesión en el sistema</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#303030] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Permisos Granulares */}
              {formData.role !== 'ADMIN' && (
                <div className="space-y-3 pt-2 border-t border-[#2A2A2A]">
                  <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Permisos de Operación
                  </div>

                  {/* Switch Can Edit */}
                  <div className="flex items-center justify-between p-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded">
                    <div>
                      <div className="text-xs font-medium text-white">Permitir Crear & Modificar Registros</div>
                      <div className="text-[10px] text-[#808080]">Guardar cotizaciones, actualizar stock, editar cálculos</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.can_edit && !formData.read_only}
                        disabled={formData.read_only}
                        onChange={(e) => setFormData({ ...formData, can_edit: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#303030] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-disabled:opacity-40"></div>
                    </label>
                  </div>

                  {/* Switch Can Delete */}
                  <div className="flex items-center justify-between p-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded">
                    <div>
                      <div className="text-xs font-medium text-white">Permitir Eliminar Registros</div>
                      <div className="text-[10px] text-[#808080]">Borrar bobinas, insumos, cotizaciones o registros contables</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.can_delete && !formData.read_only}
                        disabled={formData.read_only}
                        onChange={(e) => setFormData({ ...formData, can_delete: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#303030] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500 peer-disabled:opacity-40"></div>
                    </label>
                  </div>

                  {/* Switch Read Only */}
                  <div className="flex items-center justify-between p-2.5 bg-[#1C1C1C] border border-[#2A2A2A] rounded">
                    <div>
                      <div className="text-xs font-medium text-white">Modo Solo Lectura (Auditor / Supervisor)</div>
                      <div className="text-[10px] text-[#808080]">Deshabilita todas las acciones de edición y eliminación</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.read_only}
                        onChange={(e) => setFormData({ ...formData, read_only: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#303030] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>

                  {/* Matriz Granular de Permisos por Módulo */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Matriz de Permisos por Módulo
                      </div>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        Control Granular
                      </span>
                    </div>

                    <div className="border border-[#2D2D2D] rounded-lg overflow-hidden bg-[#141414]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#1C1C1C] text-[#8E8E8E] font-mono text-[10px] uppercase border-b border-[#2D2D2D]">
                          <tr>
                            <th className="py-2.5 px-3">Módulo</th>
                            <th className="py-2.5 px-2 text-center text-cyan-400">Lectura (Ver)</th>
                            <th className="py-2.5 px-2 text-center text-emerald-400">Crear / Editar</th>
                            <th className="py-2.5 px-2 text-center text-rose-400">Eliminar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#242424]">
                          {MODULE_OPTIONS.map((m) => {
                            const modPerms = formData.permissions_matrix?.[m.id] || { read: false, write: false, delete: false };
                            const isAdminRole = formData.role === 'ADMIN';

                            return (
                              <tr key={m.id} className="hover:bg-[#1A1A1A] transition-colors">
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-white text-xs">{m.label}</div>
                                  <div className="text-[10px] text-[#707070]">{m.desc}</div>
                                </td>

                                {/* Lectura */}
                                <td className="py-2.5 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    disabled={isAdminRole}
                                    checked={isAdminRole || Boolean(modPerms.read)}
                                    onChange={() => handleMatrixChange(m.id, 'read')}
                                    className="rounded bg-[#222] border-[#3E3E3E] text-cyan-500 focus:ring-0 cursor-pointer disabled:opacity-60"
                                  />
                                </td>

                                {/* Escritura */}
                                <td className="py-2.5 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    disabled={isAdminRole || formData.read_only}
                                    checked={isAdminRole || (!formData.read_only && Boolean(modPerms.write))}
                                    onChange={() => handleMatrixChange(m.id, 'write')}
                                    className="rounded bg-[#222] border-[#3E3E3E] text-emerald-500 focus:ring-0 cursor-pointer disabled:opacity-60"
                                  />
                                </td>

                                {/* Eliminación */}
                                <td className="py-2.5 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    disabled={isAdminRole || formData.read_only}
                                    checked={isAdminRole || (!formData.read_only && Boolean(modPerms.delete))}
                                    onChange={() => handleMatrixChange(m.id, 'delete')}
                                    className="rounded bg-[#222] border-[#3E3E3E] text-rose-500 focus:ring-0 cursor-pointer disabled:opacity-60"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-[#202020] hover:bg-[#2A2A2A] text-[#A0A0A0] hover:text-white rounded text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded text-xs shadow-md shadow-cyan-950/40 transition-all flex items-center gap-1.5"
                >
                  {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingUser ? 'Guardar Cambios' : 'Crear Usuario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESET PASSWORD */}
      {resetModalOpen && resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-[#2D2D2D] rounded-lg max-w-sm w-full shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Restablecer Contraseña</h3>
                  <p className="text-[11px] text-[#808080]">Usuario: {resetTargetUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalOpen(false)}
                className="p-1 text-[#808080] hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReset} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs text-[#B0B0B0] mb-1">Nueva Contraseña *</label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full bg-[#1F1F1F] border border-[#2D2D2D] text-white text-xs rounded p-2 pr-9 focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#707070] hover:text-white"
                  >
                    {showResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="px-3 py-1.5 bg-[#202020] hover:bg-[#2A2A2A] text-[#A0A0A0] hover:text-white rounded text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded text-xs shadow transition-colors flex items-center gap-1.5"
                >
                  {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Cambiar Clave</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
