import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, DollarSign, RefreshCw, Layers, Search, Plus, X, Filter, List, CheckCircle2, Scale, ChevronDown, ChevronRight, FolderTree, ArrowRight, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { accountingService } from '../services/api';
import DateRangeFilter, { isDateInRange, formatDate } from '../components/DateRangeFilter';

const PUC_HIERARCHY_MAP = {
  // Clases (1 dígito)
  '1': { name: 'ACTIVO', description: 'Bienes y derechos apreciables en dinero de la empresa' },
  '2': { name: 'PASIVO', description: 'Obligaciones y deudas contraídas por la empresa' },
  '3': { name: 'PATRIMONIO', description: 'Aportes de los dueños más utilidades o reservas' },
  '4': { name: 'INGRESOS', description: 'Valores que recibe la empresa por venta de productos o servicios 3D' },
  '5': { name: 'GASTOS', description: 'Flujos de salida de recursos operacionales y administrativos' },
  '6': { name: 'COSTOS DE VENTAS', description: 'Costo directo de producción o adquisición de bienes vendidos' },
  '7': { name: 'COSTOS DE PRODUCCIÓN', description: 'Materia prima, mano de obra y costos indirectos de fabricación' },

  // Grupos (2 dígitos)
  '11': 'Disponible / Efectivo y Equivalentes de Efectivo',
  '12': 'Inversiones',
  '13': 'Deudores / Cuentas Comerciales por Cobrar',
  '14': 'Inventarios (Materias Primas & Productos Terminados)',
  '15': 'Propiedad, Planta y Equipo (Impresoras 3D y Maquinaria)',
  '21': 'Obligaciones Financieras',
  '22': 'Proveedores Nacionales',
  '23': 'Cuentas por Pagar y Costos por Pagar',
  '31': 'Capital Social / Aportes de Socios',
  '36': 'Resultados del Ejercicio (Utilidad o Pérdida)',
  '41': 'Ingresos Operacionales (Ventas de Productos y Servicios 3D)',
  '42': 'Ingresos No Operacionales',
  '51': 'Gastos Operacionales de Administración',
  '52': 'Gastos Operacionales de Ventas',
  '61': 'Costo de Ventas y de Prestación de Servicios',
  '71': 'Materia Prima Directa',
  '72': 'Mano de Obra Directa',
  '73': 'Costos Indirectos de Fabricación',

  // Cuentas Principales (4 dígitos)
  '1105': 'Caja',
  '1110': 'Bancos',
  '1120': 'Cuentas de Ahorro',
  '1305': 'Clientes Nacionales',
  '1405': 'Materias Primas',
  '1430': 'Productos Terminados',
  '1435': 'Mercancías no Fabricadas por la Empresa',
  '1520': 'Maquinaria y Equipo',
  '1524': 'Equipo de Oficina',
  '1528': 'Equipo de Computación y Comunicación',
  '2205': 'Proveedores Nacionales',
  '2335': 'Costos y Gastos por Pagar',
  '3115': 'Aportes Sociales',
  '3605': 'Utilidad del Ejercicio',
  '4135': 'Comercio al por Mayor y al por Menor',
  '5105': 'Gastos de Personal (Mano de Obra)',
  '5135': 'Servicios (Energía Eléctrica, Mantenimiento)',
  '5160': 'Depreciaciones',
  '6135': 'Costo de Ventas y Producción',
};

