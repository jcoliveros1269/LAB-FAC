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
  Box
} from 'lucide-react';
import { toast } from 'sonner';
import { salesService, inventoryService, configService } from '../services/api';
import InvoicePrintView from '../components/InvoicePrintView';

export default function Sales() {
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

  // Búsqueda de clientes
  const [customerSearch, setCustomerSearch] = useState('');

  // Modal Nuevo Cliente
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });

  // Modal Edición Cliente
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editCustomerData, setEditCustomerData] = useState({ name: '', email: '', phone: '', address: '' });

  // Formulario del Cotizador Estilo Excel
  const [quoteForm, setQuoteForm] = useState({
    customer_id: '',
    project_name: '',
    quantity: 1,
    hours: 0,
    minutes: 45,
    filaments: [
      { id: 1, type: 'PETG', color: 'Blanco', grams: 50.0, isCustomColor: false }
    ],
    include_labor: true, // Siempre seleccionado por defecto (1.90%)
    labor_cost: 0,
    additional_cost: 0,
    observations: ''
  });

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

  // Obtener costo por gramo de un filamento específico
  const getFilamentCost = (type, color) => {
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
    setQuoteForm(prev => ({
      ...prev,
      filaments: [
        ...prev.filaments,
        { id: Date.now(), type: defaultType, color: defaultColor, grams: 0.0, isCustomColor: false }
      ]
    }));
  };

  const handleRemoveFilament = (id) => {
    if (quoteForm.filaments.length <= 1) {
      toast.warning('Debe haber al menos un filamento en la cotización');
      return;
    }
    setQuoteForm(prev => ({
      ...prev,
      filaments: prev.filaments.filter(f => f.id !== id)
    }));
  };

  const handleFilamentTypeChange = (id, newType) => {
    const colors = getColorsForType(newType);
    const firstColor = colors.length > 0 ? colors[0].color : 'Blanco';
    setQuoteForm(prev => ({
      ...prev,
      filaments: prev.filaments.map(f => f.id === id ? { 
        ...f, 
        type: newType, 
        color: firstColor,
        isCustomColor: false
      } : f)
    }));
  };

  const handleFilamentChange = (id, field, value) => {
    setQuoteForm(prev => ({
      ...prev,
      filaments: prev.filaments.map(f => f.id === id ? { ...f, [field]: value } : f)
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

  // Cálculo en tiempo real para el Cotizador Estilo Excel
  const calculateQuoteTotals = () => {
    const totalHours = (parseFloat(quoteForm.hours) || 0) + ((parseFloat(quoteForm.minutes) || 0) / 60);
    const qty = parseInt(quoteForm.quantity, 10) || 1;

    // Calcular costo y gramos totales de la lista dinámica de filamentos
    let matCost = 0;
    let totalGrams = 0;

    (quoteForm.filaments || []).forEach(fil => {
      const grams = parseFloat(fil.grams) || 0;
      if (fil.type && grams > 0) {
        totalGrams += grams;
        const mat = materials.find(m => 
          m.material_type.toUpperCase() === fil.type.toUpperCase() &&
          (!fil.color || m.color.toLowerCase().includes(fil.color.toLowerCase()))
        );
        const costPerG = mat ? mat.cost_per_g : 65.0;
        matCost += grams * costPerG;
      }
    });

    const energyCost = totalHours * 0.15 * 763.2; // kWh
    const depreciationCost = totalHours * 678.0;  // Depreciación impresora
    const addCost = (parseFloat(quoteForm.additional_cost) || 0);

    const directCost = matCost + energyCost + depreciationCost + addCost;
    // Mano de obra 1.90% si está activa ("Sí"), 0 si no ("No")
    const laborCost = quoteForm.include_labor ? (directCost * 0.019) : 0;

    const unitCost = directCost + laborCost;
    const marginMultiplier = qty >= 10 ? 2.2 : qty >= 5 ? 2.5 : 2.8;
    const unitPrice = unitCost * marginMultiplier;
    const totalPrice = unitPrice * qty;

    return {
      totalHours: totalHours.toFixed(2),
      totalGrams,
      matCost,
      energyCost,
      depreciationCost,
      laborCost,
      addCost,
      unitCost,
      unitPrice,
      totalPrice
    };
  };

  const handleGenerateQuoteOrInvoice = async (docType) => {
    if (!quoteForm.project_name.trim()) {
      toast.error('Por favor ingresa el nombre de la pieza o proyecto.');
      return;
    }

    const totals = calculateQuoteTotals();
    const docPrefix = docType === 'FACTURA' ? 'FAC' : 'COT';
    const randomNum = Math.floor(100 + Math.random() * 900);
    const docNumber = `${docPrefix}-${Date.now().toString().slice(-4)}${randomNum}`;

    const payload = {
      doc_number: docNumber,
      doc_type: docType,
      customer_id: quoteForm.customer_id ? parseInt(quoteForm.customer_id, 10) : null,
      subtotal: totals.totalPrice,
      discount: 0.0,
      tax: 0.0,
      total: totals.totalPrice,
      status: docType === 'FACTURA' ? 'INVOICED' : 'QUOTED',
      items: [
        {
          product_name: quoteForm.project_name,
          quantity: parseInt(quoteForm.quantity, 10) || 1,
          unit_grams: totals.totalGrams || 0,
          print_hours: parseFloat(totals.totalHours),
          unit_cost: totals.unitCost,
          unit_price: totals.unitPrice,
          total_price: totals.totalPrice
        }
      ]
    };

    try {
      const res = await salesService.createDocument(payload);
      toast.success(`${docType === 'FACTURA' ? 'Factura' : 'Cotización'} ${docNumber} generada`);
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
    setQuoteForm({
      customer_id: '',
      project_name: '',
      quantity: 1,
      hours: 0,
      minutes: 45,
      filaments: [
        { id: Date.now(), type: 'PETG', color: 'Blanco', grams: 50.0 }
      ],
      include_labor: true,
      additional_cost: 0,
      observations: ''
    });
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

    return matchesSearch && matchesType && matchesStatus;
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

              {(docSearch || docTypeFilter !== 'ALL' || docStatusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setDocSearch('');
                    setDocTypeFilter('ALL');
                    setDocStatusFilter('ALL');
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 underline whitespace-nowrap px-1"
                >
                  Limpiar
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
                      <th className="py-2.5 px-3 font-semibold">Tipo</th>
                      <th className="py-2.5 px-3 font-semibold">Cliente</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Subtotal</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Estado</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2A2A]/50">
                    {filteredDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-[#222222] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">{doc.doc_number}</td>
                        <td className="py-2.5 px-3 font-medium text-[#EAEAEA]">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${doc.doc_type === 'FACTURA' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-300 border border-slate-500/20'}`}>
                            {doc.doc_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#A0A0A0]">
                          {doc.customer ? doc.customer.name : 'Cliente General'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#A0A0A0]">${doc.subtotal.toLocaleString('es-CO')}</td>
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

                          <button
                            onClick={() => handleDeleteDocument(doc.id, doc.doc_number)}
                            title="Eliminar Documento"
                            className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-sm border border-rose-500/20 transition-colors"
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

            {/* Selección de Cliente */}
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
                onChange={(e) => setQuoteForm({ ...quoteForm, customer_id: e.target.value })}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
              >
                <option value="">Cliente General (Sin asociar)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.email ? `(${c.email})` : ''} {c.phone ? `- ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Datos del Proyecto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#A0A0A0] mb-1">Nombre Pieza / Trabajo</label>
                <input
                  type="text"
                  required
                  placeholder="PRUEBA TEMPERATURA / SOPORTE"
                  value={quoteForm.project_name}
                  onChange={(e) => setQuoteForm({ ...quoteForm, project_name: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1">Cantidad Unidades</label>
                <input
                  type="number"
                  min="1"
                  value={quoteForm.quantity}
                  onChange={(e) => setQuoteForm({ ...quoteForm, quantity: e.target.value })}
                  onBlur={() => {
                    const parsed = parseInt(quoteForm.quantity, 10);
                    if (isNaN(parsed) || parsed < 1) setQuoteForm({ ...quoteForm, quantity: 1 });
                    else setQuoteForm({ ...quoteForm, quantity: parsed });
                  }}
                  className="w-full bg-[#101010] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1.5 rounded-sm font-mono"
                />
              </div>
            </div>

            {/* Tiempo de Impresión (Horas y Minutos) */}
            <div className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2">
              <span className="text-[11px] font-semibold text-[#A0A0A0]">Tiempo de Impresión</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#666666]">Horas (H)</label>
                  <input
                    type="number"
                    min="0"
                    value={quoteForm.hours}
                    onChange={(e) => setQuoteForm({ ...quoteForm, hours: e.target.value })}
                    onBlur={() => {
                      const parsed = parseInt(quoteForm.hours, 10);
                      if (isNaN(parsed) || parsed < 0) setQuoteForm({ ...quoteForm, hours: 0 });
                      else setQuoteForm({ ...quoteForm, hours: parsed });
                    }}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1 rounded-sm font-mono focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#666666]">Minutos (Min)</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={quoteForm.minutes}
                    onChange={(e) => setQuoteForm({ ...quoteForm, minutes: e.target.value })}
                    onBlur={() => {
                      const parsed = parseInt(quoteForm.minutes, 10);
                      if (isNaN(parsed) || parsed < 0) setQuoteForm({ ...quoteForm, minutes: 0 });
                      else setQuoteForm({ ...quoteForm, minutes: Math.min(59, parsed) });
                    }}
                    className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] px-3 py-1 rounded-sm font-mono focus:border-slate-500"
                  />
                </div>
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
                {(quoteForm.filaments || []).map((fil, idx) => {
                  const colorsForType = getColorsForType(fil.type);
                  const unitCost = getFilamentCost(fil.type, fil.color);
                  const subtotalCost = unitCost * (parseFloat(fil.grams) || 0);

                  return (
                    <div key={fil.id || idx} className="p-3 bg-[#101010] border border-[#2A2A2A] rounded-sm space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-300">
                            Filamento {idx + 1}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-emerald-400 font-mono font-medium">
                            ${unitCost.toFixed(2)}/g
                          </span>
                        </div>
                        {quoteForm.filaments.length > 1 && (
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
                            {colorsForType.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleFilamentChange(fil.id, 'isCustomColor', !fil.isCustomColor)}
                                className="text-[9px] text-slate-400 hover:text-emerald-400 underline"
                              >
                                {fil.isCustomColor ? 'Lista' : 'Otro'}
                              </button>
                            )}
                          </div>

                          {fil.isCustomColor || colorsForType.length === 0 ? (
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
                            step="0.1"
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
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                  <span className="text-[#A0A0A0]">Mano de Obra (1.90%):</span>
                  <span className={quoteForm.include_labor ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                    {quoteForm.include_labor ? `Sí ($${currentTotals.laborCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })})` : 'No ($0)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#A0A0A0]">Costo Unitario:</span>
                  <span className="text-[#EAEAEA]">${currentTotals.unitCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-[#2A2A2A] pt-1">
                  <span className="text-[#A0A0A0]">Precio Unitario:</span>
                  <span className="text-emerald-400 font-semibold">${currentTotals.unitPrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="p-4 bg-[#101010] border border-[#2A2A2A] rounded-sm mt-3 space-y-1 text-center">
                <span className="text-[10px] text-emerald-400 uppercase font-medium">TOTAL A COTIZAR ({quoteForm.quantity} und)</span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">
                  ${currentTotals.totalPrice.toLocaleString('es-CO', { maximumFractionDigits: 2 })} COP
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => handleGenerateQuoteOrInvoice('COTIZACION')}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-sm flex items-center justify-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                <span>Generar Cotización</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateQuoteOrInvoice('FACTURA')}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-sm flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
                <span>Generar Factura Directa</span>
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
