import React, { 
  useState, 
  useEffect 
} from 'react';
import { 
  FileText, 
  Plus, 
  RefreshCw, 
  User, 
  Printer, 
  X, 
  Users, 
  Calculator, 
  CheckCircle2,
  Search,
  RotateCcw,
  Edit3,
  Trash2,
  Save,
  Filter,
  Wrench,
  Box,
  Layers,
  Copy,
  Percent,
  Package
} from 'lucide-react';
import { toast } from 'sonner';
import { salesService, inventoryService, configService } from '../services/api';
import InvoicePrintView from '../components/InvoicePrintView';
import DateRangeFilter, { isDateInRange, formatDate } from '../components/DateRangeFilter';
import { useAuth } from '../context/AuthContext';

export default function Sales() {
  const { canDelete, canEdit, isReadOnly } = useAuth();
  const [activeSubtab, setActiveSubtab] = useState(() => {
    return localStorage.getItem('prisma_lab_subtab_sales') || 'documents';
  });

  useEffect(() => {
    localStorage.setItem('prisma_lab_subtab_sales', activeSubtab);
  }, [activeSubtab]);

  const [documents, setDocuments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocForPrint, setSelectedDocForPrint] = useState(null);

  // Filtros de Documentos
  const [docSearch, setDocSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');
  const [docStatusFilter, setDocStatusFilter] = useState('ALL');
  const [docStartDate, setDocStartDate] = useState('');
  const [docEndDate, setDocEndDate] = useState('');

  // Búsqueda de clientes
  const [customerSearch, setCustomerSearch] = useState('');

  // Modal Nuevo Cliente
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });

  // Modal Edición Cliente
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editCustomerData, setEditCustomerData] = useState({ name: '', email: '', phone: '', address: '' });

  const createDefaultPlate = (num = 1) => ({
    id: Date.now() + Math.random(),
    name: `Placa ${num}`,
    quantity: 1,
    hours: 0,
    minutes: 45,
    filaments: [
      { id: Date.now() + Math.random(), material_id: '', article_code: '', type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
    ]
  });

  const DEFAULT_QUOTE_FORM = {
    customer_id: '',
    project_name: '',
    is_internal_use: false,
    plates: [
      {
        id: 1,
        name: 'Placa 1',
        quantity: 1,
        hours: 0,
        minutes: 45,
        filaments: [
          { id: 1, material_id: '', article_code: '', type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
        ]
      }
    ],
    include_labor: true, // Siempre seleccionado por defecto (1.90%)
    labor_cost: 0,
    additional_cost: 0,
    discount_percentage: 0,
    discount_amount: 0,
    observations: ''
  };

  // Formulario del Cotizador Estilo Excel con persistencia en localStorage
  const [quoteForm, setQuoteForm] = useState(() => {
    try {
      const saved = localStorage.getItem('prisma_lab_draft_quote_form');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migración automática para datos guardados con la versión previa de placa única
        if (!parsed.plates || !Array.isArray(parsed.plates) || parsed.plates.length === 0) {
          parsed.plates = [
            {
              id: 1,
              name: parsed.project_name || 'Placa 1',
              quantity: parsed.quantity || 1,
              hours: parsed.hours ?? 0,
              minutes: parsed.minutes ?? 45,
              filaments: parsed.filaments && parsed.filaments.length > 0 ? parsed.filaments : [
                { id: 1, material_id: '', article_code: '', type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
              ]
            }
          ];
        }
        return { ...DEFAULT_QUOTE_FORM, ...parsed };
      }
    } catch (e) {
      console.error('Error cargando borrador de cotización:', e);
    }
    return DEFAULT_QUOTE_FORM;
  });

  useEffect(() => {
    try {
      localStorage.setItem('prisma_lab_draft_quote_form', JSON.stringify(quoteForm));
    } catch (e) {}
  }, [quoteForm]);

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

  // Obtener costo por gramo de un filamento específico (o de bobina específica en inventario)
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

  // Buscar automáticamente la mejor bobina disponible según tipo y color
  const findBestSpool = (type, color) => {
    const c = (color || '').trim().toLowerCase();
    const t = (type || '').trim().toLowerCase();
    if (!c) return null;

    // 1. Coincidencia exacta de tipo + color con stock > 0
    let best = materials.find(m => 
      (m.material_type || '').trim().toLowerCase() === t &&
      (m.color || '').trim().toLowerCase() === c &&
      (m.current_stock_g || 0) > 0
    );
    if (best) return best;

    // 2. Coincidencia de color con stock > 0
    best = materials.find(m => 
      (m.color || '').trim().toLowerCase() === c &&
      (m.current_stock_g || 0) > 0
    );
    if (best) return best;

    // 3. Coincidencia parcial de color con stock > 0
    best = materials.find(m => 
      (m.color || '').trim().toLowerCase().includes(c) &&
      (m.current_stock_g || 0) > 0
    );
    if (best) return best;

    // 4. Coincidencia exacta de tipo + color aunque esté en 0g
    best = materials.find(m => 
      (m.material_type || '').trim().toLowerCase() === t &&
      (m.color || '').trim().toLowerCase() === c
    );
    if (best) return best;

    // 5. Coincidencia de color cualquiera
    best = materials.find(m => (m.color || '').trim().toLowerCase() === c);
    return best || null;
  };

  // Auto-vincular bobina de inventario al cargar materiales si el usuario ya tenía un color seleccionado
  useEffect(() => {
    if (!materials || materials.length === 0) return;
    setQuoteForm(prev => {
      let changed = false;
      const newPlates = (prev.plates || []).map(p => {
        const newFils = (p.filaments || []).map(f => {
          if (!f.material_id && f.color && !f.unlinkedByUser) {
            const best = findBestSpool(f.type, f.color);
            if (best) {
              changed = true;
              return { ...f, material_id: best.id, article_code: best.article_code || '' };
            }
          }
          return f;
        });
        return { ...p, filaments: newFils };
      });
      return changed ? { ...prev, plates: newPlates } : prev;
    });
  }, [materials]);

  // Manejo de Placas Dinámicas
  const handleAddPlate = () => {
    setQuoteForm(prev => {
      const nextNum = (prev.plates || []).length + 1;
      const newPlate = {
        id: Date.now() + Math.random(),
        name: `Placa ${nextNum}`,
        quantity: 1,
        hours: 0,
        minutes: 45,
        filaments: [
          { id: Date.now() + Math.random(), material_id: '', article_code: '', type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
        ]
      };
      return {
        ...prev,
        plates: [...(prev.plates || []), newPlate]
      };
    });
    toast.success('Nueva placa agregada a la cotización');
  };

  const handleDuplicatePlate = (plateId) => {
    setQuoteForm(prev => {
      const target = (prev.plates || []).find(p => p.id === plateId);
      if (!target) return prev;
      const nextNum = (prev.plates || []).length + 1;
      const duplicated = {
        ...target,
        id: Date.now() + Math.random(),
        name: `${target.name} (Copia)`,
        filaments: (target.filaments || []).map(f => ({ ...f, id: Date.now() + Math.random() }))
      };
      return {
        ...prev,
        plates: [...(prev.plates || []), duplicated]
      };
    });
    toast.success('Placa duplicada exitosamente');
  };

  const handleRemovePlate = (plateId) => {
    if ((quoteForm.plates || []).length <= 1) {
      toast.warning('Debe haber al menos una placa en la cotización');
      return;
    }
    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).filter(p => p.id !== plateId)
    }));
    toast.info('Placa eliminada');
  };

  const handlePlateChange = (plateId, field, value) => {
    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).map(p => p.id === plateId ? { ...p, [field]: value } : p)
    }));
  };

  // Manejo de Filamentos por Placa
  const handleAddFilamentToPlate = (plateId) => {
    const defaultType = 'PLA';
    const colors = getColorsForType(defaultType);
    const defaultColor = colors.length > 0 ? colors[0].color : 'Negro';
    const bestSpool = findBestSpool(defaultType, defaultColor);
    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).map(p => {
        if (p.id !== plateId) return p;
        return {
          ...p,
          filaments: [
            ...(p.filaments || []),
            { 
              id: Date.now() + Math.random(), 
              material_id: bestSpool ? bestSpool.id : '', 
              article_code: bestSpool ? (bestSpool.article_code || '') : '', 
              type: defaultType, 
              color: defaultColor, 
              grams: 0.0, 
              isCustomColor: false,
              unlinkedByUser: false,
              showAllSpools: false
            }
          ]
        };
      })
    }));
  };

  const handleRemoveFilamentFromPlate = (plateId, filId) => {
    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).map(p => {
        if (p.id !== plateId) return p;
        if ((p.filaments || []).length <= 1) {
          toast.warning('Debe haber al menos un filamento en la placa');
          return p;
        }
        return {
          ...p,
          filaments: (p.filaments || []).filter(f => f.id !== filId)
        };
      })
    }));
  };

  // Asignar bobina específica de inventario a un filamento de placa
  const handleSelectMaterialSpoolInPlate = (plateId, filId, matId) => {
    if (!matId) {
      setQuoteForm(prev => ({
        ...prev,
        plates: (prev.plates || []).map(p => {
          if (p.id !== plateId) return p;
          return {
            ...p,
            filaments: (p.filaments || []).map(f => f.id === filId ? {
              ...f,
              material_id: '',
              article_code: '',
              unlinkedByUser: true
            } : f)
          };
        })
      }));
      return;
    }

    const selectedMat = materials.find(m => String(m.id) === String(matId));
    if (!selectedMat) return;

    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).map(p => {
        if (p.id !== plateId) return p;
        return {
          ...p,
          filaments: (p.filaments || []).map(f => f.id === filId ? {
            ...f,
            material_id: selectedMat.id,
            article_code: selectedMat.article_code || '',
            type: selectedMat.material_type || f.type,
            color: selectedMat.color || f.color,
            isCustomColor: false,
            unlinkedByUser: false
          } : f)
        };
      })
    }));
  };

  const handleFilamentTypeChangeInPlate = (plateId, filId, newType) => {
    const colors = getColorsForType(newType);
    const firstColor = colors.length > 0 ? colors[0].color : 'Blanco';
    const bestSpool = findBestSpool(newType, firstColor);
    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).map(p => {
        if (p.id !== plateId) return p;
        return {
          ...p,
          filaments: (p.filaments || []).map(f => f.id === filId ? {
            ...f,
            material_id: bestSpool ? bestSpool.id : '',
            article_code: bestSpool ? (bestSpool.article_code || '') : '',
            type: newType,
            color: firstColor,
            isCustomColor: false,
            unlinkedByUser: false,
            showAllSpools: false
          } : f)
        };
      })
    }));
  };

  const handleFilamentChangeInPlate = (plateId, filId, field, value) => {
    setQuoteForm(prev => ({
      ...prev,
      plates: (prev.plates || []).map(p => {
        if (p.id !== plateId) return p;
        return {
          ...p,
          filaments: (p.filaments || []).map(f => {
            if (f.id !== filId) return f;
            const updated = { ...f, [field]: value };
            if (field === 'color') {
              const bestSpool = findBestSpool(updated.type, value);
              if (bestSpool) {
                updated.material_id = bestSpool.id;
                updated.article_code = bestSpool.article_code || '';
              } else {
                updated.material_id = '';
                updated.article_code = '';
              }
              updated.unlinkedByUser = false;
              updated.showAllSpools = false;
            }
            return updated;
          })
        };
      })
    }));
  };

  const loadSalesData = async () => {
    setLoading(true);
    try {
      const [docsRes, custRes, matsRes, suppliesRes] = await Promise.all([
        salesService.getDocuments(),
        salesService.getCustomers(),
        inventoryService.getMaterials(),
        inventoryService.getAdditionalSupplies().catch(() => ({ data: [] }))
      ]);
      setDocuments(docsRes.data || []);
      setCustomers(custRes.data || []);
      setMaterials(matsRes.data || []);
      setSupplies(suppliesRes.data || []);
    } catch (err) {
      console.error('Error cargando ventas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSalesData();
  }, []);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    try {
      const res = await salesService.createCustomer(newCustomer);
      toast.success(`Cliente '${newCustomer.name}' registrado exitosamente`);
      setShowCustomerModal(false);
      
      // Autoseleccionar el cliente recién creado si estamos en el cotizador
      if (res.data && res.data.id) {
        setQuoteForm(prev => ({ ...prev, customer_id: res.data.id }));
      }

      setNewCustomer({ name: '', email: '', phone: '', address: '' });
      loadSalesData();
    } catch (err) {
      toast.error('Error al registrar cliente');
    }
  };

  const handleDeleteCustomer = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar al cliente '${name}'?`)) return;
    try {
      await salesService.deleteCustomer(id);
      toast.success(`Cliente '${name}' eliminado`);
      loadSalesData();
    } catch (err) {
      toast.error('Error eliminando cliente');
    }
  };

  const handleOpenEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setEditCustomerData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || ''
    });
  };

  const handleSaveEditCustomer = async (e) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      await salesService.updateCustomer(editingCustomer.id, editCustomerData);
      toast.success(`Cliente '${editCustomerData.name}' actualizado`);
      setEditingCustomer(null);
      loadSalesData();
    } catch (err) {
      toast.error('Error actualizando cliente');
    }
  };

  const handleConvertToInvoice = async (docId, docNum) => {
    try {
      await salesService.convertToInvoice(docId);
      toast.success(`Factura ${docNum} creada y Asiento Contable registrado`);
      loadSalesData();
    } catch (err) {
      toast.error('Error convirtiendo a factura');
    }
  };

  const handleDeleteDocument = async (id, docNumber) => {
    if (!window.confirm(`¿Estás seguro de eliminar el documento ${docNumber}? Esta acción no se puede deshacer.`)) return;
    try {
      await salesService.deleteDocument(id);
      toast.success(`Documento ${docNumber} eliminado`);
      loadSalesData();
    } catch (err) {
      toast.error('Error al eliminar documento');
    }
  };

  // Cálculo en tiempo real para el Cotizador Multi-Placa Estilo Excel
  const calculateQuoteTotals = () => {
    const plates = quoteForm.plates && quoteForm.plates.length > 0 ? quoteForm.plates : [createDefaultPlate(1)];

    // 1. Calcular costos directos base por cada placa
    const platesCalculations = plates.map((p, idx) => {
      const pHours = (parseFloat(p.hours) || 0) + ((parseFloat(p.minutes) || 0) / 60);
      const pQty = parseInt(p.quantity, 10) || 1;

      let pGrams = 0;
      let pMatCost = 0;

      (p.filaments || []).forEach(fil => {
        const grams = parseFloat(fil.grams) || 0;
        if ((fil.type || fil.material_id) && grams > 0) {
          pGrams += grams;
          const costPerG = getFilamentCost(fil.type, fil.color, fil.material_id);
          pMatCost += grams * costPerG;
        }
      });

      const pEnergyCost = pHours * 0.15 * 763.2; // kWh
      const pDeprecCost = pHours * 678.0;         // Depreciación impresora
      const pDirectCost = pMatCost + pEnergyCost + pDeprecCost;

      return {
        id: p.id,
        name: p.name || `Placa ${idx + 1}`,
        pQty,
        pHours,
        pGrams,
        pMatCost,
        pEnergyCost,
        pDeprecCost,
        pDirectCost
      };
    });

    const totalPlatesBaseDirect = platesCalculations.reduce((acc, p) => acc + p.pDirectCost, 0);
    const totalHours = platesCalculations.reduce((acc, p) => acc + p.pHours, 0);
    const totalGrams = platesCalculations.reduce((acc, p) => acc + p.pGrams, 0);
    const totalUnits = platesCalculations.reduce((acc, p) => acc + p.pQty, 0);
    const addCost = parseFloat(quoteForm.additional_cost) || 0;

    const directCost = totalPlatesBaseDirect + addCost;
    // Mano de obra 1.90% si está activa ("Sí"), 0 si no ("No")
    const laborCost = quoteForm.include_labor ? (directCost * 0.019) : 0;
    const totalBatchCost = directCost + laborCost;

    // 2. Distribuir costos adicionales, mano de obra y márgenes por placa
    const platesResult = platesCalculations.map((p) => {
      const weight = totalPlatesBaseDirect > 0 ? (p.pDirectCost / totalPlatesBaseDirect) : (1 / platesCalculations.length);
      const plateAddCost = addCost * weight;
      const plateDirectWithAdd = p.pDirectCost + plateAddCost;
      const plateLaborCost = quoteForm.include_labor ? (plateDirectWithAdd * 0.019) : 0;
      const plateTotalCost = plateDirectWithAdd + plateLaborCost;
      const plateUnitCost = plateTotalCost / p.pQty;

      // Margen según volumen de la placa (o total). Si es Uso Interno, el multiplicador es 1.0 (sin margen comercial)
      const plateMarginMult = quoteForm.is_internal_use ? 1.0 : (p.pQty >= 10 ? 2.2 : p.pQty >= 5 ? 2.5 : 2.8);
      const plateTotalPrice = plateTotalCost * plateMarginMult;
      const plateUnitPrice = plateTotalPrice / p.pQty;

      return {
        ...p,
        weight,
        plateAddCost,
        plateLaborCost,
        plateTotalCost,
        plateUnitCost,
        plateMarginMult,
        plateUnitPrice,
        plateTotalPrice
      };
    });

    const subtotal = platesResult.reduce((acc, p) => acc + p.plateTotalPrice, 0);
    const discPct = parseFloat(quoteForm.discount_percentage) || 0;
    let discAmt = parseFloat(quoteForm.discount_amount) || 0;
    if (discPct > 0) {
      discAmt = (subtotal * discPct) / 100;
    }
    const totalPrice = Math.max(0, subtotal - discAmt);
    const unitCost = totalUnits > 0 ? totalBatchCost / totalUnits : 0;
    const unitPrice = totalUnits > 0 ? totalPrice / totalUnits : 0;

    return {
      totalHours: totalHours.toFixed(2),
      totalGrams,
      totalUnits,
      matCost: platesCalculations.reduce((acc, p) => acc + p.pMatCost, 0),
      energyCost: platesCalculations.reduce((acc, p) => acc + p.pEnergyCost, 0),
      depreciationCost: platesCalculations.reduce((acc, p) => acc + p.pDeprecCost, 0),
      addCost,
      laborCost,
      totalBatchCost,
      unitCost,
      unitPrice,
      subtotal,
      discountPercentage: discPct,
      discountAmount: discAmt,
      totalPrice,
      plates: platesResult
    };
  };

  const handleGenerateQuoteOrInvoice = async (docType) => {
    const plates = quoteForm.plates && quoteForm.plates.length > 0 ? quoteForm.plates : [createDefaultPlate(1)];

    const totals = calculateQuoteTotals();
    const docPrefix = docType === 'FACTURA' ? 'FAC' : 'COT';
    const randomNum = Math.floor(100 + Math.random() * 900);
    const docNumber = `${docPrefix}-${Date.now().toString().slice(-4)}${randomNum}`;

    const items = totals.plates.map((p, idx) => {
      let itemName = p.name ? p.name.trim() : `Placa ${idx + 1}`;
      if (quoteForm.project_name && quoteForm.project_name.trim()) {
        const proj = quoteForm.project_name.trim();
        itemName = plates.length > 1 ? `${proj} - ${itemName}` : proj;
      }
      return {
        product_name: itemName,
        quantity: p.pQty,
        unit_grams: parseFloat((p.pGrams / p.pQty).toFixed(2)) || 0,
        print_hours: parseFloat((p.pHours / p.pQty).toFixed(2)) || 0,
        unit_cost: p.plateUnitCost,
        unit_price: p.plateUnitPrice,
        total_price: p.plateTotalPrice
      };
    });

    const isInternal = Boolean(quoteForm.is_internal_use);
    const payload = {
      doc_number: docNumber,
      doc_type: docType,
      customer_id: quoteForm.customer_id ? parseInt(quoteForm.customer_id, 10) : null,
      subtotal: totals.subtotal,
      discount: totals.discountAmount,
      tax: 0.0,
      total: totals.totalPrice,
      status: docType === 'FACTURA' ? 'INVOICED' : 'QUOTED',
      is_internal_use: isInternal,
      items
    };

    try {
      const res = await salesService.createDocument(payload);
      const internalMsg = isInternal ? ' (Enviado al apartado No a la Venta)' : '';
      toast.success(`${docType === 'FACTURA' ? 'Factura' : 'Cotización'} ${docNumber} generada (${items.length} ${items.length === 1 ? 'ítem' : 'ítems'})${internalMsg}`);
      loadSalesData();
      if (res.data) {
        setSelectedDocForPrint(res.data);
      }
      setActiveSubtab('documents');
    } catch (err) {
      toast.error(`Error generando ${docType.toLowerCase()}`);
    }
  };

  const resetQuoteForm = () => {
    const defaultForm = {
      customer_id: '',
      project_name: '',
      is_internal_use: false,
      plates: [createDefaultPlate(1)],
      include_labor: true,
      labor_cost: 0,
      additional_cost: 0,
      discount_percentage: 0,
      discount_amount: 0,
      observations: ''
    };
    setQuoteForm(defaultForm);
    try {
      localStorage.removeItem('prisma_lab_draft_quote_form');
    } catch (e) {}
    toast.info('Formulario limpiado');
  };

  const filteredDocuments = documents.filter((doc) => {
    const q = docSearch.toLowerCase().trim();
    const custName = doc.customer ? doc.customer.name.toLowerCase() : 'cliente general';
    const docNum = (doc.doc_number || '').toLowerCase();
    const docType = (doc.doc_type || '').toLowerCase();
    const status = (doc.status || '').toLowerCase();

    const matchesSearch = !q || docNum.includes(q) || custName.includes(q) || docType.includes(q) || status.includes(q);
    const matchesType = docTypeFilter === 'ALL' || doc.doc_type === docTypeFilter;
    const matchesStatus = docStatusFilter === 'ALL' || doc.status === docStatusFilter;
    const matchesDate = isDateInRange(doc.created_at, docStartDate, docEndDate);

    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase().trim();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });

  const currentTotals = calculateQuoteTotals();

  return (
    <div className="space-y-4">
      {/* Subtabs de Navegación */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-sm border border-[#2A2A2A]">
        <div className="flex items-center gap-1 bg-[#101010] p-1 rounded-sm border border-[#2A2A2A] flex-wrap">
          <button
            onClick={() => setActiveSubtab('documents')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'documents'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" strokeWidth={1.5} /> Cotizaciones & Facturas ({documents.length})
          </button>

          <button
            onClick={() => setActiveSubtab('quote-builder')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'quote-builder'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" strokeWidth={1.5} /> Nueva Cotización (Cotizador)
          </button>

          <button
            onClick={() => setActiveSubtab('customers')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'customers'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Users className="w-3.5 h-3.5" strokeWidth={1.5} /> Directorio de Clientes ({customers.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCustomerModal(true)}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-sm text-xs flex items-center gap-1 transition-colors"
          >
            <User className="w-3.5 h-3.5" strokeWidth={1.5} /> Registrar Cliente
          </button>
          <button
            onClick={loadSalesData}
            className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#101010] border border-[#2A2A2A] rounded-sm text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 1. TABLA HISTÓRICO DE DOCUMENTOS */}
      {activeSubtab === 'documents' && (
        <div className="space-y-3">
          {/* Barra de Búsqueda y Filtros de Documentos */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-sm border border-[#2A2A2A]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por N° doc (COT/FAC), cliente o estado..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm pl-9 pr-8 py-1.5 text-xs text-[#EAEAEA] placeholder-[#666666] focus:outline-none focus:border-slate-500"
              />
              {docSearch && (
                <button
                  onClick={() => setDocSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtro Tipo Documento */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#666666]" />
                <select
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todos los Tipos</option>
                  <option value="COTIZACION" className="bg-[#1A1A1A]">Cotizaciones</option>
                  <option value="FACTURA" className="bg-[#1A1A1A]">Facturas</option>
                </select>
              </div>

              {/* Filtro Estado */}
              <div className="flex items-center gap-1.5 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2.5 py-1">
                <select
                  value={docStatusFilter}
                  onChange={(e) => setDocStatusFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#1A1A1A]">Todos los Estados</option>
                  <option value="QUOTED" className="bg-[#1A1A1A]">QUOTED (Cotizado)</option>
                  <option value="INVOICED" className="bg-[#1A1A1A]">INVOICED (Facturado)</option>
                  <option value="PAID" className="bg-[#1A1A1A]">PAID (Pagado)</option>
                </select>
              </div>

              {/* Filtro de Fechas */}
              <DateRangeFilter
                startDate={docStartDate}
                endDate={docEndDate}
                onChange={({ startDate, endDate }) => {
                  setDocStartDate(startDate);
                  setDocEndDate(endDate);
                }}
              />

              {(docSearch || docTypeFilter !== 'ALL' || docStatusFilter !== 'ALL' || docStartDate || docEndDate) && (
                <button
                  onClick={() => {
                    setDocSearch('');
                    setDocTypeFilter('ALL');
                    setDocStatusFilter('ALL');
                    setDocStartDate('');
                    setDocEndDate('');
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline whitespace-nowrap px-1"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-[#A0A0A0] px-1 flex justify-between">
            <span>
              Mostrando <strong className="text-[#EAEAEA]">{filteredDocuments.length}</strong> de <strong className="text-[#EAEAEA]">{documents.length}</strong> documentos
            </span>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm overflow-hidden">
            {loading ? (
              <p className="p-6 text-center text-xs text-[#A0A0A0]">Cargando...</p>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-[#A0A0A0]">No se encontraron documentos con los filtros seleccionados.</p>
                {documents.length === 0 && (
                  <button
                    onClick={() => setActiveSubtab('quote-builder')}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-sm"
                  >
                    Crear Primera Cotización
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                      <th className="py-2.5 px-3 font-semibold">N° Documento</th>
                      <th className="py-2.5 px-3 font-semibold">Fecha</th>
                      <th className="py-2.5 px-3 font-semibold">Tipo</th>
                      <th className="py-2.5 px-3 font-semibold">Cliente</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Subtotal</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Descuento</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Estado</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2A2A]/50">
                    {filteredDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-[#222222] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">{doc.doc_number}</td>
                        <td className="py-2.5 px-3 font-mono text-[#A0A0A0] text-[11px] whitespace-nowrap">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#EAEAEA]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${doc.doc_type === 'FACTURA' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-300 border border-slate-500/20'}`}>
                              {doc.doc_type}
                            </span>
                            {doc.is_internal_use && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1" title="Orden asignada a Uso Interno (No a la venta)">
                                <Wrench className="w-2.5 h-2.5" /> Uso Interno
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[#A0A0A0]">
                          {doc.customer ? doc.customer.name : 'Cliente General'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#A0A0A0]">${doc.subtotal.toLocaleString('es-CO')}</td>
                        <td className="py-2.5 px-3 text-right">
                          {Number(doc.discount) > 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono font-semibold" title={`Descuento aplicado: -$${Number(doc.discount).toLocaleString('es-CO')}`}>
                              -${Number(doc.discount).toLocaleString('es-CO')}
                            </span>
                          ) : (
                            <span className="text-[#555555] font-mono">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">${doc.total.toLocaleString('es-CO')} COP</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 text-[10px] rounded-sm font-medium ${
                            doc.status === 'PAID' || doc.doc_type === 'FACTURA'
                              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                              : 'text-slate-300 bg-slate-800 border border-slate-700'
                          }`}>
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedDocForPrint(doc)}
                            className="px-2 py-1 bg-[#101010] hover:bg-[#222222] text-[#EAEAEA] rounded-sm text-[10px] border border-[#2A2A2A] flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" strokeWidth={1.5} /> PDF
                          </button>

                          {doc.doc_type === 'COTIZACION' && (
                            <button
                              onClick={() => handleConvertToInvoice(doc.id, doc.doc_number)}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-sm text-[10px]"
                            >
                              Facturar
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => handleDeleteDocument(doc.id, doc.doc_number)}
                              title="Eliminar Documento"
                              className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-sm border border-rose-500/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. COTIZADOR ESTILO EXCEL */}
      {activeSubtab === 'quote-builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
              <h3 className="font-semibold text-[#EAEAEA]">Generador de Cotización / Factura</h3>
              <button
                type="button"
                onClick={resetQuoteForm}
                className="text-[11px] text-[#A0A0A0] hover:text-[#EAEAEA] flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> Limpiar
              </button>
            </div>

            {/* Selección de Cliente y Nombre General del Proyecto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#A0A0A0]">Cliente Asignado</label>
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(true)}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Registrar Nuevo Cliente
                  </button>
                </div>

                <select
                  value={quoteForm.customer_id}
                  onChange={(e) => {
                    const val = e.target.value;
                    const cust = customers.find(c => String(c.id) === String(val));
                    const isInternal = cust && /uso interno|interno|taller|dotacion|dotación|propio|prisma lab/i.test(`${cust.name} ${cust.email || ''}`);
                    setQuoteForm(prev => ({
                      ...prev,
                      customer_id: val,
                      is_internal_use: isInternal ? true : (prev.customer_id ? prev.is_internal_use : false)
                    }));
                  }}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                >
                  <option value="">Cliente General (Sin asociar)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.email ? `(${c.email})` : ''} {c.phone ? `- ${c.phone}` : ''}
                    </option>
                  ))}
                </select>

                {/* Selector de Destino de la Orden / Factura */}
                <div className="pt-2 border-t border-[#222222] flex items-center justify-between">
                  <span className="text-[11px] text-[#A0A0A0]">Destino de la Orden:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuoteForm(prev => ({ ...prev, is_internal_use: false }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                        !quoteForm.is_internal_use
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                          : 'bg-[#151515] text-[#777] border-[#2A2A2A] hover:text-[#AAA]'
                      }`}
                    >
                      🏪 Venta Comercial
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuoteForm(prev => ({ ...prev, is_internal_use: true }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                        quoteForm.is_internal_use
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                          : 'bg-[#151515] text-[#777] border-[#2A2A2A] hover:text-[#AAA]'
                      }`}
                    >
                      🛠️ Uso Interno (Prisma Lab)
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2">
                <label className="block font-semibold text-[#A0A0A0]">Nombre del Proyecto / Trabajo (General)</label>
                <input
                  type="text"
                  placeholder="Ej: SOPORTE BRAZO ROBÓTICO / PROTOTIPO 3D"
                  value={quoteForm.project_name}
                  onChange={(e) => setQuoteForm({ ...quoteForm, project_name: e.target.value })}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>
            </div>

            {/* Aviso Informativo cuando está en modo Uso Interno */}
            {quoteForm.is_internal_use && (
              <div className="p-3 bg-amber-950/20 border border-amber-500/35 rounded-sm text-amber-200 text-xs flex items-center gap-2.5">
                <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <strong className="text-amber-300 font-semibold">Orden asignada a Uso Interno (Prisma Lab):</strong>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Al generar la factura, la pieza se enviará automáticamente a la sección <strong>"No a la Venta"</strong> en inventario (no saldrá en vitrina para venta) y en contabilidad se asentará estrictamente al <strong>costo de fabricación</strong> ($0 utilidad comercial).
                  </p>
                </div>
              </div>
            )}

            {/* Header de Placas con Botón Agregar Placa */}
            <div className="flex items-center justify-between bg-[#151515] p-3 rounded-sm border border-[#2A2A2A]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-[#EAEAEA]">
                  Placas / Bandejas de Impresión ({quoteForm.plates?.length || 1})
                </span>
                <span className="text-[10px] text-[#A0A0A0] bg-[#1A1A1A] px-2 py-0.5 rounded border border-[#2A2A2A]">
                  Total: {currentTotals.totalUnits} {currentTotals.totalUnits === 1 ? 'unidad' : 'unidades'} • {currentTotals.totalHours}h
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddPlate}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-sm text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Otra Placa
              </button>
            </div>

            {/* Listado de Placas */}
            <div className="space-y-4">
              {(quoteForm.plates || []).map((plate, pIdx) => {
                const pCalc = currentTotals.plates?.find(cp => cp.id === plate.id) || currentTotals.plates?.[pIdx];
                return (
                  <div 
                    key={plate.id || pIdx} 
                    className="bg-[#121212] border border-[#2A2A2A] rounded-sm p-4 space-y-3.5 relative transition-all hover:border-[#383838]"
                  >
                    {/* Cabecera de la Placa */}
                    <div className="flex items-center justify-between border-b border-[#222222] pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-bold font-mono">
                          Placa {pIdx + 1}
                        </span>
                        {pCalc && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#A0A0A0]">
                            <span className="bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                              {plate.quantity || 1} und
                            </span>
                            <span className="bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                              {pCalc.pHours.toFixed(2)}h
                            </span>
                            <span className="bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                              {pCalc.pGrams.toFixed(1)}g
                            </span>
                            <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold">
                              ${pCalc.plateTotalPrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDuplicatePlate(plate.id)}
                          className="px-2 py-1 bg-[#1A1A1A] hover:bg-[#252525] text-slate-300 hover:text-white rounded text-[11px] border border-[#2A2A2A] flex items-center gap-1 transition-colors"
                          title="Duplicar esta placa con sus parámetros y filamentos"
                        >
                          <Copy className="w-3 h-3" /> Duplicar
                        </button>
                        {(quoteForm.plates || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePlate(plate.id)}
                            className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded border border-rose-500/20 transition-colors"
                            title="Eliminar esta placa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Datos de la Placa: Nombre y Cantidad */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] text-[#A0A0A0] mb-1">
                          Nombre Pieza / Placa <span className="text-slate-500">(ej: Base Soporte, Tapa, etc.)</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={`Placa ${pIdx + 1}`}
                          value={plate.name}
                          onChange={(e) => handlePlateChange(plate.id, 'name', e.target.value)}
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#A0A0A0] mb-1">Cantidad Unidades</label>
                        <input
                          type="number"
                          min="1"
                          value={plate.quantity}
                          onChange={(e) => handlePlateChange(plate.id, 'quantity', e.target.value)}
                          onBlur={() => {
                            const parsed = parseInt(plate.quantity, 10);
                            if (isNaN(parsed) || parsed < 1) handlePlateChange(plate.id, 'quantity', 1);
                            else handlePlateChange(plate.id, 'quantity', parsed);
                          }}
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono text-xs"
                        />
                      </div>
                    </div>

                    {/* Tiempo de Impresión de la Placa */}
                    <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#A0A0A0]">Tiempo de Impresión</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {pCalc ? `${pCalc.pHours.toFixed(2)} horas estimadas` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#666666]">Horas (H)</label>
                          <input
                            type="number"
                            min="0"
                            value={plate.hours}
                            onChange={(e) => handlePlateChange(plate.id, 'hours', e.target.value)}
                            onBlur={() => {
                              const parsed = parseInt(plate.hours, 10);
                              if (isNaN(parsed) || parsed < 0) handlePlateChange(plate.id, 'hours', 0);
                              else handlePlateChange(plate.id, 'hours', parsed);
                            }}
                            className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1 rounded-sm font-mono focus:border-slate-500 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#666666]">Minutos (Min)</label>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={plate.minutes}
                            onChange={(e) => handlePlateChange(plate.id, 'minutes', e.target.value)}
                            onBlur={() => {
                              const parsed = parseInt(plate.minutes, 10);
                              if (isNaN(parsed) || parsed < 0) handlePlateChange(plate.id, 'minutes', 0);
                              else handlePlateChange(plate.id, 'minutes', Math.min(59, parsed));
                            }}
                            className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1 rounded-sm font-mono focus:border-slate-500 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Filamentos Utilizados en esta Placa */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#A0A0A0]">Filamentos Utilizados en Placa {pIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleAddFilamentToPlate(plate.id)}
                          className="px-2 py-0.5 bg-[#1A1A1A] hover:bg-[#222222] text-emerald-400 border border-[#2A2A2A] rounded-sm text-[10px] font-medium flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Agregar Filamento
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {(plate.filaments || []).map((fil, filIdx) => {
                          const selectedMat = fil.material_id ? materials.find(m => String(m.id) === String(fil.material_id)) : null;
                          const colorsForType = getColorsForType(fil.type);
                          const unitCost = getFilamentCost(fil.type, fil.color, fil.material_id);
                          const subtotalCost = unitCost * (parseFloat(fil.grams) || 0);
                          const neededGrams = (parseFloat(fil.grams) || 0) * (parseInt(plate.quantity, 10) || 1);
                          const availStock = selectedMat ? (selectedMat.current_stock_g || 0) : null;

                          // Filtrar bobinas que coincidan con el color seleccionado
                          const targetColor = (fil.color || '').trim().toLowerCase();
                          const targetType = (fil.type || '').trim().toLowerCase();

                          const matchingColorSpools = materials.filter(m => {
                            if (!targetColor) return true;
                            const mc = (m.color || '').trim().toLowerCase();
                            return mc === targetColor || mc.includes(targetColor) || targetColor.includes(mc);
                          });

                          const sortedColorSpools = [...matchingColorSpools].sort((a, b) => {
                            const aTypeMatch = (a.material_type || '').trim().toLowerCase() === targetType ? 1 : 0;
                            const bTypeMatch = (b.material_type || '').trim().toLowerCase() === targetType ? 1 : 0;
                            const aStock = (a.current_stock_g || 0);
                            const bStock = (b.current_stock_g || 0);
                            const aHasStock = aStock > 0 ? 1 : 0;
                            const bHasStock = bStock > 0 ? 1 : 0;

                            if (aTypeMatch !== bTypeMatch) return bTypeMatch - aTypeMatch;
                            if (aHasStock !== bHasStock) return bHasStock - aHasStock;
                            return bStock - aStock;
                          });

                          // Bobinas a mostrar: solo las del color seleccionado por defecto
                          const displaySpools = fil.showAllSpools
                            ? materials
                            : (sortedColorSpools.length > 0
                                ? (selectedMat && !sortedColorSpools.some(m => String(m.id) === String(selectedMat.id))
                                    ? [selectedMat, ...sortedColorSpools]
                                    : sortedColorSpools)
                                : materials);

                          return (
                            <div key={fil.id || filIdx} className="p-2.5 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2 relative">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-semibold text-slate-300">
                                    Filamento {filIdx + 1}
                                  </span>
                                  {fil.article_code && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-700/60 text-blue-300 font-mono font-semibold" title="Código de Artículo">
                                      {fil.article_code}
                                    </span>
                                  )}
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-emerald-400 font-mono font-medium">
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
                                {(plate.filaments || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFilamentFromPlate(plate.id, fil.id)}
                                    className="text-[#666666] hover:text-rose-400 p-0.5 transition-colors"
                                    title="Eliminar filamento"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Selector de Bobina de Inventario por Disponibilidad */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[9px] text-[#A0A0A0] flex items-center gap-1 font-medium">
                                    <Package className="w-3 h-3 text-blue-400" />
                                    <span>Bobina de Inventario</span>
                                    {fil.color && !fil.showAllSpools && sortedColorSpools.length > 0 && (
                                      <span className="text-[8px] px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-mono">
                                        Color: {fil.color} ({sortedColorSpools.length})
                                      </span>
                                    )}
                                  </label>
                                  <div className="flex items-center gap-2">
                                    {materials.length > sortedColorSpools.length && (
                                      <button
                                        type="button"
                                        onClick={() => handleFilamentChangeInPlate(plate.id, fil.id, 'showAllSpools', !fil.showAllSpools)}
                                        className="text-[8px] text-slate-400 hover:text-cyan-300 underline"
                                        title="Alternar entre ver solo este color o todas las bobinas"
                                      >
                                        {fil.showAllSpools ? `Filtrar por ${fil.color}` : `Ver todas (${materials.length})`}
                                      </button>
                                    )}
                                    {fil.material_id && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectMaterialSpoolInPlate(plate.id, fil.id, '')}
                                        className="text-[8px] text-slate-400 hover:text-rose-400 underline"
                                        title="Desvincular bobina y usar selección manual"
                                      >
                                        Desvincular
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <select
                                  value={fil.material_id || ''}
                                  onChange={(e) => {
                                    if (e.target.value === '__ALL__') {
                                      handleFilamentChangeInPlate(plate.id, fil.id, 'showAllSpools', true);
                                    } else {
                                      handleSelectMaterialSpoolInPlate(plate.id, fil.id, e.target.value);
                                    }
                                  }}
                                  className="w-full bg-[#151515] border border-[#303030] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-blue-500 text-[11px] font-mono"
                                >
                                  <option value="">
                                    {fil.color && sortedColorSpools.length > 0 && !fil.showAllSpools
                                      ? `-- Bobinas disponibles para ${fil.color} (${sortedColorSpools.length}) --`
                                      : '-- Seleccionar de inventario (o configurar manual abajo) --'}
                                  </option>
                                  {displaySpools.map((m) => {
                                    const stock = m.current_stock_g || 0;
                                    const code = m.article_code ? `[${m.article_code}] ` : '';
                                    const stockStatus = stock > 0 ? `${stock}g disp.` : 'AGOTADO (0g)';
                                    return (
                                      <option key={m.id} value={m.id}>
                                        {code}{m.name} ({m.material_type} {m.color}) — {stockStatus} (${m.cost_per_g?.toFixed(2)}/g)
                                      </option>
                                    );
                                  })}
                                  {!fil.showAllSpools && materials.length > sortedColorSpools.length && (
                                    <option value="__ALL__">
                                      -- Ver todas las demás bobinas del inventario ({materials.length}) --
                                    </option>
                                  )}
                                </select>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[9px] text-[#666666]">Tipo</label>
                                  <select
                                    value={fil.type}
                                    onChange={(e) => handleFilamentTypeChangeInPlate(plate.id, fil.id, e.target.value)}
                                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-slate-500 text-[11px]"
                                  >
                                    {filamentTypes.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="block text-[9px] text-[#666666]">Color</label>
                                    {colorsForType.length > 0 && !fil.material_id && (
                                      <button
                                        type="button"
                                        onClick={() => handleFilamentChangeInPlate(plate.id, fil.id, 'isCustomColor', !fil.isCustomColor)}
                                        className="text-[8px] text-slate-400 hover:text-emerald-400 underline"
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
                                      onChange={(e) => handleFilamentChangeInPlate(plate.id, fil.id, 'color', e.target.value)}
                                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-slate-500 text-[11px]"
                                    />
                                  ) : (
                                    <select
                                      value={fil.color}
                                      onChange={(e) => handleFilamentChangeInPlate(plate.id, fil.id, 'color', e.target.value)}
                                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm focus:border-slate-500 text-[11px]"
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
                                  <label className="block text-[9px] text-[#666666]">Gramos (g)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={fil.grams}
                                    onChange={(e) => handleFilamentChangeInPlate(plate.id, fil.id, 'grams', e.target.value)}
                                    onBlur={() => {
                                      const parsed = parseFloat(fil.grams);
                                      if (isNaN(parsed) || parsed < 0) handleFilamentChangeInPlate(plate.id, fil.id, 'grams', 0.0);
                                      else handleFilamentChangeInPlate(plate.id, fil.id, 'grams', parsed);
                                    }}
                                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-2 py-1 rounded-sm font-mono focus:border-slate-500 text-[11px]"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[9px] text-[#777777] pt-1 border-t border-[#1F1F1F]">
                                <span>Costo material placa:</span>
                                <span className="font-mono font-medium text-[#EAEAEA]">
                                  ${subtotalCost.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
                                  {(parseInt(plate.quantity, 10) || 1) > 1 && (
                                    <span className="text-[8px] text-slate-400 ml-1">
                                      ({fil.grams}g × {plate.quantity} unds)
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Botón inferior para agregar placa */}
              <button
                type="button"
                onClick={handleAddPlate}
                className="w-full py-2.5 bg-[#121212] hover:bg-[#1C1C1C] border border-dashed border-[#2A2A2A] hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 rounded-sm text-xs font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Agregar Otra Placa (Placa {(quoteForm.plates?.length || 0) + 1})
              </button>
            </div>

            {/* Mano de Obra (Check 1.90% Sí / No) & Costos Adicionales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-2.5 bg-[#101010] border border-[#2A2A2A] rounded-sm flex flex-col justify-between space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[#A0A0A0] font-semibold flex items-center gap-2 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={quoteForm.include_labor}
                      onChange={(e) => setQuoteForm({ ...quoteForm, include_labor: e.target.checked })}
                      className="w-4 h-4 rounded border-[#2A2A2A] bg-[#1A1A1A] text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Mano de Obra (1.90%)</span>
                  </label>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    quoteForm.include_labor 
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50' 
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {quoteForm.include_labor ? 'Sí' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] pt-1 border-t border-[#2A2A2A]/60">
                  <span className="text-[#666666]">Mano de Obra:</span>
                  <span className={`font-mono font-semibold ${quoteForm.include_labor ? 'text-emerald-400' : 'text-[#666666]'}`}>
                    ${currentTotals.laborCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Costo Adicional (COP)</label>
                <input
                  type="number"
                  step="any"
                  value={quoteForm.additional_cost}
                  onChange={(e) => setQuoteForm({ ...quoteForm, additional_cost: e.target.value })}
                  onBlur={() => {
                    const parsed = parseFloat(quoteForm.additional_cost);
                    if (isNaN(parsed) || parsed < 0) setQuoteForm({ ...quoteForm, additional_cost: 0 });
                    else setQuoteForm({ ...quoteForm, additional_cost: parsed });
                  }}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono focus:border-slate-500"
                />

                {/* Selector Papelería / Mantenimiento */}
                {supplies.length > 0 && (
                  <div className="space-y-1 pt-1.5 mt-1 border-t border-[#2A2A2A]">
                    <span className="text-[10px] text-[#A0A0A0] font-medium flex items-center gap-1">
                      <Wrench className="w-3 h-3 text-amber-400" />
                      Agregar Papelería / Mantenimiento:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {supplies.map((sup) => {
                        const cost = sup.unit_cost_cop || 0;
                        return (
                          <button
                            key={sup.id}
                            type="button"
                            onClick={() => {
                              const current = parseFloat(quoteForm.additional_cost) || 0;
                              setQuoteForm(prev => ({
                                ...prev,
                                additional_cost: parseFloat((current + cost).toFixed(2))
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
                            <span>+ {sup.name.length > 18 ? sup.name.substring(0, 18) + '...' : sup.name}</span>
                            <span className="font-mono font-semibold">(${cost.toLocaleString('es-CO')})</span>
                          </button>
                        );
                      })}
                      {parseFloat(quoteForm.additional_cost) > 0 && (
                        <button
                          type="button"
                          onClick={() => setQuoteForm(prev => ({ ...prev, additional_cost: 0 }))}
                          className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Descuento Comercial (Opcional) */}
            <div className="bg-[#101010] p-3.5 rounded-sm border border-[#2A2A2A] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[#EAEAEA] flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-400" /> Descuento Comercial (Opcional)
                </label>
                {(parseFloat(quoteForm.discount_percentage) > 0 || parseFloat(quoteForm.discount_amount) > 0) && (
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-semibold">
                    Desc. Activo: -${currentTotals.discountAmount.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-[#A0A0A0] mb-1">Descuento (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      placeholder="0"
                      value={quoteForm.discount_percentage || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setQuoteForm(prev => ({ ...prev, discount_percentage: val, discount_amount: 0 }));
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
                      value={quoteForm.discount_amount || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setQuoteForm(prev => ({ ...prev, discount_amount: val, discount_percentage: 0 }));
                      }}
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
                    onClick={() => setQuoteForm(prev => ({ ...prev, discount_percentage: pct, discount_amount: 0 }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      parseFloat(quoteForm.discount_percentage) === pct && !parseFloat(quoteForm.discount_amount)
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'bg-[#1A1A1A] text-[#A0A0A0] border border-[#2A2A2A] hover:text-[#EAEAEA]'
                    }`}
                  >
                    {pct === 0 ? 'Sin desc.' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Observaciones / Uso Interno</label>
              <textarea
                rows="2"
                placeholder="Notas especiales del cliente, acabado de superficie..."
                value={quoteForm.observations}
                onChange={(e) => setQuoteForm({ ...quoteForm, observations: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>
          </div>

          {/* Resumen Financiero y Botones Estilo Excel */}
          <div className="lg:col-span-4 bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm flex flex-col justify-between text-xs space-y-4">
            <div>
              <h3 className="font-semibold text-[#EAEAEA] mb-3">Resumen de Cotización</h3>

              <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-[#A0A0A0]">Tiempo Total:</span>
                  <span className="text-[#EAEAEA]">{currentTotals.totalHours} Horas</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#A0A0A0]">Material Total:</span>
                  <span className="text-[#EAEAEA]">{currentTotals.totalGrams.toFixed(1)} g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#A0A0A0]">Total Placas / Ítems:</span>
                  <span className="text-[#EAEAEA]">{currentTotals.plates?.length || 1} ({currentTotals.totalUnits} unds)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#A0A0A0]">Mano de Obra (1.90%):</span>
                  <span className={quoteForm.include_labor ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                    {quoteForm.include_labor ? `Sí ($${currentTotals.laborCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })})` : 'No ($0)'}
                  </span>
                </div>
                {currentTotals.totalUnits > 1 && (
                  <div className="flex justify-between">
                    <span className="text-[#A0A0A0]">Costo Total Lote:</span>
                    <span className="text-[#EAEAEA]">${currentTotals.totalBatchCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#A0A0A0]">Costo Promedio Unitario:</span>
                  <span className="text-[#EAEAEA]">${currentTotals.unitCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP</span>
                </div>
                <div className="flex justify-between border-t border-[#2A2A2A] pt-1">
                  <span className="text-[#A0A0A0]">Precio Promedio Unitario:</span>
                  <span className="text-emerald-400 font-semibold">${currentTotals.unitPrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP</span>
                </div>

                {/* Desglose por Placa si hay más de 1 placa */}
                {currentTotals.plates && currentTotals.plates.length > 1 && (
                  <div className="pt-2 border-t border-[#2A2A2A] space-y-1.5 font-sans">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Desglose por Placa:
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {currentTotals.plates.map((p, idx) => (
                        <div key={p.id || idx} className="flex justify-between items-center bg-[#161616] p-1.5 rounded border border-[#262626] text-[11px]">
                          <div className="truncate max-w-[140px]">
                            <span className="font-semibold text-slate-200">{p.name}</span>
                            <span className="text-[10px] text-slate-400 ml-1">({p.pQty} und • {p.pHours.toFixed(1)}h)</span>
                          </div>
                          <span className="font-mono text-emerald-400 font-semibold">
                            ${p.plateTotalPrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between border-t border-[#2A2A2A] pt-1">
                  <span className="text-[#A0A0A0]">Subtotal:</span>
                  <span className="text-[#EAEAEA] font-semibold">${currentTotals.subtotal.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP</span>
                </div>

                {currentTotals.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3 h-3 text-amber-400" /> Descuento ({currentTotals.discountPercentage > 0 ? `${currentTotals.discountPercentage}%` : 'Monto'}):
                    </span>
                    <span className="font-bold font-mono">
                      -${currentTotals.discountAmount.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 bg-[#101010] border border-[#2A2A2A] rounded-sm mt-3 space-y-1 text-center">
                <span className="text-[10px] text-emerald-400 uppercase font-medium">
                  TOTAL A COTIZAR ({currentTotals.totalUnits} {currentTotals.totalUnits === 1 ? 'und' : 'unds'} en {currentTotals.plates?.length || 1} {currentTotals.plates?.length === 1 ? 'placa' : 'placas'})
                </span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">
                  ${currentTotals.totalPrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                </p>
                {currentTotals.discountAmount > 0 && (
                  <span className="text-[10px] text-amber-400 font-mono block">
                    (Ahorro de ${currentTotals.discountAmount.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP aplicado)
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => handleGenerateQuoteOrInvoice('COTIZACION')}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-sm flex items-center justify-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                <span>Generar Cotización ({currentTotals.plates?.length || 1} {currentTotals.plates?.length === 1 ? 'Placa' : 'Placas'})</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateQuoteOrInvoice('FACTURA')}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-sm flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
                <span>Generar Factura Directa ({currentTotals.plates?.length || 1} {currentTotals.plates?.length === 1 ? 'Placa' : 'Placas'})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. DIRECTORIO DE CLIENTES */}
      {activeSubtab === 'customers' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-sm border border-[#2A2A2A]">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
              <input
                type="text"
                placeholder="Buscar cliente por nombre, correo, teléfono o dirección..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-xs text-[#EAEAEA] pl-9 pr-8 py-1.5 rounded-sm focus:outline-none focus:border-slate-500"
              />
              {customerSearch && (
                <button
                  onClick={() => setCustomerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {customerSearch && (
                <button
                  onClick={() => setCustomerSearch('')}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline px-1"
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={() => setShowCustomerModal(true)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-sm flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Nuevo Cliente
              </button>
            </div>
          </div>

          <div className="text-[11px] text-[#A0A0A0] px-1 flex justify-between">
            <span>
              Mostrando <strong className="text-[#EAEAEA]">{filteredCustomers.length}</strong> de <strong className="text-[#EAEAEA]">{customers.length}</strong> clientes
            </span>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm overflow-hidden">
            {loading ? (
              <p className="p-6 text-center text-xs text-[#A0A0A0]">Cargando directorio de clientes...</p>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-[#A0A0A0]">No se encontraron clientes registrados.</p>
                <button
                  onClick={() => setShowCustomerModal(true)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-sm"
                >
                  Registrar Primer Cliente
                </button>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                      <th className="py-2.5 px-3 font-semibold">ID</th>
                      <th className="py-2.5 px-3 font-semibold">Nombre / Empresa</th>
                      <th className="py-2.5 px-3 font-semibold">Correo Electrónico</th>
                      <th className="py-2.5 px-3 font-semibold">Teléfono</th>
                      <th className="py-2.5 px-3 font-semibold">Dirección</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2A2A]/50">
                    {filteredCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-[#222222]">
                        <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">{c.id}</td>
                        <td className="py-2.5 px-3 font-medium text-[#EAEAEA] break-words">{c.name}</td>
                        <td className="py-2.5 px-3 text-[#A0A0A0] break-all">{c.email || 'Sin correo'}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono">{c.phone || 'Sin teléfono'}</td>
                        <td className="py-2.5 px-3 text-[#666666] break-words">{c.address || 'Sin dirección'}</td>
                        <td className="py-2.5 px-3 text-center flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditCustomer(c)}
                            title="Editar Cliente"
                            className="p-1 bg-[#101010] hover:bg-[#222222] text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm border border-[#2A2A2A]"
                          >
                            <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(c.id, c.name)}
                            title="Eliminar Cliente"
                            className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-sm border border-rose-500/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal PDF Print View */}
      {selectedDocForPrint && (
        <InvoicePrintView
          document={selectedDocForPrint}
          onClose={() => setSelectedDocForPrint(null)}
        />
      )}

      {/* Modal Nuevo Cliente */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCreateCustomer} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-md space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
              <h3 className="font-semibold text-[#EAEAEA]">Nuevo Cliente</h3>
              <button type="button" onClick={() => setShowCustomerModal(false)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Nombre / Empresa *</label>
              <input
                type="text"
                required
                placeholder="Ej. Prisma Studio S.A.S / Juan Pérez"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Correo Electrónico</label>
              <input
                type="email"
                placeholder="cliente@correo.com"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Teléfono</label>
              <input
                type="text"
                placeholder="+57 300 123 4567"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Dirección</label>
              <input
                type="text"
                placeholder="Calle 100 # 15 - 20"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-sm"
              >
                Guardar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Editar Cliente */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEditCustomer} className="bg-[#1A1A1A] border border-[#2A2A2A] p-5 rounded-sm w-full max-w-md space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
              <h3 className="font-semibold text-[#EAEAEA]">Editar Cliente {editingCustomer.id}</h3>
              <button type="button" onClick={() => setEditingCustomer(null)} className="text-[#A0A0A0] hover:text-[#EAEAEA]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Nombre / Empresa *</label>
              <input
                type="text"
                required
                value={editCustomerData.name}
                onChange={(e) => setEditCustomerData({ ...editCustomerData, name: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={editCustomerData.email}
                onChange={(e) => setEditCustomerData({ ...editCustomerData, email: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Teléfono</label>
              <input
                type="text"
                value={editCustomerData.phone}
                onChange={(e) => setEditCustomerData({ ...editCustomerData, phone: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-[#A0A0A0] mb-1">Dirección</label>
              <input
                type="text"
                value={editCustomerData.address}
                onChange={(e) => setEditCustomerData({ ...editCustomerData, address: e.target.value })}
                className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
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