export default function Accounting() {
  const [activeSubtab, setActiveSubtab] = useState(() => {
    return localStorage.getItem('prisma_lab_subtab_accounting') || 'journal';
  });

  useEffect(() => {
    localStorage.setItem('prisma_lab_subtab_accounting', activeSubtab);
  }, [activeSubtab]);

  const [pucAccounts, setPucAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [cashFlow, setCashFlow] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modo de visualización en Libro Diario Mayor ('journal' = Asientos | 'ledger' = Mayor por Cuentas)
  const [journalViewMode, setJournalViewMode] = useState('journal');

  // Estado para desplegables de códigos PUC en Catálogo
  const [expandedPucCodes, setExpandedPucCodes] = useState({});

  const toggleExpandPuc = (code) => {
    setExpandedPucCodes(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  // Estados de Búsqueda y Filtrado
  const [pucSearch, setPucSearch] = useState('');
  const [pucClassFilter, setPucClassFilter] = useState('all');
  const [journalSearch, setJournalSearch] = useState('');
  const [journalClassFilter, setJournalClassFilter] = useState('all');
  const [journalStartDate, setJournalStartDate] = useState('');
  const [journalEndDate, setJournalEndDate] = useState('');
  const [cashSearch, setCashSearch] = useState('');
  const [cashTypeFilter, setCashTypeFilter] = useState('ALL');
  const [cashStartDate, setCashStartDate] = useState('');
  const [cashEndDate, setCashEndDate] = useState('');

  // Estado para Modal de Nueva Cuenta PUC
  const [showAddPucModal, setShowAddPucModal] = useState(false);
  const [newPucForm, setNewPucForm] = useState({ code: '', name: '', account_type: 'ACTIVO' });
  const [submittingPuc, setSubmittingPuc] = useState(false);

  const handleCreatePuc = async (e) => {
    e.preventDefault();
    if (!newPucForm.code || !newPucForm.name) return;
    setSubmittingPuc(true);
    try {
      await accountingService.createPuc(newPucForm);
      setShowAddPucModal(false);
      setNewPucForm({ code: '', name: '', account_type: 'ACTIVO' });
      await loadAccountingData();
    } catch (err) {
      console.error('Error al crear cuenta PUC:', err);
      alert('Error al guardar la cuenta PUC. Verifique que el código no exista.');
    } finally {
      setSubmittingPuc(false);
    }
  };

  // Estado para Modal de Nuevo Movimiento de Flujo de Caja
  const [showAddCashModal, setShowAddCashModal] = useState(false);
  const [newCashForm, setNewCashForm] = useState({
    type: 'INCOME', // 'INCOME' o 'EXPENSE'
    record_date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Ventas Directas',
    amount: ''
  });
  const [submittingCash, setSubmittingCash] = useState(false);

  const handleCreateCashFlow = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(newCashForm.amount);
    if (!newCashForm.description || isNaN(amountNum) || amountNum <= 0) {
      alert('Ingrese una descripción y un monto válido mayor a 0');
      return;
    }

    setSubmittingCash(true);
    try {
      const payload = {
        record_date: new Date(newCashForm.record_date).toISOString(),
        description: newCashForm.description,
        category: newCashForm.category,
        income: newCashForm.type === 'INCOME' ? amountNum : 0,
        credit: newCashForm.type === 'EXPENSE' ? amountNum : 0,
      };

      await accountingService.createCashFlow(payload);
      setShowAddCashModal(false);
      setNewCashForm({
        type: 'INCOME',
        record_date: new Date().toISOString().split('T')[0],
        description: '',
        category: 'Ventas Directas',
        amount: ''
      });
      await loadAccountingData();
    } catch (err) {
      console.error('Error al registrar movimiento en Flujo de Caja:', err);
      alert('Ocurrió un error al guardar el movimiento en el flujo de caja.');
    } finally {
      setSubmittingCash(false);
    }
  };

  const handleDeletePuc = async (id, code, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar la cuenta PUC ${code} - "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await accountingService.deletePuc(id);
      await loadAccountingData();
    } catch (err) {
      console.error('Error al eliminar cuenta PUC:', err);
      alert(err.response?.data?.detail || 'Ocurrió un error al eliminar la cuenta PUC.');
    }
  };

  const handleDeleteCashFlow = async (id, description) => {
    if (!window.confirm(`¿Estás seguro de eliminar este registro del flujo de caja: "${description}"? Esta acción no se puede deshacer.`)) return;
    try {
      await accountingService.deleteCashFlow(id);
      await loadAccountingData();
    } catch (err) {
      console.error('Error al eliminar registro de flujo de caja:', err);
      alert('Ocurrió un error al eliminar el registro de flujo de caja.');
    }
  };

  const handleDeleteJournalEntry = async (entryNumber) => {
    if (!window.confirm(`¿Estás seguro de eliminar el Asiento Contable #${entryNumber} completo? Se eliminarán todas las partidas asociadas para mantener la partida doble cuadrada.`)) return;
    try {
      await accountingService.deleteJournal(entryNumber);
      await loadAccountingData();
    } catch (err) {
      console.error('Error al eliminar asiento contable:', err);
      alert('Ocurrió un error al eliminar el asiento contable.');
    }
  };

  const loadAccountingData = async () => {
    setLoading(true);
    try {
      const [pucRes, journalRes, cashRes, pnlRes, balRes] = await Promise.all([
        accountingService.getPuc(),
        accountingService.getJournal(),
        accountingService.getCashFlow(),
        accountingService.getPnlReport(),
        accountingService.getBalanceReport(),
      ]);

      setPucAccounts(pucRes.data || []);
      setJournalEntries(journalRes.data || []);
      setCashFlow(cashRes.data || []);
      setPnl(pnlRes.data || null);
      setBalance(balRes.data || null);
    } catch (err) {
      console.error('Error al cargar datos contables:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountingData();
  }, []);

  // Filtrado de PUC
  const filteredPuc = pucAccounts.filter((acc) => {
    const q = pucSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      acc.code.toLowerCase().includes(q) ||
      acc.name.toLowerCase().includes(q) ||
      acc.account_type.toLowerCase().includes(q);

    const matchesClass =
      pucClassFilter === 'all' || acc.code.startsWith(pucClassFilter);

    return matchesSearch && matchesClass;
  });

  // Filtrado de Libro Diario
  const filteredJournal = journalEntries.filter((row) => {
    const q = journalSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      row.puc_code?.toLowerCase().includes(q) ||
      row.account_name?.toLowerCase().includes(q) ||
      row.description?.toLowerCase().includes(q) ||
      String(row.entry_number).includes(q);

    const matchesClass =
      journalClassFilter === 'all' || row.puc_code?.startsWith(journalClassFilter);

    const matchesDate = isDateInRange(row.entry_date, journalStartDate, journalEndDate);

    return matchesSearch && matchesClass && matchesDate;
  });

  const totalJournalDebit = filteredJournal.reduce((sum, r) => sum + (r.debit || 0), 0);
  const totalJournalCredit = filteredJournal.reduce((sum, r) => sum + (r.credit || 0), 0);
  const allJournalDebit = journalEntries.reduce((sum, r) => sum + (r.debit || 0), 0);
  const allJournalCredit = journalEntries.reduce((sum, r) => sum + (r.credit || 0), 0);
  const isJournalBalanced = Math.abs(allJournalDebit - allJournalCredit) < 0.01;

  // Resumen del Libro Mayor (Cuentas T y Balances por Cuenta PUC)
  const mayorSummary = useMemo(() => {
    const accMap = {};
    const sourceEntries = journalEntries.filter(entry =>
      isDateInRange(entry.entry_date, journalStartDate, journalEndDate)
    );
    sourceEntries.forEach(entry => {
      const code = entry.puc_code || 'SIN_PUC';
      if (!accMap[code]) {
        accMap[code] = {
          puc_code: code,
          account_name: entry.account_name || 'Cuenta General',
          total_debit: 0,
          total_credit: 0,
          entries_count: 0
        };
      }
      accMap[code].total_debit += (entry.debit || 0);
      accMap[code].total_credit += (entry.credit || 0);
      accMap[code].entries_count += 1;
    });

    return Object.values(accMap).map(acc => {
      const isDebitNature = acc.puc_code.startsWith('1') || acc.puc_code.startsWith('5') || acc.puc_code.startsWith('6') || acc.puc_code.startsWith('7');
      const netBalance = isDebitNature 
        ? (acc.total_debit - acc.total_credit) 
        : (acc.total_credit - acc.total_debit);

      let className = 'Otro';
      if (acc.puc_code.startsWith('1')) className = '1. Activo';
      else if (acc.puc_code.startsWith('2')) className = '2. Pasivo';
      else if (acc.puc_code.startsWith('3')) className = '3. Patrimonio';
      else if (acc.puc_code.startsWith('4')) className = '4. Ingreso';
      else if (acc.puc_code.startsWith('5')) className = '5. Gasto';
      else if (acc.puc_code.startsWith('6')) className = '6. Costo';

      return {
        ...acc,
        className,
        isDebitNature,
        netBalance,
        nature: isDebitNature ? 'Débito' : 'Crédito'
      };
    }).sort((a, b) => a.puc_code.localeCompare(b.puc_code));
  }, [journalEntries, journalStartDate, journalEndDate]);

  const filteredMayor = mayorSummary.filter(acc => {
    const q = journalSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      acc.puc_code.toLowerCase().includes(q) ||
      acc.account_name.toLowerCase().includes(q) ||
      acc.className.toLowerCase().includes(q);

    const matchesClass =
      journalClassFilter === 'all' || acc.puc_code.startsWith(journalClassFilter);

    return matchesSearch && matchesClass;
  });

  const totalMayorDebit = filteredMayor.reduce((sum, a) => sum + a.total_debit, 0);
  const totalMayorCredit = filteredMayor.reduce((sum, a) => sum + a.total_credit, 0);

  // Filtrado de Flujo de Caja
  const filteredCashFlow = cashFlow.filter((cf) => {
    const q = cashSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      cf.description?.toLowerCase().includes(q) ||
      cf.category?.toLowerCase().includes(q);

    let matchesType = true;
    if (cashTypeFilter === 'INCOME') matchesType = (cf.income || 0) > 0;
    else if (cashTypeFilter === 'EXPENSE') matchesType = (cf.credit || 0) > 0;

    const matchesDate = isDateInRange(cf.record_date, cashStartDate, cashEndDate);

    return matchesSearch && matchesType && matchesDate;
  });

  const pnlChartData = pnl ? [
    { name: 'Ingresos', valor: pnl.total_income, fill: '#34D399' },
    { name: 'Costos Producción', valor: pnl.total_costs, fill: '#FB7185' },
    { name: 'Gastos Admin', valor: pnl.total_expenses, fill: '#F59E0B' },
    { name: 'Utilidad Neta', valor: pnl.net_utility, fill: pnl.net_utility >= 0 ? '#64748B' : '#E11D48' },
  ] : [];

  const getPucBadgeClass = (code) => {
    if (code.startsWith('1')) return 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50';
    if (code.startsWith('2')) return 'bg-rose-950/60 text-rose-400 border border-rose-800/50';
    if (code.startsWith('3')) return 'bg-purple-950/60 text-purple-400 border border-purple-800/50';
    if (code.startsWith('4')) return 'bg-blue-950/60 text-blue-400 border border-blue-800/50';
    if (code.startsWith('5')) return 'bg-amber-950/60 text-amber-400 border border-amber-800/50';
    if (code.startsWith('6')) return 'bg-orange-950/60 text-orange-400 border border-orange-800/50';
    return 'bg-zinc-800 text-zinc-300 border border-zinc-700';
  };

  return (
    <div className="space-y-4">
      {/* Resumen Financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase">Total Activos (Clase 1)</p>
          <h3 className="text-xl font-semibold text-[#EAEAEA] mt-1">
            ${balance ? balance.total_assets.toLocaleString('es-CO') : '0'} COP
          </h3>
          <p className="text-[10px] text-[#666666] mt-1">Caja + Inventario + Maquinaria</p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase">Pasivos & Patrimonio</p>
          <h3 className="text-xl font-semibold text-[#EAEAEA] mt-1">
            ${balance ? (balance.total_liabilities + balance.total_equity).toLocaleString('es-CO') : '0'} COP
          </h3>
          <p className="text-[10px] text-[#666666] mt-1">Aportes sociales & Deudas</p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase">Ingresos Operativos</p>
          <h3 className="text-xl font-semibold text-emerald-400 mt-1">
            ${pnl ? pnl.total_income.toLocaleString('es-CO') : '0'} COP
          </h3>
          <p className="text-[10px] text-[#666666] mt-1">Ventas de piezas 3D</p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase">Utilidad Operativa</p>
          <h3 className={`text-xl font-semibold mt-1 ${pnl && pnl.net_utility >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${pnl ? pnl.net_utility.toLocaleString('es-CO') : '0'} COP
          </h3>
          <p className="text-[10px] text-[#666666] mt-1">Resultado neto del ejercicio</p>
        </div>
      </div>

      {/* Gráfico P&L */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
        <h3 className="text-xs font-semibold text-[#EAEAEA] mb-3">Estado de Ganancias y Pérdidas (P&L)</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pnlChartData}>
              <CartesianGrid strokeDasharray="2 2" stroke="#2A2A2A" vertical={false} />
              <XAxis dataKey="name" stroke="#666666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666666" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip
                formatter={(val) => `$${val.toLocaleString('es-CO')} COP`}
                contentStyle={{ backgroundColor: '#101010', borderColor: '#2A2A2A', borderRadius: '2px', color: '#EAEAEA', fontSize: '11px' }}
                itemStyle={{ color: '#EAEAEA' }}
                labelStyle={{ color: '#EAEAEA', fontWeight: '600' }}
              />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                {pnlChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subtabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1A1A1A] p-3 rounded-sm border border-[#2A2A2A]">
        <div className="flex items-center gap-1 bg-[#101010] p-1 rounded-sm border border-[#2A2A2A] flex-wrap">
          <button
            onClick={() => setActiveSubtab('journal')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'journal'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} /> Libro Diario Mayor ({journalEntries.length})
          </button>

          <button
            onClick={() => setActiveSubtab('puc')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'puc'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} /> Catálogo PUC ({pucAccounts.length})
          </button>

          <button
            onClick={() => setActiveSubtab('cashflow')}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeSubtab === 'cashflow'
                ? 'bg-[#1A1A1A] text-[#EAEAEA] border-l-2 border-slate-400 font-semibold'
                : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" strokeWidth={1.5} /> Flujo de Caja ({cashFlow.length})
          </button>
        </div>

        <button
          onClick={loadAccountingData}
          className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#101010] border border-[#2A2A2A] rounded-sm text-xs flex items-center gap-1.5"
          title="Recargar datos"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {/* LIBRO DIARIO MAYOR */}
      {activeSubtab === 'journal' && (
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm overflow-hidden space-y-3 p-3">
          {/* Header Resumen del Diario Mayor y Selector de Vista */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#101010] p-3 rounded-sm border border-[#2A2A2A]">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="font-semibold text-[#EAEAEA] text-xs">Libro Diario Mayor y Balances</h3>
                <p className="text-[10px] text-[#666666]">Registro cronológico y saldos por cuenta contable PUC</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Cuadre de Partida Doble */}
              <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm font-mono text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="text-[#A0A0A0]">Debe:</span>
                  <span className="text-emerald-400 font-semibold">${allJournalDebit.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
                </div>
                <span className="text-[#444444]">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-[#A0A0A0]">Haber:</span>
                  <span className="text-amber-400 font-semibold">${allJournalCredit.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
                </div>
                {isJournalBalanced && (
                  <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-sans ml-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Cuadrado
                  </span>
                )}
              </div>

              {/* Selector de Modo de Vista */}
              <div className="flex items-center gap-1 bg-[#1A1A1A] p-0.5 rounded-sm border border-[#2A2A2A]">
                <button
                  onClick={() => setJournalViewMode('journal')}
                  className={`px-2.5 py-1 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    journalViewMode === 'journal'
                      ? 'bg-slate-200 text-slate-950 font-semibold'
                      : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Asientos de Diario
                </button>
                <button
                  onClick={() => setJournalViewMode('ledger')}
                  className={`px-2.5 py-1 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    journalViewMode === 'ledger'
                      ? 'bg-slate-200 text-slate-950 font-semibold'
                      : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Libro Mayor ({mayorSummary.length} Cuentas)
                </button>
              </div>
            </div>
          </div>

          {/* Bar de Búsqueda y Filtros por Clase y Fecha para Libro Diario Mayor */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#A0A0A0] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={journalViewMode === 'journal' ? "Buscar asiento por PUC, cuenta, número de asiento (#) o concepto..." : "Buscar cuenta PUC por código o nombre..."}
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm pl-9 pr-8 py-2 text-xs text-[#EAEAEA] placeholder-[#666666] focus:outline-none focus:border-slate-500 transition-colors"
                />
                {journalSearch && (
                  <button
                    onClick={() => setJournalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtros por Clase Contable */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-[#666666] hidden lg:inline" />
                {[
                  { key: 'all', label: 'Todas' },
                  { key: '1', label: '1. Activo' },
                  { key: '2', label: '2. Pasivo' },
                  { key: '3', label: '3. Patrimonio' },
                  { key: '4', label: '4. Ingreso' },
                  { key: '5', label: '5. Gasto' },
                  { key: '6', label: '6. Costo' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setJournalClassFilter(item.key)}
                    className={`px-2.5 py-1 rounded-sm text-[11px] font-medium transition-colors ${
                      journalClassFilter === item.key
                        ? 'bg-slate-200 text-slate-950 font-semibold'
                        : 'bg-[#101010] text-[#A0A0A0] border border-[#2A2A2A] hover:text-[#EAEAEA]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro por Rango de Fechas */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[#222222]">
              <DateRangeFilter
                startDate={journalStartDate}
                endDate={journalEndDate}
                onChange={({ startDate, endDate }) => {
                  setJournalStartDate(startDate);
                  setJournalEndDate(endDate);
                }}
              />
              {(journalSearch || journalClassFilter !== 'all' || journalStartDate || journalEndDate) && (
                <button
                  onClick={() => {
                    setJournalSearch('');
                    setJournalClassFilter('all');
                    setJournalStartDate('');
                    setJournalEndDate('');
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline"
                >
                  Restablecer todos los filtros
                </button>
              )}
            </div>
          </div>

          {/* Contador de resultados */}
          <div className="text-[11px] text-[#A0A0A0] flex justify-between items-center px-1">
            <span>
              {journalViewMode === 'journal' ? (
                <>Mostrando <strong className="text-[#EAEAEA]">{filteredJournal.length}</strong> de <strong className="text-[#EAEAEA]">{journalEntries.length}</strong> asientos contables</>
              ) : (
                <>Mostrando <strong className="text-[#EAEAEA]">{filteredMayor.length}</strong> de <strong className="text-[#EAEAEA]">{mayorSummary.length}</strong> cuentas del Libro Mayor</>
              )}
            </span>
            {(journalSearch || journalClassFilter !== 'all' || journalStartDate || journalEndDate) && (
              <button
                onClick={() => {
                  setJournalSearch('');
                  setJournalClassFilter('all');
                  setJournalStartDate('');
                  setJournalEndDate('');
                }}
                className="text-slate-400 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* VISTA 1: ASIENTOS DE DIARIO */}
          {journalViewMode === 'journal' && (
            <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                    <th className="py-2.5 px-3 font-semibold">Asiento</th>
                    <th className="py-2.5 px-3 font-semibold">Fecha</th>
                    <th className="py-2.5 px-3 font-semibold">PUC</th>
                    <th className="py-2.5 px-3 font-semibold">Cuenta Contable</th>
                    <th className="py-2.5 px-3 font-semibold">Concepto</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Debe</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Haber</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]/50">
                  {filteredJournal.length > 0 ? (
                    filteredJournal.map((row) => (
                      <tr key={row.id} className="hover:bg-[#222222]">
                        <td className="py-2.5 px-3 font-mono font-medium text-[#A0A0A0]">#{row.entry_number}</td>
                        <td className="py-2.5 px-3 text-[#A0A0A0] font-mono text-[11px]">
                          {formatDate(row.entry_date)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300 font-medium">{row.puc_code}</td>
                        <td className="py-2.5 px-3 font-medium text-[#EAEAEA]">{row.account_name}</td>
                        <td className="py-2.5 px-3 text-[#A0A0A0]">{row.description}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-medium">
                          {row.debit > 0 ? `$${row.debit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-medium">
                          {row.credit > 0 ? `$${row.credit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleDeleteJournalEntry(row.entry_number)}
                            title={`Eliminar Asiento Contable #${row.entry_number}`}
                            className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-[#A0A0A0] text-xs">
                        {journalSearch || journalClassFilter !== 'all' ? 'No se encontraron asientos contables con los filtros seleccionados.' : 'No hay asientos contables registrados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredJournal.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#101010] border-t-2 border-[#2A2A2A] text-xs font-semibold">
                      <td colSpan="5" className="py-2.5 px-3 text-right text-[#A0A0A0] uppercase">
                        Sumas Iguales (Filtro Actual):
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        ${totalJournalDebit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                        ${totalJournalCredit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* VISTA 2: LIBRO MAYOR (SALDOS POR CUENTA PUC) */}
          {journalViewMode === 'ledger' && (
            <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                    <th className="py-2.5 px-3 font-semibold">Código PUC</th>
                    <th className="py-2.5 px-3 font-semibold">Cuenta Contable</th>
                    <th className="py-2.5 px-3 font-semibold">Clase / Tipo</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Movimientos</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Total Débitos (Debe)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Total Créditos (Haber)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Saldo Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]/50">
                  {filteredMayor.length > 0 ? (
                    filteredMayor.map((acc) => (
                      <tr key={acc.puc_code} className="hover:bg-[#222222] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-300">{acc.puc_code}</td>
                        <td className="py-2.5 px-3 font-medium text-[#EAEAEA]">{acc.account_name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono ${getPucBadgeClass(acc.puc_code)}`}>
                            {acc.className}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-[#A0A0A0] font-mono">
                          {acc.entries_count} asientos
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-medium">
                          ${acc.total_debit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-medium">
                          ${acc.total_credit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#EAEAEA]">
                          ${acc.netBalance.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-[10px] text-[#666666] font-normal ml-1">({acc.nature})</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-[#A0A0A0] text-xs">
                        No se encontraron cuentas en el Libro Mayor con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredMayor.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#101010] border-t-2 border-[#2A2A2A] text-xs font-semibold">
                      <td colSpan="4" className="py-2.5 px-3 text-right text-[#A0A0A0] uppercase">
                        Sumas Iguales del Mayor (Filtro Actual):
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        ${totalMayorDebit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                        ${totalMayorCredit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        {isJournalBalanced ? '✓ Cuadrado' : 'Diferencia'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* CATÁLOGO PUC */}
      {activeSubtab === 'puc' && (
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-3 space-y-3">
          {/* Controles de Búsqueda y Filtros */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Input de Búsqueda */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#A0A0A0] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por código (ej. 1105), nombre o tipo de cuenta..."
                value={pucSearch}
                onChange={(e) => setPucSearch(e.target.value)}
                className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm pl-9 pr-8 py-2 text-xs text-[#EAEAEA] placeholder-[#666666] focus:outline-none focus:border-slate-500 transition-colors"
              />
              {pucSearch && (
                <button
                  onClick={() => setPucSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtros por Clase Contable */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-[#666666] hidden lg:inline" />
              {[
                { key: 'all', label: 'Todas' },
                { key: '1', label: '1. Activo' },
                { key: '2', label: '2. Pasivo' },
                { key: '3', label: '3. Patrimonio' },
                { key: '4', label: '4. Ingreso' },
                { key: '5', label: '5. Gasto' },
                { key: '6', label: '6. Costo' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setPucClassFilter(item.key)}
                  className={`px-2.5 py-1 rounded-sm text-[11px] font-medium transition-colors ${
                    pucClassFilter === item.key
                      ? 'bg-slate-200 text-slate-950 font-semibold'
                      : 'bg-[#101010] text-[#A0A0A0] border border-[#2A2A2A] hover:text-[#EAEAEA]'
                  }`}
                >
                  {item.label}
                </button>
              ))}

              <button
                onClick={() => setShowAddPucModal(true)}
                className="ml-auto md:ml-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva Cuenta
              </button>
            </div>
          </div>

          {/* Contador de resultados */}
          <div className="text-[11px] text-[#A0A0A0] flex justify-between items-center px-1">
            <span>
              Mostrando <strong className="text-[#EAEAEA]">{filteredPuc.length}</strong> de <strong className="text-[#EAEAEA]">{pucAccounts.length}</strong> cuentas PUC
            </span>
            {(pucSearch || pucClassFilter !== 'all') && (
              <button
                onClick={() => {
                  setPucSearch('');
                  setPucClassFilter('all');
                }}
                className="text-slate-400 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Tabla PUC con Desplegable de Cuentas */}
          <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                  <th className="py-2.5 px-3 font-semibold w-10 text-center"></th>
                  <th className="py-2.5 px-3 font-semibold">Código PUC</th>
                  <th className="py-2.5 px-3 font-semibold">Nombre de Cuenta</th>
                  <th className="py-2.5 px-3 font-semibold">Tipo</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Clase</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A]/50">
                {filteredPuc.length > 0 ? (
                  filteredPuc.map((acc) => {
                    const isExpanded = !!expandedPucCodes[acc.code];
                    const code = acc.code || '';
                    const classDigit = code.charAt(0);
                    const groupDigits = code.slice(0, 2);
                    const accountDigits = code.slice(0, 4);

                    const classInfo = PUC_HIERARCHY_MAP[classDigit] || { name: 'CLASE ' + classDigit, description: '' };
                    const groupName = PUC_HIERARCHY_MAP[groupDigits] || `Grupo ${groupDigits}`;
                    const accountName = PUC_HIERARCHY_MAP[accountDigits] || `Cuenta ${accountDigits}`;

                    // Cuentas relacionadas del mismo grupo en el catálogo
                    const relatedAccounts = pucAccounts.filter(p => p.code !== acc.code && p.code.startsWith(groupDigits));

                    // Asientos y balances del libro diario para esta cuenta
                    const accountEntries = journalEntries.filter(e => e.puc_code === acc.code);
                    const accountDebit = accountEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
                    const accountCredit = accountEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
                    const isDebitNature = code.startsWith('1') || code.startsWith('5') || code.startsWith('6') || code.startsWith('7');
                    const netBalance = isDebitNature ? (accountDebit - accountCredit) : (accountCredit - accountDebit);

                    return (
                      <React.Fragment key={acc.id || acc.code}>
                        <tr
                          onClick={() => toggleExpandPuc(acc.code)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-[#1F1F1F]' : 'hover:bg-[#222222]'}`}
                          title="Haz clic para ver el desplegable de cuentas y jerarquía"
                        >
                          <td className="py-2.5 px-2 text-center text-[#A0A0A0]">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-emerald-400 inline" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[#666666] inline" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                            <span className="underline decoration-dotted underline-offset-2">{acc.code}</span>
                            <span className="text-[10px] text-[#666666] font-normal font-sans">
                              ({isExpanded ? 'cerrar' : 'desplegar'})
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#EAEAEA]">{acc.name}</td>
                          <td className="py-2.5 px-3 text-[#A0A0A0]">{acc.account_type}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-mono font-medium ${getPucBadgeClass(acc.code)}`}>
                              Clase {classDigit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleDeletePuc(acc.id, acc.code, acc.name)}
                              title={`Eliminar Cuenta PUC ${acc.code}`}
                              className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>

                        {/* DESPLEGABLE DE CUENTAS */}
                        {isExpanded && (
                          <tr className="bg-[#121212] border-y border-[#2A2A2A]">
                            <td colSpan="6" className="p-4 space-y-4">
                              <div className="bg-[#181818] border border-[#2A2A2A] rounded-sm p-3.5 space-y-3">
                                {/* Header del Desplegable */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2A2A2A] pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <FolderTree className="w-4 h-4 text-emerald-400" />
                                    <h4 className="font-semibold text-[#EAEAEA] text-xs">
                                      Desplegable de Cuentas PUC & Estructura Jerárquica: <span className="font-mono text-emerald-400">{acc.code} - {acc.name}</span>
                                    </h4>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveSubtab('journal');
                                      setJournalSearch(acc.code);
                                      setJournalViewMode('journal');
                                    }}
                                    className="px-2.5 py-1 bg-[#101010] hover:bg-[#252525] text-slate-300 hover:text-white border border-[#2A2A2A] rounded-sm text-[11px] font-medium flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                                  >
                                    <span>Ver en Libro Diario Mayor</span>
                                    <ArrowRight className="w-3 h-3 text-emerald-400" />
                                  </button>
                                </div>

                                {/* 1. Árbol Jerárquico de Cuentas */}
                                <div>
                                  <span className="text-[11px] text-[#A0A0A0] font-semibold uppercase tracking-wider block mb-2">
                                    Niveles Contables PUC:
                                  </span>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                                    {/* Nivel 1: Clase */}
                                    <div className="p-2.5 bg-[#101010] border border-[#2A2A2A] rounded-sm">
                                      <span className="text-[10px] text-[#666666] font-semibold uppercase block">Nivel 1 (Clase {classDigit})</span>
                                      <p className="font-bold text-[#EAEAEA] mt-0.5">{classInfo.name}</p>
                                      <span className="text-[10px] text-[#A0A0A0] block mt-0.5 leading-tight">{classInfo.description}</span>
                                    </div>

                                    {/* Nivel 2: Grupo */}
                                    <div className="p-2.5 bg-[#101010] border border-[#2A2A2A] rounded-sm">
                                      <span className="text-[10px] text-[#666666] font-semibold uppercase block">Nivel 2 (Grupo {groupDigits})</span>
                                      <p className="font-semibold text-[#EAEAEA] mt-0.5">{groupName}</p>
                                      <span className="text-[10px] text-[#A0A0A0] block mt-0.5">Subdivisión operacional</span>
                                    </div>

                                    {/* Nivel 3: Cuenta Mayor */}
                                    <div className="p-2.5 bg-[#101010] border border-[#2A2A2A] rounded-sm">
                                      <span className="text-[10px] text-[#666666] font-semibold uppercase block">Nivel 3 (Cuenta {accountDigits})</span>
                                      <p className="font-semibold text-slate-200 mt-0.5">{accountName}</p>
                                      <span className="text-[10px] text-[#A0A0A0] block mt-0.5">Cuenta matriz de agrupación</span>
                                    </div>

                                    {/* Nivel 4: Subcuenta Operativa */}
                                    <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-sm">
                                      <span className="text-[10px] text-emerald-400 font-semibold uppercase block">Nivel 4 (Subcuenta {code})</span>
                                      <p className="font-bold text-emerald-300 mt-0.5">{acc.name}</p>
                                      <span className="text-[10px] text-[#A0A0A0] block mt-0.5">Cuenta operativa activa</span>
                                    </div>
                                  </div>
                                </div>

                                {/* 2. Subcuentas & Cuentas Relacionadas en el Catálogo */}
                                {relatedAccounts.length > 0 && (
                                  <div className="pt-2 border-t border-[#2A2A2A]">
                                    <span className="text-[11px] text-[#A0A0A0] font-semibold uppercase tracking-wider block mb-1.5">
                                      Otras Cuentas en el Grupo ({groupDigits}):
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {relatedAccounts.map(rel => (
                                        <div
                                          key={rel.id || rel.code}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpandPuc(rel.code);
                                          }}
                                          className="px-2.5 py-1 bg-[#101010] border border-[#2A2A2A] hover:border-slate-500 rounded-sm flex items-center gap-2 cursor-pointer transition-colors text-xs"
                                        >
                                          <span className="font-mono font-bold text-slate-300">{rel.code}</span>
                                          <span className="text-[#EAEAEA]">{rel.name}</span>
                                          <span className="text-[10px] text-[#666666]">({rel.account_type})</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 3. Resumen de Movimientos en el Libro Diario */}
                                <div className="pt-2 border-t border-[#2A2A2A]">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                    <span className="text-[11px] text-[#A0A0A0] font-semibold uppercase tracking-wider">
                                      Movimientos en Libro Diario Mayor ({accountEntries.length} registros):
                                    </span>
                                    <div className="flex items-center gap-3 font-mono text-xs">
                                      <span className="text-[#A0A0A0]">Debe: <strong className="text-emerald-400">${accountDebit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                      <span className="text-[#444444]">|</span>
                                      <span className="text-[#A0A0A0]">Haber: <strong className="text-amber-400">${accountCredit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                      <span className="text-[#444444]">|</span>
                                      <span className="text-[#A0A0A0]">Saldo Actual: <strong className="text-[#EAEAEA]">${netBalance.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({isDebitNature ? 'Débito' : 'Crédito'})</strong></span>
                                    </div>
                                  </div>

                                  {accountEntries.length > 0 ? (
                                    <div className="max-h-40 overflow-y-auto border border-[#2A2A2A] rounded-sm">
                                      <table className="w-full text-left text-[11px] border-collapse bg-[#101010]">
                                        <thead>
                                          <tr className="border-b border-[#2A2A2A] text-[#777777]">
                                            <th className="py-1.5 px-2.5">Asiento</th>
                                            <th className="py-1.5 px-2.5">Fecha</th>
                                            <th className="py-1.5 px-2.5">Concepto</th>
                                            <th className="py-1.5 px-2.5 text-right">Debe</th>
                                            <th className="py-1.5 px-2.5 text-right">Haber</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1F1F1F]">
                                          {accountEntries.slice(0, 5).map((e) => (
                                            <tr key={e.id} className="hover:bg-[#1A1A1A]">
                                              <td className="py-1.5 px-2.5 font-mono text-[#A0A0A0]">#{e.entry_number}</td>
                                              <td className="py-1.5 px-2.5 text-[#666666]">{new Date(e.entry_date).toLocaleDateString('es-ES')}</td>
                                              <td className="py-1.5 px-2.5 text-[#EAEAEA] truncate max-w-xs">{e.description}</td>
                                              <td className="py-1.5 px-2.5 text-right font-mono text-emerald-400">
                                                {e.debit > 0 ? `$${e.debit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono text-amber-400">
                                                {e.credit > 0 ? `$${e.credit.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-[#666666] italic bg-[#101010] p-2.5 rounded-sm border border-[#2A2A2A]">
                                      No hay movimientos registrados en el Libro Diario para esta cuenta todavía.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-[#A0A0A0] text-xs">
                      No se encontraron cuentas PUC con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FLUJO DE CAJA */}
      {activeSubtab === 'cashflow' && (
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm overflow-hidden space-y-3 p-3">
          {/* Header, Búsqueda y Filtros de Flujo de Caja */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#A0A0A0] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar movimiento de caja por descripción o categoría..."
                  value={cashSearch}
                  onChange={(e) => setCashSearch(e.target.value)}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm pl-9 pr-8 py-2 text-xs text-[#EAEAEA] placeholder-[#666666] focus:outline-none focus:border-slate-500 transition-colors"
                />
                {cashSearch && (
                  <button
                    onClick={() => setCashSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Filtro Tipo Movimiento */}
                <div className="flex items-center gap-1 bg-[#101010] p-1 rounded-sm border border-[#2A2A2A]">
                  {[
                    { key: 'ALL', label: 'Todos' },
                    { key: 'INCOME', label: 'Ingresos (+)' },
                    { key: 'EXPENSE', label: 'Egresos (-)' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setCashTypeFilter(item.key)}
                      className={`px-2.5 py-1 rounded-sm text-[11px] font-medium transition-colors ${
                        cashTypeFilter === item.key
                          ? 'bg-slate-200 text-slate-950 font-semibold'
                          : 'text-[#A0A0A0] hover:text-[#EAEAEA]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowAddCashModal(true)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar Movimiento
                </button>
              </div>
            </div>

            {/* Filtro por Rango de Fechas para Flujo de Caja */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[#222222]">
              <DateRangeFilter
                startDate={cashStartDate}
                endDate={cashEndDate}
                onChange={({ startDate, endDate }) => {
                  setCashStartDate(startDate);
                  setCashEndDate(endDate);
                }}
              />
              {(cashSearch || cashTypeFilter !== 'ALL' || cashStartDate || cashEndDate) && (
                <button
                  onClick={() => {
                    setCashSearch('');
                    setCashTypeFilter('ALL');
                    setCashStartDate('');
                    setCashEndDate('');
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline"
                >
                  Restablecer todos los filtros
                </button>
              )}
            </div>
          </div>

          {/* Contador de resultados */}
          <div className="text-[11px] text-[#A0A0A0] flex justify-between items-center px-1">
            <span>
              Mostrando <strong className="text-[#EAEAEA]">{filteredCashFlow.length}</strong> de <strong className="text-[#EAEAEA]">{cashFlow.length}</strong> movimientos de caja
            </span>
            {(cashSearch || cashTypeFilter !== 'ALL' || cashStartDate || cashEndDate) && (
              <button
                onClick={() => {
                  setCashSearch('');
                  setCashTypeFilter('ALL');
                  setCashStartDate('');
                  setCashEndDate('');
                }}
                className="text-slate-400 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="overflow-hidden border border-[#2A2A2A] rounded-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#101010] border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                  <th className="py-2.5 px-3 font-semibold">Fecha</th>
                  <th className="py-2.5 px-3 font-semibold">Descripción</th>
                  <th className="py-2.5 px-3 font-semibold">Categoría</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Ingreso (+)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Egreso (-)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Balance</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A]/50">
                {filteredCashFlow.length > 0 ? (
                  filteredCashFlow.map((cf) => (
                    <tr key={cf.id} className="hover:bg-[#222222]">
                      <td className="py-2.5 px-3 text-[#A0A0A0] font-mono text-[11px]">{formatDate(cf.record_date)}</td>
                      <td className="py-2.5 px-3 font-medium text-[#EAEAEA]">{cf.description}</td>
                      <td className="py-2.5 px-3 text-[#A0A0A0]">{cf.category}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-medium">
                        {cf.income > 0 ? `$${cf.income.toLocaleString('es-CO')}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-medium">
                        {cf.credit > 0 ? `$${cf.credit.toLocaleString('es-CO')}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#EAEAEA]">
                        ${cf.balance.toLocaleString('es-CO')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleDeleteCashFlow(cf.id, cf.description)}
                          title="Eliminar Movimiento"
                          className="p-1 bg-[#101010] hover:bg-rose-500/20 text-[#A0A0A0] hover:text-rose-400 rounded-sm border border-[#2A2A2A] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-[#A0A0A0] text-xs">
                      {cashSearch || cashTypeFilter !== 'ALL' ? 'No se encontraron movimientos con los filtros seleccionados.' : 'No hay registros en el flujo de caja.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL CREAR NUEVA CUENTA PUC */}
      {showAddPucModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-[#2A2A2A] pb-3">
              <h3 className="text-sm font-semibold text-[#EAEAEA]">Agregar Nueva Cuenta PUC</h3>
              <button
                onClick={() => setShowAddPucModal(false)}
                className="text-[#A0A0A0] hover:text-[#EAEAEA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePuc} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Código PUC (ej. 110505, 513528)</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 110505"
                  value={newPucForm.code}
                  onChange={(e) => setNewPucForm({ ...newPucForm, code: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] focus:outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Nombre de la Cuenta</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Caja General Nequi/Daviplata"
                  value={newPucForm.name}
                  onChange={(e) => setNewPucForm({ ...newPucForm, name: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] focus:outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Tipo de Cuenta</label>
                <select
                  value={newPucForm.account_type}
                  onChange={(e) => setNewPucForm({ ...newPucForm, account_type: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] focus:outline-none focus:border-slate-500"
                >
                  <option value="ACTIVO">ACTIVO (Clase 1)</option>
                  <option value="PASIVO">PASIVO (Clase 2)</option>
                  <option value="PATRIMONIO">PATRIMONIO (Clase 3)</option>
                  <option value="INGRESO">INGRESO (Clase 4)</option>
                  <option value="GASTO">GASTO (Clase 5)</option>
                  <option value="COSTO">COSTO (Clase 6)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setShowAddPucModal(false)}
                  className="px-3 py-1.5 bg-[#101010] hover:bg-[#222222] text-[#A0A0A0] border border-[#2A2A2A] rounded-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPuc}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submittingPuc ? 'Guardando...' : 'Guardar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO DE FLUJO DE CAJA */}
      {showAddCashModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-[#2A2A2A] pb-3">
              <h3 className="text-sm font-semibold text-[#EAEAEA]">Registrar Movimiento de Caja</h3>
              <button
                onClick={() => setShowAddCashModal(false)}
                className="text-[#A0A0A0] hover:text-[#EAEAEA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCashFlow} className="space-y-3 text-xs">
              {/* Selector Tipo de Movimiento (Ingreso vs Egreso) */}
              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Tipo de Movimiento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCashForm({ ...newCashForm, type: 'INCOME' })}
                    className={`py-2 rounded-sm font-semibold text-xs border transition-colors flex items-center justify-center gap-1 ${
                      newCashForm.type === 'INCOME'
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600'
                        : 'bg-[#101010] text-[#A0A0A0] border-[#2A2A2A] hover:text-[#EAEAEA]'
                    }`}
                  >
                    + Ingreso (Entrada)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCashForm({ ...newCashForm, type: 'EXPENSE' })}
                    className={`py-2 rounded-sm font-semibold text-xs border transition-colors flex items-center justify-center gap-1 ${
                      newCashForm.type === 'EXPENSE'
                        ? 'bg-rose-950/80 text-rose-400 border-rose-600'
                        : 'bg-[#101010] text-[#A0A0A0] border-[#2A2A2A] hover:text-[#EAEAEA]'
                    }`}
                  >
                    - Egreso (Salida)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Fecha del Movimiento</label>
                <input
                  type="date"
                  required
                  value={newCashForm.record_date}
                  onChange={(e) => setNewCashForm({ ...newCashForm, record_date: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] focus:outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Categoría</label>
                <select
                  value={newCashForm.category}
                  onChange={(e) => setNewCashForm({ ...newCashForm, category: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] focus:outline-none focus:border-slate-500"
                >
                  <option value="Ventas Directas">Ventas Directas (3D)</option>
                  <option value="Equipos y Maquinaria">Equipos y Maquinaria (Activos Fijos - Impresoras)</option>
                  <option value="Capital inicial">Capital inicial / Aportes de Socios (Patrimonio)</option>
                  <option value="Insumos y Materiales">Insumos y Filamentos (Inventario)</option>
                  <option value="Servicios Públicos">Servicios Públicos (Energía / Luz)</option>
                  <option value="Mano de Obra">Mano de Obra / Salarios</option>
                  <option value="Aportes e Inversión">Aportes e Inversión</option>
                  <option value="Otros Gastos">Otros Gastos / General</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Descripción / Concepto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de contado por impresión de 50 piezas de PLA"
                  value={newCashForm.description}
                  onChange={(e) => setNewCashForm({ ...newCashForm, description: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] focus:outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block text-[#A0A0A0] mb-1 font-medium">Monto ($ COP)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="Ej: 85000"
                  value={newCashForm.amount}
                  onChange={(e) => setNewCashForm({ ...newCashForm, amount: e.target.value })}
                  className="w-full bg-[#101010] border border-[#2A2A2A] rounded-sm p-2 text-[#EAEAEA] font-mono focus:outline-none focus:border-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setShowAddCashModal(false)}
                  className="px-3 py-1.5 bg-[#101010] hover:bg-[#222222] text-[#A0A0A0] border border-[#2A2A2A] rounded-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingCash}
                  className={`px-4 py-1.5 rounded-sm font-medium transition-colors text-white disabled:opacity-50 ${
                    newCashForm.type === 'INCOME' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {submittingCash ? 'Guardando...' : newCashForm.type === 'INCOME' ? 'Guardar Ingreso' : 'Guardar Egreso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


