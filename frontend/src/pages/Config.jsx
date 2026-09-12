import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Zap, Database, Download, Search, X, Plus, Edit3, Trash2, Check, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { configService } from '../services/api';

export default function Config() {
  const [configs, setConfigs] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [discountSearch, setDiscountSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados para edición de descuentos
  const [editingDiscountId, setEditingDiscountId] = useState(null);
  const [editDiscountData, setEditDiscountData] = useState({
    min_units: 1,
    max_units: 5,
    discount_percentage: 0,
    suggested_price_multiplier: 2.8
  });

  // Modal para nuevo descuento
  const [showAddDiscountModal, setShowAddDiscountModal] = useState(false);
  const [newDiscountData, setNewDiscountData] = useState({
    min_units: 1,
    max_units: 5,
    discount_percentage: 0,
    suggested_price_multiplier: 2.8
  });

  const loadConfigData = async () => {
    setLoading(true);
    try {
      const [cfgRes, discRes] = await Promise.all([
        configService.getConfigs(),
        configService.getDiscounts()
      ]);
      setConfigs(cfgRes.data || []);
      setDiscounts(discRes.data || []);
    } catch (err) {
      console.error('Error cargando configuración:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigData();
  }, []);

  const handleConfigChange = (key, val) => {
    setConfigs(configs.map(c => c.key === key ? { ...c, value: parseFloat(val) || 0 } : c));
  };

  const handleSave = async (cfg) => {
    setSaving(true);
    try {
      await configService.updateConfig(cfg);
      toast.success(`Parámetro '${cfg.description || cfg.key}' actualizado`);
    } catch (err) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = () => {
    window.open('/api/config/backup', '_blank');
    toast.success('Copia de seguridad SQLite generada');
  };

  // Handlers para Descuentos
  const handleStartEditDiscount = (d) => {
    setEditingDiscountId(d.id);
    setEditDiscountData({
      min_units: d.min_units,
      max_units: d.max_units,
      discount_percentage: d.discount_percentage,
      suggested_price_multiplier: d.suggested_price_multiplier || 2.8
    });
  };

  const handleCancelEditDiscount = () => {
    setEditingDiscountId(null);
  };

  const handleSaveEditDiscount = async (id) => {
    const min = parseInt(editDiscountData.min_units, 10);
    const max = parseInt(editDiscountData.max_units, 10);
    const disc = parseFloat(editDiscountData.discount_percentage);
    const mult = parseFloat(editDiscountData.suggested_price_multiplier);

    if (isNaN(min) || min < 1) {
      toast.error('El rango mínimo debe ser al menos 1 unidad.');
      return;
    }
    if (isNaN(max) || max < min) {
      toast.error('El rango máximo debe ser mayor o igual al rango mínimo.');
      return;
    }
    if (isNaN(disc) || disc < 0 || disc > 100) {
      toast.error('El porcentaje de descuento debe estar entre 0% y 100%.');
      return;
    }

    try {
      await configService.updateDiscount(id, {
        min_units: min,
        max_units: max,
        discount_percentage: disc,
        suggested_price_multiplier: isNaN(mult) ? 2.8 : mult
      });
      toast.success('Escala de descuento actualizada con éxito');
      setEditingDiscountId(null);
      loadConfigData();
    } catch (err) {
      toast.error('Error al actualizar escala de descuento');
    }
  };

  const handleDeleteDiscount = async (id, min, max) => {
    if (!window.confirm(`¿Estás seguro de eliminar la escala de descuento (${min} - ${max} und)?`)) {
      return;
    }
    try {
      await configService.deleteDiscount(id);
      toast.success('Escala de descuento eliminada');
      loadConfigData();
    } catch (err) {
      toast.error('Error al eliminar escala de descuento');
    }
  };

  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    const min = parseInt(newDiscountData.min_units, 10);
    const max = parseInt(newDiscountData.max_units, 10);
    const disc = parseFloat(newDiscountData.discount_percentage);
    const mult = parseFloat(newDiscountData.suggested_price_multiplier);

    if (isNaN(min) || min < 1) {
      toast.error('El rango mínimo debe ser al menos 1 unidad.');
      return;
    }
    if (isNaN(max) || max < min) {
      toast.error('El rango máximo debe ser mayor o igual al rango mínimo.');
      return;
    }
    if (isNaN(disc) || disc < 0 || disc > 100) {
      toast.error('El porcentaje de descuento debe estar entre 0% y 100%.');
      return;
    }

    try {
      await configService.createDiscount({
        min_units: min,
        max_units: max,
        discount_percentage: disc,
        suggested_price_multiplier: isNaN(mult) ? 2.8 : mult
      });
      toast.success('Nueva escala de descuento creada con éxito');
      setShowAddDiscountModal(false);
      setNewDiscountData({ min_units: 1, max_units: 5, discount_percentage: 0, suggested_price_multiplier: 2.8 });
      loadConfigData();
    } catch (err) {
      toast.error('Error al crear escala de descuento');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Respaldo */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-4 rounded-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
          <div>
            <h3 className="text-xs font-semibold text-[#EAEAEA]">Copia de Seguridad SQLite</h3>
            <p className="text-[11px] text-[#A0A0A0]">Descargar instantánea respaldada de `prisma_lab.db`</p>
          </div>
        </div>

        <button
          onClick={handleDownloadBackup}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-sm text-xs flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> Descargar Backup
        </button>
      </div>

      {/* Parámetros Operativos */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#EAEAEA]">Parámetros Operativos Globales</h3>
            <p className="text-[11px] text-[#A0A0A0]">Valores para los algoritmos de la Calculadora 3D</p>
          </div>
          <button
            onClick={loadConfigData}
            className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#101010] border border-[#2A2A2A] rounded-sm text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-[#A0A0A0]">Cargando...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map((cfg) => (
              <div key={cfg.id} className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <label className="font-medium text-[#EAEAEA]">{cfg.description || cfg.key}</label>
                  <span className="text-[10px] text-[#666666] font-mono">{cfg.unit}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={cfg.value}
                    onChange={(e) => handleConfigChange(cfg.key, e.target.value)}
                    className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-[#EAEAEA] px-2.5 py-1 rounded-sm font-mono focus:border-slate-500"
                  />
                  <button
                    onClick={() => handleSave(cfg)}
                    disabled={saving}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-sm text-xs transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Descuentos por Volumen (EDITABLE) */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2A2A2A] pb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#EAEAEA]">Escala de Descuentos por Volumen (Editable)</h3>
            <p className="text-[11px] text-[#A0A0A0]">Define rangos de piezas, descuentos y márgenes comerciales</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar escala..."
                value={discountSearch}
                onChange={(e) => setDiscountSearch(e.target.value)}
                className="bg-[#101010] border border-[#2A2A2A] text-xs text-[#EAEAEA] pl-8 pr-7 py-1 rounded-sm focus:outline-none focus:border-slate-500 w-36 sm:w-44"
              />
              {discountSearch && (
                <button
                  onClick={() => setDiscountSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowAddDiscountModal(true)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva Escala
            </button>
          </div>
        </div>

        {(() => {
          const q = discountSearch.toLowerCase().trim();
          const filteredDiscounts = discounts.filter((d) => {
            if (!q) return true;
            return (
              String(d.min_units).includes(q) ||
              String(d.max_units).includes(q) ||
              String(d.discount_percentage).includes(q) ||
              String(d.suggested_price_multiplier).includes(q)
            );
          });

          return (
            <div className="space-y-2">
              <div className="text-[10px] text-[#A0A0A0] px-0.5 flex justify-between items-center">
                <span>
                  Mostrando <strong className="text-[#EAEAEA]">{filteredDiscounts.length}</strong> de <strong className="text-[#EAEAEA]">{discounts.length}</strong> escalas de descuento
                </span>
                {editingDiscountId && (
                  <span className="text-amber-400 text-[10px] animate-pulse">Editando fila seleccionada...</span>
                )}
              </div>
              <div className="overflow-x-auto border border-[#2A2A2A] rounded-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                      <th className="py-2 px-3 font-semibold">Rango Mín (Und)</th>
                      <th className="py-2 px-3 font-semibold">Rango Máx (Und)</th>
                      <th className="py-2 px-3 font-semibold">Descuento (%)</th>
                      <th className="py-2 px-3 font-semibold">Multiplicador Precio</th>
                      <th className="py-2 px-3 font-semibold text-center w-24">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2A2A]/50">
                    {filteredDiscounts.length > 0 ? (
                      filteredDiscounts.map((d) => {
                        const isEditing = editingDiscountId === d.id;

                        if (isEditing) {
                          return (
                            <tr key={d.id} className="bg-[#222222]">
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min="1"
                                  value={editDiscountData.min_units}
                                  onChange={(e) => setEditDiscountData({ ...editDiscountData, min_units: e.target.value })}
                                  className="w-20 bg-[#101010] border border-[#2A2A2A] text-xs text-[#EAEAEA] px-2 py-0.5 rounded-sm font-mono focus:border-slate-500"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min="1"
                                  value={editDiscountData.max_units}
                                  onChange={(e) => setEditDiscountData({ ...editDiscountData, max_units: e.target.value })}
                                  className="w-20 bg-[#101010] border border-[#2A2A2A] text-xs text-[#EAEAEA] px-2 py-0.5 rounded-sm font-mono focus:border-slate-500"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    value={editDiscountData.discount_percentage}
                                    onChange={(e) => setEditDiscountData({ ...editDiscountData, discount_percentage: e.target.value })}
                                    className="w-20 bg-[#101010] border border-[#2A2A2A] text-xs text-emerald-400 font-semibold px-2 py-0.5 rounded-sm font-mono focus:border-slate-500"
                                  />
                                  <span className="text-[#A0A0A0]">%</span>
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.05"
                                    min="1"
                                    value={editDiscountData.suggested_price_multiplier}
                                    onChange={(e) => setEditDiscountData({ ...editDiscountData, suggested_price_multiplier: e.target.value })}
                                    className="w-20 bg-[#101010] border border-[#2A2A2A] text-xs text-slate-300 px-2 py-0.5 rounded-sm font-mono focus:border-slate-500"
                                  />
                                  <span className="text-[#A0A0A0]">x</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleSaveEditDiscount(d.id)}
                                    title="Guardar cambios"
                                    className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={handleCancelEditDiscount}
                                    title="Cancelar edición"
                                    className="p-1 bg-zinc-800 hover:bg-zinc-700 text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={d.id} className="hover:bg-[#222222] transition-colors">
                            <td className="py-2 px-3 font-mono text-[#EAEAEA]">{d.min_units} und</td>
                            <td className="py-2 px-3 font-mono text-[#EAEAEA]">{d.max_units} und</td>
                            <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">{d.discount_percentage}%</td>
                            <td className="py-2 px-3 font-mono text-slate-300">{d.suggested_price_multiplier}x</td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleStartEditDiscount(d)}
                                  title="Editar escala"
                                  className="p-1 bg-[#101010] hover:bg-[#252525] text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm border border-[#2A2A2A] transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDiscount(d.id, d.min_units, d.max_units)}
                                  title="Eliminar escala"
                                  className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-sm border border-rose-500/20 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" className="py-4 text-center text-[#A0A0A0] text-xs">
                          No se encontraron escalas con los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>

      {/* MODAL NUEVA ESCALA DE DESCUENTO */}
      {showAddDiscountModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCreateDiscount} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-md space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Nueva Escala de Descuento por Volumen</h3>
              </div>
              <button type="button" onClick={() => setShowAddDiscountModal(false)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Rango Mínimo (Und)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newDiscountData.min_units}
                  onChange={(e) => setNewDiscountData({ ...newDiscountData, min_units: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Rango Máximo (Und)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newDiscountData.max_units}
                  onChange={(e) => setNewDiscountData({ ...newDiscountData, max_units: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Descuento (%)</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  min="0"
                  max="100"
                  value={newDiscountData.discount_percentage}
                  onChange={(e) => setNewDiscountData({ ...newDiscountData, discount_percentage: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-emerald-400 font-semibold px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Multiplicador Precio (x)</label>
                <input
                  type="number"
                  step="0.05"
                  required
                  min="1"
                  value={newDiscountData.suggested_price_multiplier}
                  onChange={(e) => setNewDiscountData({ ...newDiscountData, suggested_price_multiplier: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-slate-200 px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setShowAddDiscountModal(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm transition-colors"
              >
                Guardar Escala
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
