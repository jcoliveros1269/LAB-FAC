import React, { useState, useEffect } from 'react';
import { Calculator, History, RefreshCw, Layers, FileText, Trash2, Edit3, X, Save, Plus, Search, Filter, Percent, Zap, TrendingDown, Wrench, Box, RotateCcw, Package } from 'lucide-react';
import { toast } from 'sonner';
import { productionService, inventoryService, salesService } from '../services/api';
import DateRangeFilter, { isDateInRange, formatDate } from '../components/DateRangeFilter';
import { useAuth } from '../context/AuthContext';

export default function Production({ setActiveTab }) {
  const { canDelete, canEdit, isReadOnly } = useAuth();
  const [activeSubtab, setActiveSubtab] = useState(() => {
    return localStorage.getItem('prisma_lab_subtab_production') || 'calculator';
  });

  useEffect(() => {
    localStorage.setItem('prisma_lab_subtab_production', activeSubtab);
  }, [activeSubtab]);

  const [materials, setMaterials] = useState([]);
  const [history, setHistory] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(false);

  // Persistencia de resultado de cálculo
  const [calcResult, setCalcResult] = useState(() => {
    try {
      const saved = localStorage.getItem('prisma_lab_draft_calc_result');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    try {
      if (calcResult) {
        localStorage.setItem('prisma_lab_draft_calc_result', JSON.stringify(calcResult));
      } else {
        localStorage.removeItem('prisma_lab_draft_calc_result');
      }
    } catch (e) {}
  }, [calcResult]);

  // Filtros y Búsqueda para el Histórico
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Modal Edición
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({
    project_code: '',
    project_name: '',
    quantity: 1,
    print_hours: 1.0
  });

  const DEFAULT_PROD_FORM = {
    project_code: '',
    project_name: '',
    quantity: 1,
    print_hours: 1.0,
    filaments: [
      { id: 1, material_id: '', article_code: '', type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
    ],
    discount_percentage: 0.0,
    discount_amount: 0.0,
    additional_expenses: 0.0,
    deduct_from_inventory: false
  };

  // Formulario de Calculadora 3D con persistencia en localStorage
  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem('prisma_lab_draft_calc_form');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_PROD_FORM, ...parsed };
      }
    } catch (e) {
      console.error('Error cargando borrador de producción:', e);
    }
    return DEFAULT_PROD_FORM;
  });

  useEffect(() => {
    try {
      localStorage.setItem('prisma_lab_draft_calc_form', JSON.stringify(formData));
    } catch (e) {}
  }, [formData]);

  // Obtener tipos únicos de filamento desde el inventario
  const filamentTypes = React.useMemo(() => {
    const rawTypes = materials.map(m => m.material_type ? m.material_type.toUpperCase() : '').filter(Boolean);
    const standard = ['PETG', 'PLA', 'TPU', 'ABS', 'ASA'];
    return Array.from(new Set([...standard, ...rawTypes]));
  }, [materials]);

  // Obtener colores y precios disponibles según el tipo seleccionado
  const getColorsForType = (type) => {
    if (!type) return [];
    const mats = materials.filter(m => m.material_type && m.material_type.toUpperCase() === type.toUpperCase());
    const map = new Map();
    mats.forEach(m => {
      if (m.color && !map.has(m.color.trim())) {
        map.set(m.color.trim(), {
          color: m.color.trim(),
          cost_per_g: m.cost_per_g,
          current_stock_g: m.current_stock_g
        });
      }
    });
    return Array.from(map.values());
  };

  // Obtener costo por gramo de un filamento específico (o por bobina seleccionada en inventario)
  const getFilamentCost = (type, color, materialId = null) => {
    if (materialId) {
      const mat = materials.find(m => m.id === materialId || String(m.id) === String(materialId));
      if (mat && typeof mat.cost_per_g === 'number' && mat.cost_per_g > 0) {
        return mat.cost_per_g;
      }
    }
    if (!type) return 65.0;
    const mat = materials.find(m => 
      m.material_type && m.material_type.toUpperCase() === type.toUpperCase() &&
      m.color && (m.color.toLowerCase() === (color || '').toLowerCase() || m.color.toLowerCase().includes((color || '').toLowerCase()))
    );
    return mat ? mat.cost_per_g : 65.0;
  };

  const handleAddFilament = () => {
    const defaultType = 'PLA';
    const colors = getColorsForType(defaultType);
    const defaultColor = colors.length > 0 ? colors[0].color : 'Negro';
    setFormData(prev => ({
      ...prev,
      filaments: [
        ...prev.filaments,
        { id: Date.now(), material_id: '', article_code: '', type: defaultType, color: defaultColor, grams: 0.0, isCustomColor: false }
      ]
    }));
  };

  const handleRemoveFilament = (id) => {
    if (formData.filaments.length <= 1) {
      toast.warning('Debe haber al menos un filamento en el cálculo');
      return;
    }
    setFormData(prev => ({
      ...prev,
      filaments: prev.filaments.filter(f => f.id !== id)
    }));
  };

  // Asignar bobina específica de inventario en calculadora de producción
  const handleSelectMaterialSpool = (filId, matId) => {
    if (!matId) {
      setFormData(prev => ({
        ...prev,
        filaments: prev.filaments.map(f => f.id === filId ? {
          ...f,
          material_id: '',
          article_code: ''
        } : f)
      }));
      return;
    }

    const selectedMat = materials.find(m => String(m.id) === String(matId));
    if (!selectedMat) return;

    setFormData(prev => ({
      ...prev,
      filaments: prev.filaments.map(f => f.id === filId ? {
        ...f,
        material_id: selectedMat.id,
        article_code: selectedMat.article_code || '',
        type: selectedMat.material_type || f.type,
        color: selectedMat.color || f.color,
        isCustomColor: false
      } : f)
    }));
  };

  const handleFilamentTypeChange = (id, newType) => {
    const colors = getColorsForType(newType);
    const firstColor = colors.length > 0 ? colors[0].color : 'Blanco';
    setFormData(prev => ({
      ...prev,
      filaments: prev.filaments.map(f => f.id === id ? { 
        ...f, 
        material_id: '',
        article_code: '',
        type: newType, 
        color: firstColor,
        isCustomColor: false
      } : f)
    }));
  };

  const handleFilamentChange = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      filaments: prev.filaments.map(f => f.id === id ? { ...f, [field]: value } : f)
    }));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [matsRes, histRes, nextCodeRes, suppliesRes] = await Promise.all([
        inventoryService.getMaterials(),
        productionService.getHistory(),
        productionService.getNextCode().catch(() => ({ data: { next_code: '1' } })),
        inventoryService.getAdditionalSupplies().catch(() => ({ data: [] }))
      ]);
      setMaterials(matsRes.data || []);
      setHistory(histRes.data || []);
      setSupplies(suppliesRes.data || []);

      if (nextCodeRes.data && nextCodeRes.data.next_code) {
        setFormData(prev => ({
          ...prev,
          project_code: nextCodeRes.data.next_code
        }));
      }
    } catch (err) {
      console.error('Error cargando datos de producción:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCalculate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validFilaments = (formData.filaments || []).map(f => ({
        filament_type: f.type,
        color: f.color,
        grams: parseFloat(f.grams) || 0.0
      }));

      const payload = {
        project_code: formData.project_code,
        project_name: formData.project_name,
        quantity: parseInt(formData.quantity, 10) || 1,
        print_hours: parseFloat(formData.print_hours) || 1.0,
        additional_expenses: parseFloat(formData.additional_expenses) || 0.0,
        discount_percentage: parseFloat(formData.discount_percentage) || 0.0,
        discount_amount: parseFloat(formData.discount_amount) || 0.0,
        deduct_from_inventory: formData.deduct_from_inventory,
        filaments: validFilaments,
        filament1_type: validFilaments[0]?.filament_type || 'PETG',
        filament1_color: validFilaments[0]?.color || 'Blanco',
        filament1_grams: validFilaments[0]?.grams || 0.0,
        filament2_type: validFilaments[1]?.filament_type || '',
        filament2_color: validFilaments[1]?.color || '',
        filament2_grams: validFilaments[1]?.grams || 0.0,
        filament3_type: validFilaments[2]?.filament_type || '',
        filament3_color: validFilaments[2]?.color || '',
        filament3_grams: validFilaments[2]?.grams || 0.0,
        filament4_type: validFilaments[3]?.filament_type || '',
        filament4_color: validFilaments[3]?.color || '',
        filament4_grams: validFilaments[3]?.grams || 0.0,
      };
      const res = await productionService.calculate(payload);
      setCalcResult(res.data);
      toast.success(`Proyecto ${res.data.project_code} calculado exitosamente`);
      loadData();
    } catch (err) {
      console.error('Error al calcular impresión:', err);
      toast.error('Error calculando costos.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistoryItem = async (id, code) => {
    if (!window.confirm(`¿Estás seguro de eliminar el registro de proyecto ${code}?`)) return;
    try {
      await productionService.deleteCalculation(id);
      toast.success(`Proyecto ${code} eliminado del histórico`);
      loadData();
    } catch (err) {
      toast.error('Error eliminando proyecto del histórico.');
    }
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setEditFormData({
      project_code: item.project_code,
      project_name: item.project_name,
      quantity: item.quantity,
      print_hours: item.print_hours
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await productionService.updateCalculation(editingItem.id, editFormData);
      toast.success(`Proyecto ${editFormData.project_code} actualizado`);
      setEditingItem(null);
      loadData();
    } catch (err) {
      toast.error('Error actualizando registro.');
    }
  };

  const handleConvertToQuote = async () => {
    if (!calcResult) return;
    try {
      const filamentDesc = (formData.filaments || [])
        .filter(f => parseFloat(f.grams) > 0)
        .map(f => `${f.type} ${f.color} (${f.grams}g)`)
        .join(' + ');

      const qty = parseInt(calcResult.quantity, 10) || 1;
      const totalPrice = calcResult.sale_price_override && calcResult.sale_price_override > 0
        ? calcResult.sale_price_override
        : calcResult.suggested_price_margin;
      const discountVal = parseFloat(calcResult.discount_amount) || 0.0;
      const subtotalVal = totalPrice + discountVal;
      const unitPrice = subtotalVal / qty;
      const unitCost = calcResult.total_unit_cost / qty;
      const unitGrams = parseFloat(((calcResult.total_grams || 0) / qty).toFixed(2));
      const unitHours = parseFloat(((calcResult.print_hours || 0) / qty).toFixed(2));

      const docPayload = {
        doc_number: `COT-${calcResult.project_code}`,
        doc_type: 'COTIZACION',
        subtotal: subtotalVal,
        discount: discountVal,
        tax: 0.0,
        total: totalPrice,
        status: 'QUOTED',
        items: [
          {
            product_name: `${calcResult.project_name} (${filamentDesc || calcResult.filament1_type || '3D'})`,
            quantity: qty,
            unit_grams: unitGrams,
            print_hours: unitHours,
            unit_cost: unitCost,
            unit_price: unitPrice,
            total_price: subtotalVal
          }
        ]
      };

      await salesService.createDocument(docPayload);
      toast.success(`Cotización COT-${calcResult.project_code} creada`);
      if (setActiveTab) setActiveTab('sales');
    } catch (err) {
      console.error('Error al crear cotización:', err);
      toast.error('Error creando cotización.');
    }
  };

  const filteredHistory = history.filter((row) => {
    const q = historySearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (row.project_code && row.project_code.toLowerCase().includes(q)) ||
      (row.project_name && row.project_name.toLowerCase().includes(q)) ||
      (row.filament1_type && row.filament1_type.toLowerCase().includes(q)) ||
      (row.filament1_color && row.filament1_color.toLowerCase().includes(q)) ||
      (row.filament2_type && row.filament2_type.toLowerCase().includes(q)) ||
      (row.filament2_color && row.filament2_color.toLowerCase().includes(q));

    const matchesType =
      historyTypeFilter === 'ALL' ||
      (row.filament1_type && row.filament1_type.toUpperCase() === historyTypeFilter) ||
      (row.filament2_type && row.filament2_type.toUpperCase() === historyTypeFilter) ||
      (row.filament3_type && row.filament3_type.toUpperCase() === historyTypeFilter) ||
      (row.filament4_type && row.filament4_type.toUpperCase() === historyTypeFilter);

    const matchesDate = isDateInRange(row.created_at, historyStartDate, historyEndDate);

    return matchesSearch && matchesType && matchesDate;
  });

  const resetFormData = () => {
    setFormData({
      project_code: '',
      project_name: '',
      quantity: 1,
      print_hours: 1.0,
      filaments: [
        { id: Date.now(), type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
      ],
      discount_percentage: 0.0,
      discount_amount: 0.0,
      additional_expenses: 0.0,
      deduct_from_inventory: false
    });
    setCalcResult(null);
    try {
      localStorage.removeItem('prisma_lab_draft_calc_form');
      localStorage.removeItem('prisma_lab_draft_calc_result');
    } catch (e) {}
    toast.info('Formulario de cálculo limpiado');
    loadData();
  };

  return (
    <div className="space-y-4">
      {/* Subtabs */}
      <div className="flex items-center gap-1 bg-[#101010] p-1 rounded-sm border border-[#2A2A2A] w-fit">
        <button
          onClick={() => setActiveSubtab('calculator')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${activeSubtab === 'calculator'
            ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
            : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
        >
          <Calculator className="w-3.5 h-3.5" strokeWidth={1.5} /> Calculadora 3D
        </button>
        <button
          onClick={() => setActiveSubtab('history')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${activeSubtab === 'history'
            ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
            : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
        >
          <History className="w-3.5 h-3.5" strokeWidth={1.5} /> Histórico ({history.length})
        </button>
      </div>

      {/* CALCULADORA */}
      {activeSubtab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <form onSubmit={handleCalculate} className="lg:col-span-7 bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
              <h3 className="font-semibold text-[#EAEAEA]">Parámetros del Proyecto de Impresión</h3>
              <button
                type="button"
                onClick={resetFormData}
                className="text-[11px] text-[#A0A0A0] hover:text-[#EAEAEA] flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> Limpiar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1 flex items-center justify-between">
                  <span>Código Proyecto</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-normal">Automático</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.project_code}
                  className="w-full bg-[#101010]/60 border border-[#2A2A2A] text-emerald-400 opacity-90 cursor-not-allowed px-3 py-1.5 rounded-sm font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Nombre Pieza / Proyecto</label>
                <input
                  type="text"
                  required
                  placeholder="SOPORTE SUPERIOR AMS LITE"
                  value={formData.project_name}
                  onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Cantidad Unidades</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  onBlur={() => {
                    const parsed = parseInt(formData.quantity, 10);
                    if (isNaN(parsed) || parsed < 1) {
                      setFormData({ ...formData, quantity: 1 });
                    } else {
                      setFormData({ ...formData, quantity: parsed });
                    }
                  }}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Horas de Impresión Total</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={formData.print_hours}
                  onChange={(e) => setFormData({ ...formData, print_hours: e.target.value })}
                  onBlur={() => {
                    const parsed = parseFloat(formData.print_hours);
                    if (isNaN(parsed) || parsed <= 0) {
                      setFormData({ ...formData, print_hours: 1.0 });
                    } else {
                      setFormData({ ...formData, print_hours: parsed });
                    }
                  }}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>
            </div>

            {/* Filamentos Dinámicos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#A0A0A0]">Filamentos Utilizados</span>
                <button
                  type="button"
                  onClick={handleAddFilament}
                  className="px-2.5 py-1 bg-[#101010] hover:bg-[#222222] text-emerald-400 border border-[#2A2A2A] rounded-sm text-[11px] font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Filamento
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(formData.filaments || []).map((fil, idx) => {
                  const selectedMat = fil.material_id ? materials.find(m => String(m.id) === String(fil.material_id)) : null;
                  const colorsForType = getColorsForType(fil.type);
                  const unitCost = getFilamentCost(fil.type, fil.color, fil.material_id);
                  const subtotalCost = unitCost * (parseFloat(fil.grams) || 0);
                  const neededGrams = (parseFloat(fil.grams) || 0) * (parseInt(formData.quantity, 10) || 1);
                  const availStock = selectedMat ? (selectedMat.current_stock_g || 0) : null;

                  return (
                    <div key={fil.id || idx} className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-semibold text-slate-300">
                            Filamento {idx + 1}
                          </span>
                          {fil.article_code && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-700/60 text-blue-300 font-mono font-semibold" title="Código de Artículo">
                              {fil.article_code}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-emerald-400 font-mono font-medium">
                            ${unitCost.toFixed(2)}/g
                          </span>
                          {selectedMat && (
                            availStock >= neededGrams && availStock > 0 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/60 text-emerald-400 font-mono font-medium" title={`Stock disponible: ${availStock.toLocaleString()}g (Requerido: ${neededGrams.toFixed(1)}g)`}>
                                ✓ {availStock.toLocaleString()}g disp.
                              </span>
                            ) : availStock > 0 ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-700/60 text-amber-300 font-mono font-medium" title={`Stock insuficiente: disponible ${availStock.toLocaleString()}g, faltan ${(neededGrams - availStock).toFixed(1)}g`}>
                                ⚠ {availStock.toLocaleString()}g disp.
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-700/60 text-rose-400 font-mono font-medium" title="Bobina agotada (0g)">
                                ✗ Agotado (0g)
                              </span>
                            )
                          )}
                        </div>
                        {formData.filaments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFilament(fil.id)}
                            className="text-[#666666] hover:text-rose-400 p-0.5 transition-colors"
                            title="Eliminar filamento"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Selector de Bobina de Inventario por Disponibilidad */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-[#A0A0A0] flex items-center gap-1 font-medium">
                            <Package className="w-3 h-3 text-blue-400" />
                            Bobina de Inventario (según orden y disponibilidad)
                          </label>
                          {fil.material_id && (
                            <button
                              type="button"
                              onClick={() => handleSelectMaterialSpool(fil.id, '')}
                              className="text-[9px] text-slate-400 hover:text-rose-400 underline"
                              title="Desvincular bobina y usar selección manual"
                            >
                              Desvincular
                            </button>
                          )}
                        </div>
                        <select
                          value={fil.material_id || ''}
                          onChange={(e) => handleSelectMaterialSpool(fil.id, e.target.value)}
                          className="w-full bg-[#151515] border border-[#303030] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-blue-500 text-[11px] font-mono"
                        >
                          <option value="">-- Seleccionar de inventario (o configurar manual abajo) --</option>
                          {materials.map((m) => {
                            const stock = m.current_stock_g || 0;
                            const code = m.article_code ? `[${m.article_code}] ` : '';
                            const stockStatus = stock > 0 ? `${stock}g disp.` : 'AGOTADO (0g)';
                            return (
                              <option key={m.id} value={m.id}>
                                {code}{m.name} ({m.material_type} {m.color}) — {stockStatus} (${m.cost_per_g?.toFixed(2)}/g)
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#666666]">Tipo</label>
                          <select
                            value={fil.type}
                            onChange={(e) => handleFilamentTypeChange(fil.id, e.target.value)}
                            className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-slate-500"
                          >
                            {filamentTypes.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] text-[#666666]">Color</label>
                            {colorsForType.length > 0 && !fil.material_id && (
                              <button
                                type="button"
                                onClick={() => handleFilamentChange(fil.id, 'isCustomColor', !fil.isCustomColor)}
                                className="text-[9px] text-slate-400 hover:text-emerald-400 underline"
                              >
                                {fil.isCustomColor ? 'Lista' : 'Otro'}
                              </button>
                            )}
                          </div>

                          {fil.isCustomColor || (colorsForType.length === 0 && !fil.material_id) ? (
                            <input
                              type="text"
                              placeholder="Color..."
                              value={fil.color}
                              onChange={(e) => handleFilamentChange(fil.id, 'color', e.target.value)}
                              className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-slate-500"
                            />
                          ) : (
                            <select
                              value={fil.color}
                              onChange={(e) => handleFilamentChange(fil.id, 'color', e.target.value)}
                              className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-slate-500"
                            >
                              {fil.material_id && !colorsForType.some(c => c.color === fil.color) && (
                                <option value={fil.color}>{fil.color}</option>
                              )}
                              {colorsForType.map((c, i) => (
                                <option key={i} value={c.color}>
                                  {c.color} (${c.cost_per_g.toFixed(2)}/g)
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#666666]">Gramos (g)</label>
                          <input
                            type="number"
                            step="any"
                            value={fil.grams}
                            onChange={(e) => handleFilamentChange(fil.id, 'grams', e.target.value)}
                            onBlur={() => {
                              const parsed = parseFloat(fil.grams);
                              if (isNaN(parsed) || parsed < 0) handleFilamentChange(fil.id, 'grams', 0.0);
                              else handleFilamentChange(fil.id, 'grams', parsed);
                            }}
                            className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm font-mono focus:border-slate-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#777777] pt-1 border-t border-[#1F1F1F]">
                        <span>Costo estimado material:</span>
                        <span className="font-mono font-medium text-[#EAEAEA]">
                          ${subtotalCost.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
                          {parseInt(formData.quantity, 10) > 1 && (
                            <span className="text-[9px] text-slate-400 ml-1">
                              ({fil.grams}g × {formData.quantity} unds)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Descuentos y Gastos Adicionales */}
            <div className="bg-[#101010] p-3.5 rounded-sm border border-[#2A2A2A] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[#EAEAEA] flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-400" /> Descuentos y Gastos Adicionales
                </label>
                {formData.quantity > 1 && (
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    Escala Volumen: {formData.quantity} uds
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Descuento (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      placeholder="0"
                      value={formData.discount_percentage || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData({ ...formData, discount_percentage: val, discount_amount: 0 });
                      }}
                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] pl-2 pr-6 py-1.5 rounded-sm font-mono focus:border-slate-500 text-xs"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666666] text-xs font-mono">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Descuento ($ COP)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={formData.discount_amount || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData({ ...formData, discount_amount: val, discount_percentage: 0 });
                      }}
                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] pl-5 pr-2 py-1.5 rounded-sm font-mono focus:border-slate-500 text-xs"
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#666666] text-xs font-mono">$</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Gastos Extra ($ COP)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Empaque, tornillería..."
                      value={formData.additional_expenses || ''}
                      onChange={(e) => setFormData({ ...formData, additional_expenses: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] pl-5 pr-2 py-1.5 rounded-sm font-mono focus:border-slate-500 text-xs"
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#666666] text-xs font-mono">$</span>
                  </div>
                </div>
              </div>

              {/* Botones de Descuento Rápido */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#1F1F1F]">
                <span className="text-[10px] text-[#666666]">Acceso rápido:</span>
                {[0, 5, 10, 15, 20, 25].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setFormData({ ...formData, discount_percentage: pct, discount_amount: 0 })}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      formData.discount_percentage === pct && formData.discount_amount === 0
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'bg-[#1A1A1A] text-[#A0A0A0] border border-[#2A2A2A] hover:text-[#EAEAEA]'
                    }`}
                  >
                    {pct === 0 ? 'Sin desc.' : `${pct}%`}
                  </button>
                ))}
              </div>

              {/* Selector Insumos de Papelería / Mantenimiento */}
              {supplies.length > 0 && (
                <div className="space-y-1.5 pt-1.5 border-t border-[#1F1F1F]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#A0A0A0] font-medium flex items-center gap-1">
                      <Wrench className="w-3 h-3 text-amber-400" />
                      Añadir Costos de Papelería / Mantenimiento:
                    </span>
                    <span className="text-[10px] text-[#666666]">
                      Gastos Extra: ${(formData.additional_expenses || 0).toLocaleString('es-CO')} COP
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {supplies.map((sup) => {
                      const cost = sup.unit_cost_cop || 0;
                      return (
                        <button
                          key={sup.id}
                          type="button"
                          onClick={() => {
                            const current = parseFloat(formData.additional_expenses) || 0;
                            setFormData(prev => ({
                              ...prev,
                              additional_expenses: parseFloat((current + cost).toFixed(2))
                            }));
                            toast.success(`+ $${cost.toLocaleString('es-CO')} COP (${sup.name})`);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border flex items-center gap-1 transition-colors ${
                            sup.item_type === 'PAPELERIA'
                              ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                          }`}
                          title={`${sup.name} - $${cost.toLocaleString('es-CO')} COP`}
                        >
                          <span>+ {sup.name.length > 22 ? sup.name.substring(0, 22) + '...' : sup.name}</span>
                          <span className="font-mono font-semibold">(${cost.toLocaleString('es-CO')})</span>
                        </button>
                      );
                    })}
                    {formData.additional_expenses > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, additional_expenses: 0 }))}
                        className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[#A0A0A0]">
              <input
                type="checkbox"
                id="deductStock"
                checked={formData.deduct_from_inventory}
                onChange={(e) => setFormData({ ...formData, deduct_from_inventory: e.target.checked })}
                className="rounded border-[#2A2A2A] bg-[#101010]"
              />
              <label htmlFor="deductStock" className="cursor-pointer">
                Descontar gramos consumidos del inventario
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-sm flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Calculator className="w-3.5 h-3.5" strokeWidth={1.5} />}
              <span>Calcular Costos</span>
            </button>
          </form>

          {/* Resultado */}
          <div className="lg:col-span-5 bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm flex flex-col justify-between text-xs">
            <div>
              <h3 className="font-semibold text-[#EAEAEA] mb-3">Desglose de Costos</h3>

              {!calcResult ? (
                <div className="py-12 text-center text-[#666666]">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" strokeWidth={1.5} />
                  <p>Ingresa parámetros y haz clic en Calcular.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#A0A0A0]">Material ({calcResult.total_grams}g):</span>
                      <span className="text-[#EAEAEA]">${calcResult.material_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#A0A0A0] flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" /> Energía ({calcResult.print_hours}h):
                      </span>
                      <span className="text-amber-400 font-semibold">${calcResult.energy_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#A0A0A0] flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-slate-400" /> Depreciación:
                      </span>
                      <span className="text-slate-300 font-semibold">${calcResult.depreciation_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#A0A0A0]">Mano de Obra:</span>
                      <span className="text-[#EAEAEA]">${calcResult.labor_cost.toFixed(2)}</span>
                    </div>
                    {calcResult.additional_expenses > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#A0A0A0]">Gastos Extras:</span>
                        <span className="text-[#EAEAEA]">${calcResult.additional_expenses.toFixed(2)}</span>
                      </div>
                    )}
                    {(calcResult.discount_percentage > 0 || calcResult.discount_amount > 0) && (
                      <div className="flex justify-between text-amber-400 pt-1 border-t border-[#1F1F1F]">
                        <span className="flex items-center gap-1">
                          <Percent className="w-3 h-3 text-amber-400" /> Descuento ({calcResult.discount_percentage || 0}%):
                        </span>
                        <span className="font-bold">
                          -${(calcResult.discount_amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2">
                    <div>
                      <span className="text-[10px] text-[#A0A0A0] uppercase font-medium">
                        Costo Total Producción {calcResult.quantity > 1 ? `(${calcResult.quantity} und)` : ''}
                      </span>
                      <p className="text-xl font-bold text-[#EAEAEA] font-mono">
                        ${calcResult.total_unit_cost.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                      </p>
                      {calcResult.quantity > 1 && (
                        <p className="text-[11px] text-[#888888] font-mono mt-0.5">
                          Costo Unitario: <span className="text-[#EAEAEA] font-semibold">${(calcResult.total_unit_cost / calcResult.quantity).toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP</span>
                        </p>
                      )}
                    </div>
                    <div className="pt-2 border-t border-[#2A2A2A]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-emerald-400 uppercase font-medium">
                          Precio Sugerido {calcResult.quantity > 1 ? `(${calcResult.quantity} und)` : ''}
                        </span>
                        {(calcResult.discount_percentage > 0 || calcResult.discount_amount > 0) && (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">
                            Desc. Aplicado
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-bold text-emerald-400 font-mono">
                        ${calcResult.suggested_price_margin.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                      </p>
                      {calcResult.quantity > 1 && (
                        <p className="text-[11px] text-emerald-500/80 font-mono mt-0.5">
                          Precio Unitario: <span className="text-emerald-400 font-semibold">${(calcResult.suggested_price_margin / calcResult.quantity).toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {calcResult && (
              <button
                onClick={handleConvertToQuote}
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-medium rounded-sm flex items-center justify-center gap-2 mt-4 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Convertir en Cotización</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* HISTÓRICO */}
      {activeSubtab === 'history' && (
        <div className="space-y-3">
          {/* Barra de Búsqueda y Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-sm border border-[#2A2A2A]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por código (#), nombre de pieza o filamento..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm pl-9 pr-8 py-1.5 text-xs text-[#EAEAEA] placeholder-[#666666] focus:outline-none focus:border-slate-500"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#666666]" />
                <select
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todos los Tipos</option>
                  <option value="PETG" className="bg-[#1A1A1A]">PETG</option>
                  <option value="PLA" className="bg-[#1A1A1A]">PLA</option>
                  <option value="TPU" className="bg-[#1A1A1A]">TPU</option>
                  <option value="ABS" className="bg-[#1A1A1A]">ABS</option>
                  <option value="ASA" className="bg-[#1A1A1A]">ASA</option>
                </select>
              </div>

              {/* Filtro de Fechas */}
              <DateRangeFilter
                startDate={historyStartDate}
                endDate={historyEndDate}
                onChange={({ startDate, endDate }) => {
                  setHistoryStartDate(startDate);
                  setHistoryEndDate(endDate);
                }}
              />

              {(historySearch || historyTypeFilter !== 'ALL' || historyStartDate || historyEndDate) && (
                <button
                  onClick={() => {
                    setHistorySearch('');
                    setHistoryTypeFilter('ALL');
                    setHistoryStartDate('');
                    setHistoryEndDate('');
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline whitespace-nowrap px-1"
                >
                  Limpiar Filtros
                </button>
              )}

              <button
                onClick={loadData}
                className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#101010] border border-[#2A2A2A] rounded-sm text-xs"
                title="Recargar histórico"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="text-[11px] text-[#A0A0A0] px-1 flex justify-between">
            <span>
              Mostrando <strong className="text-[#EAEAEA]">{filteredHistory.length}</strong> de <strong className="text-[#EAEAEA]">{history.length}</strong> proyectos calculados
            </span>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm overflow-hidden">
            <div className="overflow-hidden">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[10px]">
                    <th className="py-2 px-1.5 font-semibold">Código</th>
                    <th className="py-2 px-1.5 font-semibold">Fecha</th>
                    <th className="py-2 px-2 font-semibold">Proyecto</th>
                    <th className="py-2 px-1 font-semibold text-center">Cant</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Gramos</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Horas</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Mat.</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Energía</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Deprec.</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Desc.</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Costo Unit.</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Precio Venta</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]/50">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((row) => (
                      <tr key={row.id} className="hover:bg-[#222222] transition-colors">
                        <td className="py-1.5 px-1.5 font-mono font-semibold text-emerald-400">{row.project_code}</td>
                        <td className="py-1.5 px-1.5 text-[#A0A0A0] whitespace-nowrap font-mono text-[10px]">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="py-1.5 px-2 font-medium text-[#EAEAEA]">
                          <div className="break-words">{row.project_name}</div>
                          {(row.filament1_type || row.filament2_type) && (
                            <div className="text-[9px] text-[#777777] flex flex-wrap gap-1 mt-0.5">
                              {[
                                row.filament1_type && `${row.filament1_type}${row.filament1_color ? ` ${row.filament1_color}` : ''} (${row.filament1_grams}g)`,
                                row.filament2_type && `${row.filament2_type}${row.filament2_color ? ` ${row.filament2_color}` : ''} (${row.filament2_grams}g)`,
                                row.filament3_type && `${row.filament3_type}${row.filament3_color ? ` ${row.filament3_color}` : ''} (${row.filament3_grams}g)`,
                                row.filament4_type && `${row.filament4_type}${row.filament4_color ? ` ${row.filament4_color}` : ''} (${row.filament4_grams}g)`
                              ].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-1 text-center text-[#A0A0A0] font-semibold">{row.quantity}</td>
                        <td className="py-1.5 px-1.5 text-right text-[#A0A0A0] font-mono">{row.total_grams}g</td>
                        <td className="py-1.5 px-1.5 text-right text-[#666666] font-mono">{row.print_hours}h</td>
                        <td className="py-1.5 px-1.5 text-right text-[#A0A0A0] font-mono">${(row.material_cost || 0).toFixed(1)}</td>
                        <td className="py-1.5 px-1.5 text-right text-amber-400 font-mono font-medium">${(row.energy_cost || 0).toFixed(1)}</td>
                        <td className="py-1.5 px-1.5 text-right text-slate-300 font-mono font-medium">${(row.depreciation_cost || 0).toFixed(1)}</td>
                        <td className="py-1.5 px-1 text-center">
                          {row.discount_percentage > 0 || row.discount_amount > 0 ? (
                            <span className="px-1 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono font-semibold" title={row.discount_amount ? `-$${row.discount_amount.toLocaleString('es-CO')}` : ''}>
                              {row.discount_percentage ? `-${row.discount_percentage}%` : `-$${row.discount_amount.toLocaleString('es-CO')}`}
                            </span>
                          ) : (
                            <span className="text-[#555555] font-mono">-</span>
                          )}
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-[#EAEAEA] font-mono font-semibold">${(row.total_unit_cost || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                        <td className="py-1.5 px-1.5 text-right font-bold text-emerald-400 font-mono">${(row.suggested_price_margin || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                        <td className="py-1.5 px-1.5 text-center flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEditModal(row)}
                              title="Editar Registro"
                              className="p-1 bg-[#101010] hover:bg-[#222222] text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm border border-[#2A2A2A]"
                            >
                              <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteHistoryItem(row.id, row.project_code)}
                              title="Eliminar Registro"
                              className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-sm border border-rose-500/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="12" className="py-8 text-center text-[#A0A0A0] text-xs">
                        No se encontraron registros de producción con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>

              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edición de Registro del Histórico */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEdit} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-md space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
              <h3 className="font-semibold text-[#EAEAEA]">Editar Proyecto {editingItem.project_code}</h3>
              <button type="button" onClick={() => setEditingItem(null)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Código Secuencial</label>
              <input
                type="text"
                readOnly
                value={editFormData.project_code}
                className="w-full bg-[#101010]/60 border border-[#2A2A2A] text-emerald-400 opacity-90 cursor-not-allowed px-3 py-1.5 rounded-sm font-mono font-semibold"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Nombre del Proyecto</label>
              <input
                type="text"
                required
                value={editFormData.project_name}
                onChange={(e) => setEditFormData({ ...editFormData, project_name: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Cantidad Unidades</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editFormData.quantity}
                  onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                  onBlur={() => {
                    const parsed = parseInt(editFormData.quantity, 10);
                    if (isNaN(parsed) || parsed < 1) {
                      setEditFormData({ ...editFormData, quantity: 1 });
                    } else {
                      setEditFormData({ ...editFormData, quantity: parsed });
                    }
                  }}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Horas de Impresión</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={editFormData.print_hours}
                  onChange={(e) => setEditFormData({ ...editFormData, print_hours: e.target.value })}
                  onBlur={() => {
                    const parsed = parseFloat(editFormData.print_hours);
                    if (isNaN(parsed) || parsed <= 0) {
                      setEditFormData({ ...editFormData, print_hours: 1.0 });
                    } else {
                      setEditFormData({ ...editFormData, print_hours: parsed });
                    }
                  }}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-sm flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
