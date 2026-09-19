import React, { useState, useEffect } from 'react';
import { Package, Search, Plus, RefreshCw, Layers, X, DollarSign, TrendingDown, CheckCircle2, Edit3, Trash2, Save, FileText, Filter, Wrench, Tag, Box, Calendar, ShoppingCart, ShieldAlert, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryService, salesService } from '../services/api';
import DateRangeFilter, { isDateInRange, formatDate } from '../components/DateRangeFilter';
import { predictArticleCode } from '../utils/articleCodes';
import { useAuth } from '../context/AuthContext';

export default function Inventory() {
  const { canDelete, canEdit, isReadOnly } = useAuth();
  const [activeSubtab, setActiveSubtab] = useState(() => {
    const saved = localStorage.getItem('prisma_lab_subtab_inventory') || 'materials';
    return saved === 'products' ? 'vitrina' : saved;
  });

  useEffect(() => {
    localStorage.setItem('prisma_lab_subtab_inventory', activeSubtab);
  }, [activeSubtab]);

  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [productTypeFilter, setProductTypeFilter] = useState('ALL');
  const [productStockFilter, setProductStockFilter] = useState('ALL');
  const [productDestinationFilter, setProductDestinationFilter] = useState('ALL');
  const [supplyTypeFilter, setSupplyTypeFilter] = useState('ALL');
  const [materialStartDate, setMaterialStartDate] = useState('');
  const [materialEndDate, setMaterialEndDate] = useState('');

  // Estados para Modal Facturar Producto de Vitrina
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellProductData, setSellProductData] = useState(null);
  const [sellForm, setSellForm] = useState({
    quantity: 1,
    unit_price: 0,
    customer_id: '',
    notes: ''
  });
  const [sellingLoading, setSellingLoading] = useState(false);

  const getTodayYMD = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const normalizeDateInput = (val) => {
    if (!val) return getTodayYMD();
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m3 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m3) return `${m3[3]}-${m3[2].padStart(2, '0')}-${m3[1].padStart(2, '0')}`;
    const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (m2) return `${new Date().getFullYear()}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    if (s.includes('T')) return s.split('T')[0];
    return getTodayYMD();
  };

  const DEFAULT_NEW_MATERIAL = {
    article_code: '',
    name: '',
    color: 'Blanco',
    material_type: 'PETG',
    initial_stock_g: 1000,
    total_cost: 65000,
    cost_per_g: 65.0,
    min_stock_alert_g: 200,
    entry_date: getTodayYMD(),
    notes: ''
  };

  // Modal Nuevo Material (Filamento)
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState(() => {
    try {
      const saved = localStorage.getItem('prisma_lab_draft_new_material');
      if (saved) return { ...DEFAULT_NEW_MATERIAL, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_NEW_MATERIAL;
  });

  useEffect(() => {
    try {
      localStorage.setItem('prisma_lab_draft_new_material', JSON.stringify(newMaterial));
    } catch (e) {}
  }, [newMaterial]);

  // Modal Edición Material
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editMaterialData, setEditMaterialData] = useState(null);

  const DEFAULT_NEW_SUPPLY = {
    name: '',
    item_type: 'PAPELERIA',
    unit_cost_cop: 1500,
    stock_units: 50,
    entry_date: getTodayYMD(),
    notes: ''
  };

  // Modal Nuevo Insumo Papelería / Mantenimiento
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [newSupply, setNewSupply] = useState(() => {
    try {
      const saved = localStorage.getItem('prisma_lab_draft_new_supply');
      if (saved) return { ...DEFAULT_NEW_SUPPLY, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_NEW_SUPPLY;
  });

  useEffect(() => {
    try {
      localStorage.setItem('prisma_lab_draft_new_supply', JSON.stringify(newSupply));
    } catch (e) {}
  }, [newSupply]);

  // Modal Edición Insumo Papelería / Mantenimiento
  const [editingSupply, setEditingSupply] = useState(null);
  const [editSupplyData, setEditSupplyData] = useState(null);

  // Modal Nuevo Producto Terminado / Pieza de Taller
  const DEFAULT_NEW_PRODUCT = {
    name: '',
    serial: '',
    category: 'PRODUCTO_TERMINADO',
    material_type: 'PETG',
    color: 'Blanco',
    current_stock_units: 1,
    unit_cost_cop: 0,
    sale_price_with_margin: 0,
    status: 'DISPONIBLE',
    is_internal_use: false,
    entry_date: getTodayYMD(),
    notes: ''
  };
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState(DEFAULT_NEW_PRODUCT);

  // Modal para cambiar fecha de Producto Terminado / Pieza y sincronizar contabilidad
  const [editingProductDate, setEditingProductDate] = useState(null);
  const [newProductDateVal, setNewProductDateVal] = useState(getTodayYMD());

  const loadInventory = async () => {
    setLoading(true);
    try {
      const [matsRes, prodsRes, suppliesRes] = await Promise.all([
        inventoryService.getMaterials(),
        inventoryService.getProducts(),
        inventoryService.getAdditionalSupplies()
      ]);
      setMaterials(matsRes.data || []);
      setProducts(prodsRes.data || []);
      setSupplies(suppliesRes.data || []);
    } catch (err) {
      console.error('Error al cargar inventario:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // Manejo de cambios con cálculo automático para Nuevo Material
  const handleNewMaterialStockOrCostChange = (field, value) => {
    setNewMaterial(prev => {
      const updated = { ...prev, [field]: value };
      const stock = parseFloat(field === 'initial_stock_g' ? value : prev.initial_stock_g) || 0;
      
      if (field === 'total_cost') {
        const total = parseFloat(value) || 0;
        updated.cost_per_g = stock > 0 ? parseFloat((total / stock).toFixed(4)) : 0;
      } else if (field === 'initial_stock_g') {
        const total = parseFloat(prev.total_cost) || 0;
        updated.cost_per_g = stock > 0 ? parseFloat((total / stock).toFixed(4)) : 0;
      } else if (field === 'cost_per_g') {
        const perG = parseFloat(value) || 0;
        updated.total_cost = parseFloat((perG * stock).toFixed(2));
      }
      return updated;
    });
  };

  // Manejo de cambios con cálculo automático para Edición de Material
  const handleEditMaterialStockOrCostChange = (field, value) => {
    setEditMaterialData(prev => {
      const updated = { ...prev, [field]: value };
      const stock = parseFloat(field === 'initial_stock_g' ? value : prev.initial_stock_g) || 0;
      
      if (field === 'total_cost') {
        const total = parseFloat(value) || 0;
        updated.cost_per_g = stock > 0 ? parseFloat((total / stock).toFixed(4)) : 0;
      } else if (field === 'initial_stock_g') {
        const total = parseFloat(prev.total_cost) || 0;
        updated.cost_per_g = stock > 0 ? parseFloat((total / stock).toFixed(4)) : 0;
      } else if (field === 'cost_per_g') {
        const perG = parseFloat(value) || 0;
        updated.total_cost = parseFloat((perG * stock).toFixed(2));
      }
      return updated;
    });
  };

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    try {
      const stockInit = parseFloat(newMaterial.initial_stock_g) || 1000.0;
      const costG = parseFloat(newMaterial.cost_per_g) || 65.0;
      const finalDate = normalizeDateInput(newMaterial.entry_date);

      const payload = {
        article_code: newMaterial.article_code ? newMaterial.article_code.trim().toUpperCase() : undefined,
        name: newMaterial.name.trim(),
        color: newMaterial.color.trim(),
        material_type: newMaterial.material_type.trim(),
        initial_stock_g: stockInit,
        outgoing_stock_g: 0.0,
        current_stock_g: stockInit,
        cost_per_g: costG,
        min_stock_alert_g: parseFloat(newMaterial.min_stock_alert_g) || 200.0,
        notes: newMaterial.notes || '',
        entry_date: finalDate,
        created_at: `${finalDate}T12:00:00`
      };

      await inventoryService.createMaterial(payload);
      toast.success(`Insumo '${newMaterial.name}' registrado exitosamente`);
      setShowMaterialModal(false);
      setNewMaterial(DEFAULT_NEW_MATERIAL);
      try {
        localStorage.removeItem('prisma_lab_draft_new_material');
      } catch (e) {}
      loadInventory();
    } catch (err) {
      toast.error('Error creando material');
    }
  };

  const handleOpenEditMaterial = (item) => {
    setEditingMaterial(item);
    const itemDate = item.created_at || item.updated_at;
    let ymd = getTodayYMD();
    if (itemDate) {
      const str = String(itemDate);
      if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
        ymd = str.substring(0, 10);
      } else {
        const d = new Date(itemDate);
        if (!isNaN(d.getTime())) {
          ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
    }
    setEditMaterialData({
      article_code: item.article_code || '',
      name: item.name,
      color: item.color,
      material_type: item.material_type,
      initial_stock_g: item.initial_stock_g,
      outgoing_stock_g: item.outgoing_stock_g,
      current_stock_g: item.current_stock_g,
      cost_per_g: item.cost_per_g,
      total_cost: parseFloat(((item.initial_stock_g || 0) * (item.cost_per_g || 0)).toFixed(2)),
      min_stock_alert_g: item.min_stock_alert_g || 200,
      entry_date: ymd,
      notes: item.notes || ''
    });
  };

  const handleSaveEditMaterial = async (e) => {
    e.preventDefault();
    if (!editingMaterial) return;
    try {
      const stockInit = parseFloat(editMaterialData.initial_stock_g) || 0;
      const outgoing = parseFloat(editMaterialData.outgoing_stock_g) || 0;
      const current = stockInit - outgoing;
      const finalDate = normalizeDateInput(editMaterialData.entry_date);

      await inventoryService.updateMaterial(editingMaterial.id, {
        article_code: editMaterialData.article_code ? editMaterialData.article_code.trim().toUpperCase() : undefined,
        name: editMaterialData.name.trim(),
        color: editMaterialData.color.trim(),
        material_type: editMaterialData.material_type.trim(),
        initial_stock_g: stockInit,
        outgoing_stock_g: outgoing,
        current_stock_g: current,
        cost_per_g: parseFloat(editMaterialData.cost_per_g) || 65.0,
        min_stock_alert_g: parseFloat(editMaterialData.min_stock_alert_g) || 200.0,
        notes: editMaterialData.notes || '',
        entry_date: finalDate,
        created_at: `${finalDate}T12:00:00`
      });
      toast.success(`Insumo '${editMaterialData.name}' actualizado`);
      setEditingMaterial(null);
      loadInventory();
    } catch (err) {
      toast.error('Error actualizando insumo');
    }
  };

  const handleDeleteMaterial = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar el insumo '${name}' del inventario?`)) return;
    try {
      await inventoryService.deleteMaterial(id);
      toast.success(`Insumo '${name}' eliminado`);
      loadInventory();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error eliminando insumo');
    }
  };

  const handleOpenNewProductModal = (isInternal = false) => {
    setNewProduct({
      ...DEFAULT_NEW_PRODUCT,
      is_internal_use: isInternal,
      category: isInternal ? 'DOTACION_TALLER' : 'PRODUCTO_TERMINADO',
      sale_price_with_margin: 0,
      notes: isInternal ? 'Pieza registrada para dotación / uso interno del taller' : ''
    });
    setShowProductModal(true);
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const isInternal = !!newProduct.is_internal_use;
      const finalDate = normalizeDateInput(newProduct.entry_date);
      const payload = {
        name: newProduct.name.trim(),
        serial: newProduct.serial ? newProduct.serial.trim() : (isInternal ? `INT-${Date.now().toString().slice(-6)}` : `PRD-${Date.now().toString().slice(-6)}`),
        category: isInternal ? 'DOTACION_TALLER' : (newProduct.category || 'PRODUCTO_TERMINADO'),
        material_type: newProduct.material_type || 'Pieza 3D',
        color: newProduct.color || 'Multicolor',
        current_stock_units: parseInt(newProduct.current_stock_units, 10) || 1,
        unit_cost_cop: parseFloat(newProduct.unit_cost_cop) || 0,
        sale_price_with_margin: isInternal ? 0.0 : (parseFloat(newProduct.sale_price_with_margin) || 0.0),
        status: 'DISPONIBLE',
        is_internal_use: isInternal,
        entry_date: finalDate,
        created_at: `${finalDate}T12:00:00`,
        notes: newProduct.notes || (isInternal ? 'Pieza registrada para dotación / uso interno del taller' : '')
      };
      await inventoryService.createProduct(payload);
      toast.success(isInternal ? `Pieza '${payload.name}' registrada en Apartado No a la Venta (${formatDate(finalDate)})` : `Producto '${payload.name}' registrado en Vitrina (${formatDate(finalDate)})`);
      setShowProductModal(false);
      setNewProduct(DEFAULT_NEW_PRODUCT);
      if (isInternal) {
        setActiveSubtab('no_sale');
      } else {
        setActiveSubtab('vitrina');
      }
      loadInventory();
    } catch (err) {
      console.error('Error creando producto terminado:', err);
      toast.error(err.response?.data?.detail || 'Error creando producto terminado');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSellModal = async (product) => {
    setSellProductData(product);
    setSellForm({
      quantity: 1,
      unit_price: product.sale_price_with_margin || 0,
      customer_id: '',
      sale_date: getTodayYMD(),
      notes: `Venta vitrina: ${product.name}`
    });
    setShowSellModal(true);
    try {
      const res = await salesService.getCustomers();
      setCustomers(res.data || []);
    } catch (e) {
      console.error('Error cargando clientes:', e);
    }
  };

  const handleConfirmSell = async (e) => {
    e.preventDefault();
    if (!sellProductData) return;
    try {
      setSellingLoading(true);
      const finalDate = normalizeDateInput(sellForm.sale_date);
      const res = await inventoryService.sellProduct(sellProductData.id, {
        quantity: parseInt(sellForm.quantity, 10),
        unit_price: parseFloat(sellForm.unit_price),
        customer_id: sellForm.customer_id ? parseInt(sellForm.customer_id, 10) : null,
        date: finalDate,
        created_at: `${finalDate}T12:00:00`,
        notes: sellForm.notes
      });
      toast.success(res.data?.message || 'Producto facturado y stock descontado exitosamente');
      setShowSellModal(false);
      setSellProductData(null);
      loadInventory();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al facturar producto de vitrina');
    } finally {
      setSellingLoading(false);
    }
  };

  const handleOpenEditProductDate = (product) => {
    setEditingProductDate(product);
    setNewProductDateVal(normalizeDateInput(product.created_at || getTodayYMD()));
  };

  const handleSaveProductDate = async (e) => {
    e.preventDefault();
    if (!editingProductDate) return;
    try {
      setLoading(true);
      const finalDate = normalizeDateInput(newProductDateVal);
      await inventoryService.updateProductDate(editingProductDate.id, {
        created_at: `${finalDate}T12:00:00`
      });
      toast.success(`Fecha de '${editingProductDate.name}' actualizada a ${formatDate(finalDate)} (Asientos sincronizados)`);
      setEditingProductDate(null);
      loadInventory();
    } catch (err) {
      console.error('Error actualizando fecha:', err);
      toast.error(err.response?.data?.detail || 'Error actualizando fecha del producto');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar el producto '${name}' del inventario? Esta acción no se puede deshacer.`)) return;
    try {
      await inventoryService.deleteProduct(id);
      toast.success(`Producto '${name}' eliminado`);
      loadInventory();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error eliminando producto terminado');
    }
  };

  const handleSaveNotes = async (id, newNotes) => {
    const currentItem = materials.find(m => m.id === id);
    if (currentItem && (currentItem.notes || '') === newNotes) return;
    try {
      await inventoryService.updateMaterial(id, { notes: newNotes });
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, notes: newNotes } : m));
      toast.success('Observación guardada');
    } catch (err) {
      toast.error('Error al guardar observación');
    }
  };

  // Handlers para Papelería / Mantenimiento
  const handleCreateSupply = async (e) => {
    e.preventDefault();
    try {
      const finalDate = normalizeDateInput(newSupply.entry_date);
      const payload = {
        name: newSupply.name.trim(),
        item_type: newSupply.item_type,
        unit_cost_cop: parseFloat(newSupply.unit_cost_cop) || 0,
        stock_units: parseFloat(newSupply.stock_units) || 0,
        notes: newSupply.notes || '',
        entry_date: finalDate,
        created_at: `${finalDate}T12:00:00`
      };
      await inventoryService.createAdditionalSupply(payload);
      toast.success(`Insumo '${newSupply.name}' registrado exitosamente`);
      setShowSupplyModal(false);
      setNewSupply(DEFAULT_NEW_SUPPLY);
      try {
        localStorage.removeItem('prisma_lab_draft_new_supply');
      } catch (e) {}
      loadInventory();
    } catch (err) {
      toast.error('Error registrando insumo adicional');
    }
  };

  const handleOpenEditSupply = (supply) => {
    setEditingSupply(supply);
    const itemDate = supply.created_at || supply.updated_at;
    let ymd = getTodayYMD();
    if (itemDate) {
      const str = String(itemDate);
      if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
        ymd = str.substring(0, 10);
      } else {
        const d = new Date(itemDate);
        if (!isNaN(d.getTime())) {
          ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
    }
    setEditSupplyData({
      name: supply.name,
      item_type: supply.item_type,
      unit_cost_cop: supply.unit_cost_cop,
      stock_units: supply.stock_units,
      entry_date: ymd,
      notes: supply.notes || ''
    });
  };

  const handleSaveEditSupply = async (e) => {
    e.preventDefault();
    try {
      const finalDate = normalizeDateInput(editSupplyData.entry_date);
      const payload = {
        name: editSupplyData.name.trim(),
        item_type: editSupplyData.item_type,
        unit_cost_cop: parseFloat(editSupplyData.unit_cost_cop) || 0,
        stock_units: parseFloat(editSupplyData.stock_units) || 0,
        notes: editSupplyData.notes || '',
        entry_date: finalDate,
        created_at: `${finalDate}T12:00:00`
      };
      await inventoryService.updateAdditionalSupply(editingSupply.id, payload);
      toast.success(`Insumo '${editSupplyData.name}' actualizado`);
      setEditingSupply(null);
      setEditSupplyData(null);
      loadInventory();
    } catch (err) {
      toast.error('Error actualizando insumo');
    }
  };

  const handleDeleteSupply = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar '${name}'?`)) return;
    try {
      const res = await inventoryService.deleteAdditionalSupply(id);
      const accMsg = res.data?.deleted_journal_entries ? ` (se anularon ${res.data.deleted_journal_entries} registros contables)` : '';
      toast.success(`Insumo '${name}' eliminado correctamente${accMsg}`);
      loadInventory();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error eliminando insumo');
    }
  };

  const handleSaveSupplyNotes = async (id, newNotes) => {
    const currentItem = supplies.find(s => s.id === id);
    if (currentItem && (currentItem.notes || '') === newNotes) return;
    try {
      await inventoryService.updateAdditionalSupply(id, { notes: newNotes });
      setSupplies(prev => prev.map(s => s.id === id ? { ...s, notes: newNotes } : s));
      toast.success('Observación guardada');
    } catch (err) {
      toast.error('Error al guardar observación');
    }
  };

  // Métricas para el resumen superior de Filamentos
  const totalMaterialsValue = materials.reduce((acc, m) => acc + (Math.max(0, m.current_stock_g || 0) * Math.max(0, m.cost_per_g || 0)), 0);
  const totalSpentValue = materials.reduce((acc, m) => acc + (Math.max(0, m.outgoing_stock_g || 0) * Math.max(0, m.cost_per_g || 0)), 0);
  const totalInitialValue = materials.reduce((acc, m) => acc + (Math.max(0, m.initial_stock_g || 0) * Math.max(0, m.cost_per_g || 0)), 0);
  const totalAvailableGrams = materials.reduce((acc, m) => acc + Math.max(0, m.current_stock_g || 0), 0);

  const optimalCount = materials.filter(m => (m.current_stock_g || 0) > (m.min_stock_alert_g || 200)).length;
  const lowStockCount = materials.filter(m => (m.current_stock_g || 0) <= (m.min_stock_alert_g || 200) && (m.current_stock_g || 0) > 0).length;
  const outOfStockCount = materials.filter(m => (m.current_stock_g || 0) <= 0).length;

  // Métricas para Vitrina (A la Venta)
  const commercialProducts = products.filter(p => !p.is_internal_use);
  const totalCommercialCost = commercialProducts.reduce((acc, p) => acc + (Math.max(0, p.current_stock_units || 0) * Math.max(0, p.unit_cost_cop || 0)), 0);
  const totalCommercialSaleValue = commercialProducts.reduce((acc, p) => acc + (Math.max(0, p.current_stock_units || 0) * Math.max(0, p.sale_price_with_margin || 0)), 0);
  const totalCommercialUnits = commercialProducts.reduce((acc, p) => acc + Math.max(0, p.current_stock_units || 0), 0);
  const totalCommercialProjectedProfit = Math.max(0, totalCommercialSaleValue - totalCommercialCost);

  // Métricas para Apartado No a la Venta (Uso Interno / Prisma Lab)
  const internalProducts = products.filter(p => p.is_internal_use);
  const totalInternalCostValue = internalProducts.reduce((acc, p) => acc + (Math.max(0, p.current_stock_units || 0) * Math.max(0, p.unit_cost_cop || 0)), 0);
  const totalInternalUnits = internalProducts.reduce((acc, p) => acc + Math.max(0, p.current_stock_units || 0), 0);

  // Compatibilidad general
  const totalProductsCostValue = totalCommercialCost + totalInternalCostValue;
  const totalProductsUnits = totalCommercialUnits + totalInternalUnits;

  // Filtro Vitrina (A la Venta)
  const filteredCommercialProducts = commercialProducts.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.serial && p.serial.toLowerCase().includes(q)) ||
      (p.color && p.color.toLowerCase().includes(q)) ||
      (p.material_type && p.material_type.toLowerCase().includes(q));

    const matchesType = productTypeFilter === 'ALL' || (p.material_type && p.material_type.toUpperCase() === productTypeFilter);

    let matchesStock = true;
    if (productStockFilter === 'IN_STOCK') {
      matchesStock = (p.current_stock_units || 0) > 0;
    } else if (productStockFilter === 'OUT_OF_STOCK') {
      matchesStock = (p.current_stock_units || 0) <= 0;
    }

    return matchesSearch && matchesType && matchesStock;
  });

  // Filtro Apartado No a la Venta (Dotación / Taller)
  const filteredInternalProducts = internalProducts.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.serial && p.serial.toLowerCase().includes(q)) ||
      (p.color && p.color.toLowerCase().includes(q)) ||
      (p.material_type && p.material_type.toLowerCase().includes(q)) ||
      (p.notes && p.notes.toLowerCase().includes(q));

    const matchesType = productTypeFilter === 'ALL' || (p.material_type && p.material_type.toUpperCase() === productTypeFilter);

    let matchesStock = true;
    if (productStockFilter === 'IN_STOCK') {
      matchesStock = (p.current_stock_units || 0) > 0;
    } else if (productStockFilter === 'OUT_OF_STOCK') {
      matchesStock = (p.current_stock_units || 0) <= 0;
    }

    return matchesSearch && matchesType && matchesStock;
  });

  // Métricas para Papelería / Mantenimiento
  const totalSuppliesValue = supplies.reduce((acc, s) => acc + (Math.max(0, s.stock_units || 0) * Math.max(0, s.unit_cost_cop || 0)), 0);
  const papeleriaSupplies = supplies.filter(s => s.item_type === 'PAPELERIA');
  const mantenimientoSupplies = supplies.filter(s => s.item_type === 'MANTENIMIENTO');
  const totalPapeleriaUnits = papeleriaSupplies.reduce((acc, s) => acc + Math.max(0, s.stock_units || 0), 0);
  const totalMantenimientoUnits = mantenimientoSupplies.reduce((acc, s) => acc + Math.max(0, s.stock_units || 0), 0);
  const totalSuppliesUnits = supplies.reduce((acc, s) => acc + Math.max(0, s.stock_units || 0), 0);

  const filteredMaterials = materials.filter((m) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (m.article_code && m.article_code.toLowerCase().includes(q)) ||
      m.name.toLowerCase().includes(q) ||
      m.color.toLowerCase().includes(q) ||
      m.material_type.toLowerCase().includes(q) ||
      (m.notes && m.notes.toLowerCase().includes(q));

    const matchesType = selectedType === 'ALL' || m.material_type.toUpperCase() === selectedType;

    let matchesStatus = true;
    if (selectedStatus === 'OPTIMAL') {
      matchesStatus = (m.current_stock_g || 0) > (m.min_stock_alert_g || 200);
    } else if (selectedStatus === 'LOW') {
      matchesStatus = (m.current_stock_g || 0) <= (m.min_stock_alert_g || 200) && (m.current_stock_g || 0) > 0;
    } else if (selectedStatus === 'OUT') {
      matchesStatus = (m.current_stock_g || 0) <= 0;
    }

    const matchesDate = isDateInRange(m.created_at || m.updated_at, materialStartDate, materialEndDate);

    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  const filteredProducts = products.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.serial && p.serial.toLowerCase().includes(q)) ||
      (p.color && p.color.toLowerCase().includes(q)) ||
      (p.material_type && p.material_type.toLowerCase().includes(q));

    const matchesType = productTypeFilter === 'ALL' || (p.material_type && p.material_type.toUpperCase() === productTypeFilter);

    let matchesStock = true;
    if (productStockFilter === 'IN_STOCK') {
      matchesStock = (p.current_stock_units || 0) > 0;
    } else if (productStockFilter === 'OUT_OF_STOCK') {
      matchesStock = (p.current_stock_units || 0) <= 0;
    }

    const matchesDestination =
      productDestinationFilter === 'ALL' ||
      (productDestinationFilter === 'INTERNAL' && p.is_internal_use) ||
      (productDestinationFilter === 'COMMERCIAL' && !p.is_internal_use);

    return matchesSearch && matchesType && matchesStock && matchesDestination;
  });

  const filteredSupplies = supplies.filter((s) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.item_type.toLowerCase().includes(q) ||
      (s.notes && s.notes.toLowerCase().includes(q));

    const matchesType = supplyTypeFilter === 'ALL' || s.item_type === supplyTypeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Resumen Superior del Inventario */}
      {activeSubtab === 'materials' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Valor Total en Stock</span>
              <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                ${totalMaterialsValue.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">Inversión Inicial: ${totalInitialValue.toLocaleString('es-CO')}</span>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-sm text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Costo Total Consumido</span>
              <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                ${totalSpentValue.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">Gramos gastados en producción</span>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-sm text-amber-400 border border-amber-500/20">
              <TrendingDown className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Stock Total Disponible</span>
              <p className="text-lg font-bold text-[#EAEAEA] font-mono mt-0.5">
                {(totalAvailableGrams / 1000).toFixed(2)} kg <span className="text-xs text-[#A0A0A0] font-normal">({totalAvailableGrams.toLocaleString('es-CO')} g)</span>
              </p>
              <span className="text-[10px] text-[#666666]">{materials.length} bobinas / insumos</span>
            </div>
            <div className="p-2 bg-slate-500/10 rounded-sm text-slate-400 border border-slate-500/20">
              <Package className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Estado de Bobinas</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1" title="Óptimo">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {optimalCount}
                </span>
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1" title="Por reponer">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> {lowStockCount}
                </span>
                <span className="text-xs font-semibold text-rose-400 flex items-center gap-1" title="Agotado">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> {outOfStockCount}
                </span>
              </div>
              <span className="text-[10px] text-[#666666]">{materials.length} total registrados</span>
            </div>
            <div className="p-2 bg-slate-500/10 rounded-sm text-slate-400 border border-slate-500/20">
              <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      ) : activeSubtab === 'vitrina' ? (
        /* KPI Vitrina (A la Venta) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Valor Total en Stock (Costo)</span>
              <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                ${totalCommercialCost.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">Costo fabricación de piezas en vitrina</span>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-sm text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Valor Comercial Total (Venta)</span>
              <p className="text-lg font-bold text-sky-400 font-mono mt-0.5">
                ${totalCommercialSaleValue.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">
                Precio de venta al público en vitrina
              </span>
            </div>
            <div className="p-2 bg-sky-500/10 rounded-sm text-sky-400 border border-sky-500/20">
              <Layers className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Unidades en Vitrina</span>
              <p className="text-lg font-bold text-[#EAEAEA] font-mono mt-0.5">
                {totalCommercialUnits.toLocaleString('es-CO')} und
              </p>
              <span className="text-[10px] text-[#666666]">
                {commercialProducts.length} referencias disponibles para venta
              </span>
            </div>
            <div className="p-2 bg-slate-500/10 rounded-sm text-slate-400 border border-slate-500/20">
              <Package className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Margen / Utilidad Proyectada</span>
              <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                ${totalCommercialProjectedProfit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">Ganancia bruta esperada</span>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-sm text-amber-400 border border-amber-500/20">
              <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      ) : activeSubtab === 'no_sale' ? (
        /* KPI Apartado No a la Venta (Uso Interno / Prisma Lab) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#1A1A1A] border border-purple-900/30 p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-purple-300 font-medium uppercase tracking-wide">Costo Fabricación Invertido</span>
              <p className="text-lg font-bold text-purple-400 font-mono mt-0.5">
                ${totalInternalCostValue.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">Insumos consumidos en dotación</span>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-sm text-purple-400 border border-purple-500/20">
              <DollarSign className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-purple-900/30 p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-purple-300 font-medium uppercase tracking-wide">Piezas de Taller / Dotación</span>
              <p className="text-lg font-bold text-[#EAEAEA] font-mono mt-0.5">
                {totalInternalUnits.toLocaleString('es-CO')} und
              </p>
              <span className="text-[10px] text-[#666666]">Herramientas y accesorios de taller</span>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-sm text-purple-400 border border-purple-500/20">
              <Box className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-purple-900/30 p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-purple-300 font-medium uppercase tracking-wide">Referencias Registradas</span>
              <p className="text-lg font-bold text-indigo-300 font-mono mt-0.5">
                {internalProducts.length} <span className="text-xs font-normal text-[#A0A0A0]">piezas</span>
              </p>
              <span className="text-[10px] text-[#666666]">Modelos para uso propio</span>
            </div>
            <div className="p-2 bg-indigo-500/10 rounded-sm text-indigo-400 border border-indigo-500/20">
              <Wrench className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-purple-900/30 p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-purple-300 font-medium uppercase tracking-wide">Precio Venta Comercial</span>
              <p className="text-lg font-bold text-[#A0A0A0] font-mono mt-0.5">
                $0 COP
              </p>
              <span className="text-[10px] text-purple-400 font-medium">Bloqueado para facturar</span>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-sm text-purple-400 border border-purple-500/20">
              <ShieldAlert className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      ) : (
        /* KPI Papelería / Mantenimiento */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Valor Total en Stock</span>
              <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                ${totalSuppliesValue.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
              </p>
              <span className="text-[10px] text-[#666666]">Costo total en insumos adicionales</span>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-sm text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Papelería y Empaque</span>
              <p className="text-lg font-bold text-indigo-400 font-mono mt-0.5">
                {papeleriaSupplies.length} <span className="text-xs font-normal text-[#A0A0A0]">referencias</span>
              </p>
              <span className="text-[10px] text-[#666666]">{totalPapeleriaUnits.toLocaleString('es-CO')} unidades disponibles</span>
            </div>
            <div className="p-2 bg-indigo-500/10 rounded-sm text-indigo-400 border border-indigo-500/20">
              <FileText className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Mantenimiento y Repuestos</span>
              <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                {mantenimientoSupplies.length} <span className="text-xs font-normal text-[#A0A0A0]">referencias</span>
              </p>
              <span className="text-[10px] text-[#666666]">{totalMantenimientoUnits.toLocaleString('es-CO')} unidades/usos disponibles</span>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-sm text-amber-400 border border-amber-500/20">
              <Wrench className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-3.5 rounded-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Total Insumos / Usos</span>
              <p className="text-lg font-bold text-[#EAEAEA] font-mono mt-0.5">
                {totalSuppliesUnits.toLocaleString('es-CO')} und
              </p>
              <span className="text-[10px] text-[#666666]">{supplies.length} registros en catálogo</span>
            </div>
            <div className="p-2 bg-slate-500/10 rounded-sm text-slate-400 border border-slate-500/20">
              <Box className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      )}

      {/* Controles y pestañas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-sm border border-[#2A2A2A]">
        <div className="flex items-center gap-1 bg-[#101010] p-1 rounded-sm border border-[#2A2A2A] flex-wrap">
          <button
            onClick={() => setActiveSubtab('materials')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'materials'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Package className="w-3.5 h-3.5" strokeWidth={1.5} /> Filamentos ({materials.length})
          </button>
          <button
            onClick={() => setActiveSubtab('vitrina')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'vitrina'
                ? 'bg-[#1A1A1A] text-emerald-400 border-l-2 border-emerald-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} /> Vitrina (A la Venta) ({commercialProducts.length})
          </button>
          <button
            onClick={() => setActiveSubtab('no_sale')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'no_sale'
                ? 'bg-[#1A1A1A] text-purple-400 border-l-2 border-purple-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" strokeWidth={1.5} /> Apartado No a la Venta ({internalProducts.length})
          </button>
          <button
            onClick={() => setActiveSubtab('supplies')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'supplies'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Box className="w-3.5 h-3.5" strokeWidth={1.5} /> Papelería / Mantenimiento ({supplies.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
            <input
              type="text"
              placeholder={
                activeSubtab === 'materials'
                  ? "Buscar material, color, nota..."
                  : activeSubtab === 'vitrina'
                  ? "Buscar producto vitrina, serial..."
                  : activeSubtab === 'no_sale'
                  ? "Buscar pieza de taller, herramienta..."
                  : "Buscar insumo, tipo, nota..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#101010] border border-[#2A2A2A] text-xs text-[#EAEAEA] pl-9 pr-8 py-1.5 rounded-sm focus:outline-none focus:border-slate-500 w-44 sm:w-56"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeSubtab === 'materials' && (
            <>
              {/* Filtro Tipo Material */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#666666]" />
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
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

              {/* Filtro Estado Stock */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todos los Estados</option>
                  <option value="OPTIMAL" className="bg-[#1A1A1A]">ÓPTIMO</option>
                  <option value="LOW" className="bg-[#1A1A1A]">REPONER</option>
                  <option value="OUT" className="bg-[#1A1A1A]">AGOTADO</option>
                </select>
              </div>

              {/* Filtro de Fechas */}
              <DateRangeFilter
                startDate={materialStartDate}
                endDate={materialEndDate}
                onChange={({ startDate, endDate }) => {
                  setMaterialStartDate(startDate);
                  setMaterialEndDate(endDate);
                }}
              />

              {(searchTerm || selectedType !== 'ALL' || selectedStatus !== 'ALL' || materialStartDate || materialEndDate) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedType('ALL');
                    setSelectedStatus('ALL');
                    setMaterialStartDate('');
                    setMaterialEndDate('');
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline whitespace-nowrap px-1"
                >
                  Limpiar Filtros
                </button>
              )}

              <button
                onClick={() => setShowMaterialModal(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Nuevo Insumo
              </button>
            </>
          )}

          {activeSubtab === 'vitrina' && (
            <>
              {/* Filtro Tipo Producto */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#666666]" />
                <select
                  value={productTypeFilter}
                  onChange={(e) => setProductTypeFilter(e.target.value)}
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

              {/* Filtro Stock Producto */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <select
                  value={productStockFilter}
                  onChange={(e) => setProductStockFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todo el Stock</option>
                  <option value="IN_STOCK" className="bg-[#1A1A1A]">Con Stock Disponible</option>
                  <option value="OUT_OF_STOCK" className="bg-[#1A1A1A]">Agotado / Sin Stock</option>
                </select>
              </div>

              {(searchTerm || productTypeFilter !== 'ALL' || productStockFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setProductTypeFilter('ALL');
                    setProductStockFilter('ALL');
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline whitespace-nowrap px-1"
                >
                  Limpiar Filtros
                </button>
              )}

              <button
                onClick={() => handleOpenNewProductModal(false)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Nuevo Producto Vitrina
              </button>
            </>
          )}

          {activeSubtab === 'no_sale' && (
            <>
              {/* Filtro Tipo Producto */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#666666]" />
                <select
                  value={productTypeFilter}
                  onChange={(e) => setProductTypeFilter(e.target.value)}
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

              {/* Filtro Stock Producto */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <select
                  value={productStockFilter}
                  onChange={(e) => setProductStockFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todo el Stock</option>
                  <option value="IN_STOCK" className="bg-[#1A1A1A]">Con Stock Disponible</option>
                  <option value="OUT_OF_STOCK" className="bg-[#1A1A1A]">Agotado / Sin Stock</option>
                </select>
              </div>

              {(searchTerm || productTypeFilter !== 'ALL' || productStockFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setProductTypeFilter('ALL');
                    setProductStockFilter('ALL');
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 underline whitespace-nowrap px-1"
                >
                  Limpiar Filtros
                </button>
              )}

              <button
                onClick={() => handleOpenNewProductModal(true)}
                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white font-medium rounded-sm text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Registrar Pieza Taller
              </button>
            </>
          )}

          {activeSubtab === 'supplies' && (
            <>
              {/* Filtro Tipo de Insumo Adicional */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#666666]" />
                <select
                  value={supplyTypeFilter}
                  onChange={(e) => setSupplyTypeFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todos los Tipos</option>
                  <option value="PAPELERIA" className="bg-[#1A1A1A]">Papelería / Empaque</option>
                  <option value="MANTENIMIENTO" className="bg-[#1A1A1A]">Mantenimiento / Repuestos</option>
                </select>
              </div>

              <button
                onClick={() => setShowSupplyModal(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm text-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Nuevo Insumo
              </button>
            </>
          )}

          <button
            onClick={loadInventory}
            className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#101010] border border-[#2A2A2A] rounded-sm"
            title="Recargar inventario"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Contenido según pestaña */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[#A0A0A0]">Cargando inventario...</div>
      ) : activeSubtab === 'materials' ? (
        <div className="space-y-2">
          <div className="text-[10px] text-[#A0A0A0] px-0.5">
            Mostrando <strong className="text-[#EAEAEA]">{filteredMaterials.length}</strong> de <strong className="text-[#EAEAEA]">{materials.length}</strong> filamentos e insumos
          </div>
          <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[10px]">
                  <th className="py-2 px-2 font-semibold">N.° de Artículo</th>
                  <th className="py-2 px-2 font-semibold">Material / Ref</th>
                  <th className="py-2 px-1.5 font-semibold">Fecha</th>
                  <th className="py-2 px-1.5 font-semibold">Tipo</th>
                  <th className="py-2 px-1.5 font-semibold">Color</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Inicial</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Salidas</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Actual</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Costo/g</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Costo Total</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Gastado</th>
                  <th className="py-2 px-1.5 font-semibold text-right">Valor Stock</th>
                  <th className="py-2 px-2 font-semibold">Observaciones</th>
                  <th className="py-2 px-1.5 font-semibold text-center">Estado</th>
                  <th className="py-2 px-1.5 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A]/50">
                {filteredMaterials.map((item) => {
                  const isLow = (item.current_stock_g || 0) <= (item.min_stock_alert_g || 200) && (item.current_stock_g || 0) > 0;
                  const isOut = (item.current_stock_g || 0) <= 0;
                  const totalCostVal = (item.initial_stock_g || 0) * (item.cost_per_g || 0);
                  const spentVal = (item.outgoing_stock_g || 0) * (item.cost_per_g || 0);
                  const currentVal = Math.max(0, item.current_stock_g || 0) * (item.cost_per_g || 0);

                  return (
                    <tr key={item.id} className="hover:bg-[#222222] transition-colors">
                      <td className="py-2 px-2 font-mono font-bold text-emerald-400 whitespace-nowrap text-[11px]">
                        {item.article_code || '-'}
                      </td>
                      <td className="py-2 px-2 font-medium text-[#EAEAEA] break-words">{item.name}</td>
                      <td className="py-2 px-1.5 text-[#A0A0A0] font-mono text-[10px] whitespace-nowrap">
                        {formatDate(item.created_at || item.updated_at)}
                      </td>
                      <td className="py-2 px-1.5 text-[#A0A0A0] font-mono">
                        <span className="px-1 py-0.5 rounded bg-[#101010] border border-[#2A2A2A] text-[9px]">
                          {item.material_type}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-[#EAEAEA] break-words">{item.color}</td>
                      <td className="py-2 px-1.5 text-right text-[#A0A0A0] font-mono">
                        {(item.initial_stock_g || 0).toLocaleString('es-CO')}g
                      </td>
                      <td className="py-2 px-1.5 text-right text-amber-400 font-mono">
                        {(item.outgoing_stock_g || 0).toLocaleString('es-CO')}g
                      </td>
                      <td className="py-2 px-1.5 text-right font-medium font-mono">
                        <span className={isOut ? 'text-rose-400 font-bold' : isLow ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                          {(item.current_stock_g || 0).toLocaleString('es-CO')}g
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-right text-emerald-400 font-mono font-semibold">
                        ${(item.cost_per_g || 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-1.5 text-right text-[#A0A0A0] font-mono">
                        ${totalCostVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 px-1.5 text-right text-amber-400/90 font-mono">
                        ${spentVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 px-1.5 text-right text-emerald-400 font-mono font-bold">
                        ${currentVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-1 px-1.5">
                        <input
                          type="text"
                          defaultValue={item.notes || ''}
                          key={`${item.id}-${item.notes}`}
                          onBlur={(e) => handleSaveNotes(item.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                          }}
                          placeholder="Nota..."
                          className="w-full min-w-0 bg-transparent hover:bg-[#101010] focus:bg-[#101010] border border-transparent hover:border-[#2A2A2A] focus:border-slate-500 rounded-sm px-1.5 py-0.5 text-[10px] text-[#EAEAEA] placeholder:text-[#555555] transition-all outline-none"
                          title="Haz clic para editar la observación"
                        />
                      </td>
                      <td className="py-2 px-1 text-center">
                        {isOut ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-sm">
                            AGOTADO
                          </span>
                        ) : isLow ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-sm">
                            REPONER
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-sm">
                            ÓPTIMO
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEditMaterial(item)}
                              title="Editar Insumo"
                              className="p-1 bg-[#101010] hover:bg-[#222222] text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm border border-[#2A2A2A] transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteMaterial(item.id, item.name)}
                              title="Eliminar Insumo"
                              className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeSubtab === 'vitrina' ? (
        /* TABLA VITRINA (A LA VENTA) */
        <div className="space-y-2">
          <div className="text-[10px] text-[#A0A0A0] px-0.5">
            Mostrando <strong className="text-[#EAEAEA]">{filteredCommercialProducts.length}</strong> de <strong className="text-[#EAEAEA]">{commercialProducts.length}</strong> productos disponibles en vitrina para venta comercial
          </div>
          {filteredCommercialProducts.length === 0 ? (
            <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-8 text-center rounded-sm text-xs text-[#A0A0A0]">
              No hay productos comerciales en vitrina con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[10px]">
                    <th className="py-2 px-2 font-semibold">Serial</th>
                    <th className="py-2 px-2 font-semibold">Producto Vitrina</th>
                    <th className="py-2 px-1.5 font-semibold">Fecha</th>
                    <th className="py-2 px-1.5 font-semibold">Color</th>
                    <th className="py-2 px-1.5 font-semibold">Tipo</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Stock</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Costo Fab.</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Precio Venta</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Total Costo</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Total Venta</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Estado</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]/50">
                  {filteredCommercialProducts.map((p) => {
                    const safeStock = Math.max(0, p.current_stock_units || 0);
                    const safeUnitCost = Math.max(0, p.unit_cost_cop || 0);
                    const safeSalePrice = Math.max(0, p.sale_price_with_margin || 0);
                    const totalCostVal = safeStock * safeUnitCost;
                    const totalSaleVal = safeStock * safeSalePrice;
                    const isAvailable = safeStock > 0;

                    return (
                      <tr key={p.id} className="hover:bg-[#222222] transition-colors">
                        <td className="py-2 px-2 font-mono text-slate-300 font-medium">{p.serial || '-'}</td>
                        <td className="py-2 px-2 font-medium text-[#EAEAEA] break-words">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-mono" title="A la venta en vitrina">
                              VITRINA
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-1.5 text-[#A0A0A0] font-mono text-[10px] whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span>{formatDate(p.created_at)}</span>
                            {canEdit && (
                              <button
                                onClick={() => handleOpenEditProductDate(p)}
                                title="Modificar fecha de fabricación y sincronizar contabilidad"
                                className="p-0.5 hover:bg-[#2A2A2A] text-[#777777] hover:text-emerald-400 rounded transition-colors"
                              >
                                <Calendar className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1.5 text-[#A0A0A0] break-words">{p.color || 'Multicolor'}</td>
                        <td className="py-2 px-1.5 text-[#666666] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-[#101010] border border-[#2A2A2A] text-[9px]">
                            {p.material_type || 'Pieza 3D'}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-right font-medium text-[#EAEAEA]">
                          {safeStock} und
                        </td>
                        <td className="py-2 px-1.5 text-right text-[#A0A0A0] font-mono">
                          ${safeUnitCost.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-1.5 text-right font-semibold font-mono text-emerald-400">
                          ${safeSalePrice.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-1.5 text-right text-[#EAEAEA] font-mono font-medium">
                          ${totalCostVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono font-bold text-emerald-400">
                          ${totalSaleVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-1 text-center">
                          {isAvailable ? (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-sm">
                              DISPONIBLE
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-sm">
                              SIN STOCK
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {canEdit && (
                              <button
                                onClick={() => handleOpenSellModal(p)}
                                disabled={!isAvailable}
                                title={isAvailable ? "Facturar este producto de vitrina" : "Sin unidades disponibles en vitrina"}
                                className={`px-2 py-1 rounded-sm text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                                  isAvailable
                                    ? 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-500/30 cursor-pointer shadow-sm'
                                    : 'bg-[#151515] text-[#555555] border-[#222222] cursor-not-allowed'
                                }`}
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Facturar</span>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                title="Eliminar Producto"
                                className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeSubtab === 'no_sale' ? (
        /* TABLA APARTADO NO A LA VENTA (USO INTERNO / TALLER) */
        <div className="space-y-3">
          {/* Banner Informativo de Bloqueo de Facturación */}
          <div className="bg-purple-950/20 border border-purple-800/40 rounded-sm p-3 flex items-start gap-3">
            <div className="p-1.5 bg-purple-500/10 rounded border border-purple-500/20 text-purple-400 mt-0.5">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-purple-300 flex items-center gap-2">
                <span>Apartado No a la Venta (Dotación / Uso Interno de Prisma Lab)</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-900/60 text-purple-200 border border-purple-700/50 font-mono">
                  BLOQUEADO PARA FACTURAR
                </span>
              </h4>
              <p className="text-[11px] text-[#A0A0A0] mt-0.5 leading-relaxed">
                Las piezas registradas aquí son herramientas, accesorios de taller, repuestos de máquinas o dotación para uso propio de Prisma Lab.
                <strong className="text-purple-300"> No están a la venta y quedan totalmente bloqueadas de la facturación comercial</strong>.
                En la contabilidad oficial se registra exclusivamente su costo de fabricación real (sin ingresos de venta ni márgenes comerciales).
              </p>
            </div>
          </div>

          <div className="text-[10px] text-[#A0A0A0] px-0.5">
            Mostrando <strong className="text-[#EAEAEA]">{filteredInternalProducts.length}</strong> de <strong className="text-[#EAEAEA]">{internalProducts.length}</strong> piezas de taller en dotación
          </div>

          {filteredInternalProducts.length === 0 ? (
            <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-8 text-center rounded-sm text-xs text-[#A0A0A0]">
              No hay piezas registradas en el Apartado No a la Venta con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[10px]">
                    <th className="py-2 px-2 font-semibold">Serial</th>
                    <th className="py-2 px-2 font-semibold">Pieza / Herramienta</th>
                    <th className="py-2 px-1.5 font-semibold">Fecha</th>
                    <th className="py-2 px-1.5 font-semibold">Color</th>
                    <th className="py-2 px-1.5 font-semibold">Material</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Stock Taller</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Costo Fab. Unit.</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Precio Venta</th>
                    <th className="py-2 px-1.5 font-semibold text-right">Inversión Fab. Total</th>
                    <th className="py-2 px-2 font-semibold">Observaciones / Ubicación</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Estado</th>
                    <th className="py-2 px-1.5 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]/50">
                  {filteredInternalProducts.map((p) => {
                    const safeStock = Math.max(0, p.current_stock_units || 0);
                    const safeUnitCost = Math.max(0, p.unit_cost_cop || 0);
                    const totalCostVal = safeStock * safeUnitCost;
                    const isAvailable = safeStock > 0;

                    return (
                      <tr key={p.id} className="hover:bg-[#222222] transition-colors">
                        <td className="py-2 px-2 font-mono text-purple-300 font-medium">{p.serial || '-'}</td>
                        <td className="py-2 px-2 font-medium text-[#EAEAEA] break-words">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-950/70 text-purple-300 border border-purple-800/70 font-mono font-semibold" title="Dotación y Consumo Interno de Taller">
                              USO INTERNO
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-1.5 text-purple-300/80 font-mono text-[10px] whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span>{formatDate(p.created_at)}</span>
                            {canEdit && (
                              <button
                                onClick={() => handleOpenEditProductDate(p)}
                                title="Modificar fecha de la pieza y sincronizar contabilidad"
                                className="p-0.5 hover:bg-[#2A2A2A] text-[#777777] hover:text-purple-400 rounded transition-colors"
                              >
                                <Calendar className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1.5 text-[#A0A0A0] break-words">{p.color || 'Multicolor'}</td>
                        <td className="py-2 px-1.5 text-[#666666] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-[#101010] border border-[#2A2A2A] text-[9px]">
                            {p.material_type || 'Pieza 3D'}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-right font-medium text-[#EAEAEA]">
                          {safeStock} und
                        </td>
                        <td className="py-2 px-1.5 text-right text-purple-300 font-mono">
                          ${safeUnitCost.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-950/80 text-purple-300 border border-purple-800 font-mono font-semibold" title="Bloqueado para facturación">
                            NO A LA VENTA
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-right text-purple-300 font-mono font-semibold">
                          ${totalCostVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-2 text-[#A0A0A0] text-[10px] break-words">
                          {p.notes || <span className="text-[#555555] italic">Uso interno taller</span>}
                        </td>
                        <td className="py-2 px-1 text-center">
                          {isAvailable ? (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-sm">
                              EN USO / DISP.
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-sm">
                              DESGASTADO
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                title="Eliminar Pieza de Taller"
                                className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* TABLA PAPELERÍA / MANTENIMIENTO */
        <div className="space-y-2">
          <div className="text-[10px] text-[#A0A0A0] px-0.5">
            Mostrando <strong className="text-[#EAEAEA]">{filteredSupplies.length}</strong> de <strong className="text-[#EAEAEA]">{supplies.length}</strong> insumos de papelería y mantenimiento
          </div>
          {filteredSupplies.length === 0 ? (
            <div className="bg-[#1A1A1A] border border-[#2A2A2A] p-8 text-center rounded-sm text-xs text-[#A0A0A0]">
              No hay insumos adicionales registrados con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[10px]">
                    <th className="py-2 px-2.5 font-semibold">Insumo / Concepto</th>
                    <th className="py-2 px-2 font-semibold">Tipo</th>
                    <th className="py-2 px-2 font-semibold text-right">Costo Unit.</th>
                    <th className="py-2 px-2 font-semibold text-right">Disponible</th>
                    <th className="py-2 px-2 font-semibold text-right">Total Stock</th>
                    <th className="py-2 px-2 font-semibold">Observaciones</th>
                    <th className="py-2 px-2 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]/50">
                  {filteredSupplies.map((s) => {
                    const safeStock = Math.max(0, s.stock_units || 0);
                    const safeCost = Math.max(0, s.unit_cost_cop || 0);
                    const totalVal = safeStock * safeCost;
                    const isPapeleria = s.item_type === 'PAPELERIA';

                    return (
                      <tr key={s.id} className="hover:bg-[#222222] transition-colors">
                        <td className="py-2 px-2.5 font-medium text-[#EAEAEA] break-words">
                          {s.name}
                        </td>
                        <td className="py-2 px-2">
                          {isPapeleria ? (
                            <span className="px-1.5 py-0.5 rounded-sm bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold text-[9px] flex items-center gap-1 w-max">
                              <FileText className="w-3 h-3" /> PAPELERÍA
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold text-[9px] flex items-center gap-1 w-max">
                              <Wrench className="w-3 h-3" /> MANTENIMIENTO
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-400 font-semibold">
                          ${safeCost.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#EAEAEA] font-medium">
                          {safeStock.toLocaleString('es-CO')} und
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-400 font-bold">
                          ${totalVal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            defaultValue={s.notes || ''}
                            key={`${s.id}-${s.notes}`}
                            onBlur={(e) => handleSaveSupplyNotes(s.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                            }}
                            placeholder="Observación..."
                            className="w-full min-w-0 bg-transparent hover:bg-[#101010] focus:bg-[#101010] border border-transparent hover:border-[#2A2A2A] focus:border-slate-500 rounded-sm px-1.5 py-0.5 text-[10px] text-[#EAEAEA] placeholder:text-[#555555] transition-all outline-none"
                            title="Haz clic para editar la observación"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => handleOpenEditSupply(s)}
                                title="Editar Insumo"
                                className="p-1 bg-[#101010] hover:bg-[#222222] text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm border border-[#2A2A2A] transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteSupply(s.id, s.name)}
                                title="Eliminar Insumo"
                                className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          )}
        </div>
      )}

      {/* Modal Nuevo Material */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCreateMaterial} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-lg space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Nuevo Insumo (Filamento)</h3>
              </div>
              <button type="button" onClick={() => setShowMaterialModal(false)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Nombre Insumo / Referencia</label>
                <input
                  type="text"
                  required
                  placeholder="ej. PETG Blanco Bambu Lab 1kg"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0]">N.° de Artículo (Código)</label>
                  <button
                    type="button"
                    onClick={() => setNewMaterial(prev => ({
                      ...prev,
                      article_code: predictArticleCode(prev.material_type, prev.color, materials)
                    }))}
                    className="text-[10px] text-emerald-400 hover:underline"
                    title="Calcular según tipo y color"
                  >
                    Auto ({predictArticleCode(newMaterial.material_type, newMaterial.color, materials)})
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={predictArticleCode(newMaterial.material_type, newMaterial.color, materials)}
                  value={newMaterial.article_code}
                  onChange={(e) => setNewMaterial({ ...newMaterial, article_code: e.target.value.toUpperCase() })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-emerald-400 font-mono font-bold px-3 py-1.5 rounded-sm focus:border-slate-500 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Tipo de Material</label>
                <select
                  value={newMaterial.material_type}
                  onChange={(e) => setNewMaterial({ ...newMaterial, material_type: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm focus:border-slate-500 font-medium"
                >
                  <option value="PETG">PETG</option>
                  <option value="PLA">PLA</option>
                  <option value="TPU">TPU</option>
                  <option value="ABS">ABS</option>
                  <option value="ASA">ASA</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Color</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Blanco, Negro, Rojo..."
                  value={newMaterial.color}
                  onChange={(e) => setNewMaterial({ ...newMaterial, color: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Fecha de Ingreso</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewMaterial({ ...newMaterial, entry_date: getTodayYMD() })}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono"
                  >
                    Hoy
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="DD/MM/AAAA o DD/MM (ej. 27/04)"
                    value={newMaterial.entry_date || ''}
                    onChange={(e) => setNewMaterial({ ...newMaterial, entry_date: e.target.value })}
                    className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] pl-2.5 pr-8 py-1.5 rounded-sm focus:border-slate-500 font-mono text-xs"
                    title="Escribe la fecha (ej. 27/04 o 27/04/2026) o selecciona del calendario"
                  />
                  <input
                    type="date"
                    tabIndex={-1}
                    value={normalizeDateInput(newMaterial.entry_date)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setNewMaterial({ ...newMaterial, entry_date: `${d}/${m}/${y}` });
                      }
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 w-6 h-6 cursor-pointer z-10"
                    title="Abrir calendario"
                  />
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="mt-1 text-[10px] text-[#888888] flex items-center justify-between font-mono">
                  <span>Asignada:</span>
                  <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(newMaterial.entry_date))}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Stock Inicial (g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newMaterial.initial_stock_g}
                    onChange={(e) => handleNewMaterialStockOrCostChange('initial_stock_g', e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Costo Total Bobina ($)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newMaterial.total_cost}
                    onChange={(e) => handleNewMaterialStockOrCostChange('total_cost', e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-emerald-400 font-semibold mb-1">Costo por Gramo ($/g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newMaterial.cost_per_g}
                    onChange={(e) => handleNewMaterialStockOrCostChange('cost_per_g', e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-emerald-500/50 text-emerald-400 font-bold px-2.5 py-1.5 rounded-sm font-mono focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#888888] pt-1 border-t border-[#1F1F1F]">
                <span>Cálculo automático:</span>
                <span className="font-mono text-emerald-400 font-medium">
                  ${(parseFloat(newMaterial.total_cost) || 0).toLocaleString('es-CO')} COP / {(parseFloat(newMaterial.initial_stock_g) || 0)}g = <strong>${(parseFloat(newMaterial.cost_per_g) || 0).toFixed(2)}/g</strong>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Observaciones / Notas</label>
              <textarea
                rows={2}
                placeholder="ej. Bobina Bambu Lab AMS #1, Proveedor X, Lote 2026..."
                value={newMaterial.notes}
                onChange={(e) => setNewMaterial({ ...newMaterial, notes: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500 resize-none"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowMaterialModal(false)}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-sm flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Guardar Insumo</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Nuevo Producto Terminado / Pieza */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCreateProduct} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-lg space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Registrar Pieza o Producto</h3>
              </div>
              <button type="button" onClick={() => setShowProductModal(false)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Toggle Destino: Venta Comercial vs Uso Interno */}
            <div className="bg-[#101010] p-2.5 rounded-sm border border-[#2A2A2A] space-y-1.5">
              <label className="text-[10px] text-[#A0A0A0] uppercase font-semibold tracking-wider block">
                Destino del Producto
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewProduct({ ...newProduct, is_internal_use: false, category: 'PRODUCTO_TERMINADO' })}
                  className={`px-3 py-2 rounded-sm text-xs font-medium flex items-center justify-center gap-2 border transition-all ${
                    !newProduct.is_internal_use
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600 font-semibold ring-1 ring-emerald-500/30'
                      : 'bg-[#151515] text-[#888888] border-[#2A2A2A] hover:text-[#EAEAEA]'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Venta Comercial</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewProduct({ ...newProduct, is_internal_use: true, category: 'DOTACION_TALLER', sale_price_with_margin: 0 })}
                  className={`px-3 py-2 rounded-sm text-xs font-medium flex items-center justify-center gap-2 border transition-all ${
                    newProduct.is_internal_use
                      ? 'bg-purple-950/50 text-purple-300 border-purple-500 font-semibold ring-1 ring-purple-500/30'
                      : 'bg-[#151515] text-[#888888] border-[#2A2A2A] hover:text-[#EAEAEA]'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5 text-purple-400" />
                  <span>Uso Interno (Prisma Lab)</span>
                </button>
              </div>
              {newProduct.is_internal_use && (
                <p className="text-[10px] text-purple-300/80 bg-purple-950/20 border border-purple-800/30 p-1.5 rounded font-mono">
                  ℹ Destino: Dotación de Taller / Consumo Propio. Se registra contablemente como activo/gasto operativo propio (PUC 152405 / 513505) y su precio de venta queda en $0.
                </p>
              )}
            </div>

            {/* Fecha de Registro / Fabricación */}
            <div className="bg-[#101010] p-2.5 rounded-sm border border-[#2A2A2A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-[#A0A0A0] text-[11px] mb-1 flex items-center justify-between">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Fecha de Fabricación / Registro *</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">Afecta Asiento Contable</span>
                </label>
                <input
                  type="date"
                  required
                  value={normalizeDateInput(newProduct.entry_date)}
                  onChange={(e) => setNewProduct({ ...newProduct, entry_date: e.target.value })}
                  className="w-full bg-[#151515] border border-[#333333] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono text-xs focus:border-emerald-500"
                />
              </div>
              <div className="text-[11px] text-[#A0A0A0] font-mono sm:self-end sm:pb-1">
                Fecha visible: <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(newProduct.entry_date))}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Nombre Producto / Pieza *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Porta Bobinas AMS, Soporte X..."
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Serial / Código (Opcional)</label>
                <input
                  type="text"
                  placeholder={newProduct.is_internal_use ? "Auto (INT-...)" : "Auto (PRD-...)"}
                  value={newProduct.serial}
                  onChange={(e) => setNewProduct({ ...newProduct, serial: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Material</label>
                <select
                  value={newProduct.material_type}
                  onChange={(e) => setNewProduct({ ...newProduct, material_type: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1.5 rounded-sm focus:border-slate-500"
                >
                  <option value="PETG">PETG</option>
                  <option value="PLA">PLA</option>
                  <option value="TPU">TPU</option>
                  <option value="ABS">ABS</option>
                  <option value="ASA">ASA</option>
                  <option value="Pieza 3D">Pieza 3D</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Color</label>
                <input
                  type="text"
                  placeholder="Negro, Blanco..."
                  value={newProduct.color}
                  onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Cantidad Unidades *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newProduct.current_stock_units}
                  onChange={(e) => setNewProduct({ ...newProduct, current_stock_units: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Costo Unitario ($ COP) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="0"
                  value={newProduct.unit_cost_cop}
                  onChange={(e) => setNewProduct({ ...newProduct, unit_cost_cop: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">
                  {newProduct.is_internal_use ? "Precio Venta ($ COP) - Deshabilitado" : "Precio Venta Con Margen ($ COP) *"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={newProduct.is_internal_use}
                  placeholder="0"
                  value={newProduct.is_internal_use ? 0 : newProduct.sale_price_with_margin}
                  onChange={(e) => setNewProduct({ ...newProduct, sale_price_with_margin: e.target.value })}
                  className={`w-full border text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500 ${
                    newProduct.is_internal_use
                      ? 'bg-[#151515] border-[#252525] text-purple-400/80 cursor-not-allowed'
                      : 'bg-[#101010] border-[#2A2A2A]'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Observaciones / Notas</label>
              <textarea
                rows={2}
                placeholder="Detalles sobre la pieza, ubicación en taller, etc..."
                value={newProduct.notes}
                onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500 resize-none"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Guardar Pieza</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Edición Material */}
      {editingMaterial && editMaterialData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEditMaterial} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-lg space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Editar Insumo #{editingMaterial.id}</h3>
              </div>
              <button type="button" onClick={() => setEditingMaterial(null)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Nombre Insumo</label>
                <input
                  type="text"
                  required
                  value={editMaterialData.name}
                  onChange={(e) => setEditMaterialData({ ...editMaterialData, name: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0]">N.° de Artículo (Código)</label>
                  <button
                    type="button"
                    onClick={() => setEditMaterialData(prev => ({
                      ...prev,
                      article_code: predictArticleCode(prev.material_type, prev.color, materials)
                    }))}
                    className="text-[10px] text-emerald-400 hover:underline"
                    title="Calcular según tipo y color"
                  >
                    Auto ({predictArticleCode(editMaterialData.material_type, editMaterialData.color, materials)})
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="ej. PGBL00-01"
                  value={editMaterialData.article_code || ''}
                  onChange={(e) => setEditMaterialData({ ...editMaterialData, article_code: e.target.value.toUpperCase() })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-emerald-400 font-mono font-bold px-3 py-1.5 rounded-sm focus:border-slate-500 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Tipo de Material</label>
                <select
                  value={editMaterialData.material_type}
                  onChange={(e) => setEditMaterialData({ ...editMaterialData, material_type: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm focus:border-slate-500 font-medium"
                >
                  <option value="PETG">PETG</option>
                  <option value="PLA">PLA</option>
                  <option value="TPU">TPU</option>
                  <option value="ABS">ABS</option>
                  <option value="ASA">ASA</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Color</label>
                <input
                  type="text"
                  required
                  value={editMaterialData.color}
                  onChange={(e) => setEditMaterialData({ ...editMaterialData, color: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Fecha de Ingreso</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditMaterialData({ ...editMaterialData, entry_date: getTodayYMD() })}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono"
                  >
                    Hoy
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="DD/MM/AAAA o DD/MM (ej. 27/04)"
                    value={editMaterialData.entry_date || ''}
                    onChange={(e) => setEditMaterialData({ ...editMaterialData, entry_date: e.target.value })}
                    className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] pl-2.5 pr-8 py-1.5 rounded-sm focus:border-slate-500 font-mono text-xs"
                    title="Escribe la fecha (ej. 27/04 o 27/04/2026) o selecciona del calendario"
                  />
                  <input
                    type="date"
                    tabIndex={-1}
                    value={normalizeDateInput(editMaterialData.entry_date)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setEditMaterialData({ ...editMaterialData, entry_date: `${d}/${m}/${y}` });
                      }
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 w-6 h-6 cursor-pointer z-10"
                    title="Abrir calendario"
                  />
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="mt-1 text-[10px] text-[#888888] flex items-center justify-between font-mono">
                  <span>Asignada:</span>
                  <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(editMaterialData.entry_date))}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Stock Inicial (g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={editMaterialData.initial_stock_g}
                    onChange={(e) => handleEditMaterialStockOrCostChange('initial_stock_g', e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-amber-400 mb-1">Salidas / Gastado (g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={editMaterialData.outgoing_stock_g}
                    onChange={(e) => setEditMaterialData({ ...editMaterialData, outgoing_stock_g: e.target.value })}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-amber-400 px-2.5 py-1.5 rounded-sm font-mono focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-emerald-400 font-semibold mb-1">Costo por Gramo ($/g)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={editMaterialData.cost_per_g}
                    onChange={(e) => handleEditMaterialStockOrCostChange('cost_per_g', e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-emerald-500/50 text-emerald-400 font-bold px-2.5 py-1.5 rounded-sm font-mono focus:border-emerald-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Observaciones / Notas</label>
              <textarea
                rows={2}
                placeholder="Observaciones..."
                value={editMaterialData.notes}
                onChange={(e) => setEditMaterialData({ ...editMaterialData, notes: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500 resize-none"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
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

      {/* Modal Nuevo Insumo Papelería / Mantenimiento */}
      {showSupplyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCreateSupply} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-lg space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Nuevo Insumo (Papelería / Mantenimiento)</h3>
              </div>
              <button type="button" onClick={() => setShowSupplyModal(false)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Nombre / Concepto del Insumo</label>
              <input
                type="text"
                required
                placeholder="ej. Caja Kraft de Envío 15x15, Alcohol Isopropílico, Sticker..."
                value={newSupply.name}
                onChange={(e) => setNewSupply({ ...newSupply, name: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Tipo de Insumo</label>
                <select
                  value={newSupply.item_type}
                  onChange={(e) => setNewSupply({ ...newSupply, item_type: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm focus:border-slate-500 font-medium"
                >
                  <option value="PAPELERIA">PAPELERÍA / EMPAQUE</option>
                  <option value="MANTENIMIENTO">MANTENIMIENTO / REPUESTO</option>
                </select>
              </div>

              <div>
                <label className="block text-emerald-400 font-semibold mb-1">Costo Unitario ($ COP)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={newSupply.unit_cost_cop}
                  onChange={(e) => setNewSupply({ ...newSupply, unit_cost_cop: e.target.value })}
                  className="w-full bg-[#101010] border border-emerald-500/40 text-emerald-400 font-bold px-2.5 py-1.5 rounded-sm font-mono focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Stock (Und)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={newSupply.stock_units}
                  onChange={(e) => setNewSupply({ ...newSupply, stock_units: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Fecha Ingreso</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewSupply({ ...newSupply, entry_date: getTodayYMD() })}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono"
                  >
                    Hoy
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="DD/MM/AAAA o DD/MM (ej. 27/04)"
                    value={newSupply.entry_date || ''}
                    onChange={(e) => setNewSupply({ ...newSupply, entry_date: e.target.value })}
                    className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] pl-2.5 pr-8 py-1.5 rounded-sm font-mono text-xs focus:border-slate-500"
                    title="Escribe la fecha o selecciona del calendario"
                  />
                  <input
                    type="date"
                    tabIndex={-1}
                    value={normalizeDateInput(newSupply.entry_date)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setNewSupply({ ...newSupply, entry_date: `${d}/${m}/${y}` });
                      }
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 w-6 h-6 cursor-pointer z-10"
                    title="Abrir calendario"
                  />
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="mt-1 text-[10px] text-[#888888] flex items-center justify-between font-mono">
                  <span>Asignada:</span>
                  <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(newSupply.entry_date))}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Observaciones / Notas</label>
              <textarea
                rows={2}
                placeholder="ej. Embalaje para figuras medianas, costo por uso prorrateado..."
                value={newSupply.notes}
                onChange={(e) => setNewSupply({ ...newSupply, notes: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500 resize-none"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowSupplyModal(false)}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Guardar Insumo</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Edición Insumo Papelería / Mantenimiento */}
      {editingSupply && editSupplyData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEditSupply} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-lg space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Editar Insumo #{editingSupply.id}</h3>
              </div>
              <button type="button" onClick={() => setEditingSupply(null)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Nombre / Concepto</label>
              <input
                type="text"
                required
                value={editSupplyData.name}
                onChange={(e) => setEditSupplyData({ ...editSupplyData, name: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Tipo de Insumo</label>
                <select
                  value={editSupplyData.item_type}
                  onChange={(e) => setEditSupplyData({ ...editSupplyData, item_type: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm focus:border-slate-500 font-medium"
                >
                  <option value="PAPELERIA">PAPELERÍA / EMPAQUE</option>
                  <option value="MANTENIMIENTO">MANTENIMIENTO / REPUESTO</option>
                </select>
              </div>

              <div>
                <label className="block text-emerald-400 font-semibold mb-1">Costo Unitario ($ COP)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={editSupplyData.unit_cost_cop}
                  onChange={(e) => setEditSupplyData({ ...editSupplyData, unit_cost_cop: e.target.value })}
                  className="w-full bg-[#101010] border border-emerald-500/40 text-emerald-400 font-bold px-2.5 py-1.5 rounded-sm font-mono focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Stock Disponible (Und)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={editSupplyData.stock_units}
                  onChange={(e) => setEditSupplyData({ ...editSupplyData, stock_units: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#A0A0A0] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Fecha Ingreso</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditSupplyData({ ...editSupplyData, entry_date: getTodayYMD() })}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono"
                  >
                    Hoy
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="DD/MM/AAAA o DD/MM (ej. 27/04)"
                    value={editSupplyData.entry_date || ''}
                    onChange={(e) => setEditSupplyData({ ...editSupplyData, entry_date: e.target.value })}
                    className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] pl-2.5 pr-8 py-1.5 rounded-sm font-mono text-xs focus:border-slate-500"
                    title="Escribe la fecha o selecciona del calendario"
                  />
                  <input
                    type="date"
                    tabIndex={-1}
                    value={normalizeDateInput(editSupplyData.entry_date)}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setEditSupplyData({ ...editSupplyData, entry_date: `${d}/${m}/${y}` });
                      }
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 w-6 h-6 cursor-pointer z-10"
                    title="Abrir calendario"
                  />
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="mt-1 text-[10px] text-[#888888] flex items-center justify-between font-mono">
                  <span>Asignada:</span>
                  <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(editSupplyData.entry_date))}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Observaciones / Notas</label>
              <textarea
                rows={2}
                placeholder="Observaciones..."
                value={editSupplyData.notes}
                onChange={(e) => setEditSupplyData({ ...editSupplyData, notes: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500 resize-none"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingSupply(null)}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Facturar Producto de Vitrina */}
      {showSellModal && sellProductData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmSell} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-md space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-400">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#EAEAEA] text-sm">Facturar Producto de Vitrina</h3>
                  <span className="text-[10px] text-[#A0A0A0]">Salida inmediata de inventario y generación de factura</span>
                </div>
              </div>
              <button type="button" onClick={() => setShowSellModal(false)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Info del producto */}
            <div className="bg-[#101010] p-3 rounded-sm border border-[#2A2A2A] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-[#EAEAEA]">{sellProductData.name}</span>
                <span className="font-mono text-[10px] text-emerald-400 font-bold">{sellProductData.serial || 'PRD'}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#888888]">
                <span>Material: <strong className="text-[#A0A0A0]">{sellProductData.material_type || '3D'}</strong></span>
                <span>•</span>
                <span>Color: <strong className="text-[#A0A0A0]">{sellProductData.color || 'N/A'}</strong></span>
                <span>•</span>
                <span>En Vitrina: <strong className="text-emerald-400 font-mono">{sellProductData.current_stock_units} unds</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Cantidad a Facturar *</label>
                <input
                  type="number"
                  min="1"
                  max={sellProductData.current_stock_units || 1}
                  required
                  value={sellForm.quantity}
                  onChange={(e) => setSellForm({ ...sellForm, quantity: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500 text-sm"
                />
                <span className="text-[9px] text-[#666666] mt-0.5 block">Disponible: {sellProductData.current_stock_units} unds</span>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Precio Unitario ($ COP) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={sellForm.unit_price}
                  onChange={(e) => setSellForm({ ...sellForm, unit_price: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-emerald-400 font-bold px-3 py-1.5 rounded-sm font-mono focus:border-slate-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1 font-medium">Cliente (Opcional)</label>
              <select
                value={sellForm.customer_id}
                onChange={(e) => setSellForm({ ...sellForm, customer_id: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm focus:border-slate-500"
              >
                <option value="">Consumidor Final / Mostrador</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.tax_id ? `(${c.tax_id})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-[#101010] p-2.5 rounded-sm border border-[#2A2A2A] space-y-1">
              <label className="block text-[#A0A0A0] text-[11px] mb-1 flex items-center justify-between">
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Fecha de Facturación y Salida *</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Afecta Asientos Contables</span>
              </label>
              <input
                type="date"
                required
                value={normalizeDateInput(sellForm.sale_date)}
                onChange={(e) => setSellForm({ ...sellForm, sale_date: e.target.value })}
                className="w-full bg-[#151515] border border-[#333333] text-[#EAEAEA] px-2.5 py-1.5 rounded-sm font-mono text-xs focus:border-emerald-500"
              />
              <div className="text-[10px] text-[#888888] font-mono">
                Fecha de asiento: <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(sellForm.sale_date))}</span>
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1 font-medium">Observaciones de Facturación</label>
              <input
                type="text"
                value={sellForm.notes}
                onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })}
                placeholder="ej. Venta mostrador, pago transferencia..."
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
              />
            </div>

            {/* Total Resumen */}
            <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/30 rounded-sm flex items-center justify-between">
              <span className="text-[11px] text-emerald-300 font-medium">Total a Facturar:</span>
              <span className="text-base font-bold font-mono text-emerald-400">
                ${((parseInt(sellForm.quantity, 10) || 0) * (parseFloat(sellForm.unit_price) || 0)).toLocaleString('es-CO')} COP
              </span>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowSellModal(false)}
                disabled={sellingLoading}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sellingLoading || (sellProductData.current_stock_units <= 0)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{sellingLoading ? 'Facturando...' : 'Generar Factura'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Modificar Fecha de Producto y Sincronizar Contabilidad */}
      {editingProductDate && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSaveProductDate} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-sm space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#EAEAEA] text-sm">Modificar Fecha</h3>
              </div>
              <button type="button" onClick={() => setEditingProductDate(null)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="bg-[#101010] p-2.5 rounded-sm border border-[#2A2A2A] space-y-1">
              <div className="text-xs font-semibold text-[#EAEAEA]">{editingProductDate.name}</div>
              <div className="text-[10px] font-mono text-emerald-400">{editingProductDate.serial || 'Sin serial'}</div>
              <p className="text-[10px] text-[#888888] pt-1 leading-relaxed">
                Al cambiar la fecha, los registros contables del Libro Diario vinculados a esta pieza se actualizarán automáticamente a la misma fecha.
              </p>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1 font-medium">Nueva Fecha *</label>
              <input
                type="date"
                required
                value={normalizeDateInput(newProductDateVal)}
                onChange={(e) => setNewProductDateVal(e.target.value)}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-emerald-500 text-sm"
              />
              <div className="text-[10px] text-[#888888] mt-1 font-mono">
                Fecha visible: <span className="text-emerald-400 font-semibold">{formatDate(normalizeDateInput(newProductDateVal))}</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingProductDate(null)}
                className="flex-1 py-2 bg-[#101010] border border-[#2A2A2A] text-[#A0A0A0] hover:text-[#EAEAEA] font-medium rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-sm transition-colors"
              >
                Guardar y Sincronizar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
