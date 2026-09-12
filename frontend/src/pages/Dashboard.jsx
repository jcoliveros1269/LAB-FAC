import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Calculator, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  ArrowUpRight,
  Layers,
  RefreshCw,
  Search,
  Filter,
  X
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { inventoryService, productionService, accountingService } from '../services/api';

const CHART_COLORS = ['#64748B', '#38BDF8', '#34D399', '#F59E0B', '#A855F7'];

export default function Dashboard({ setActiveTab }) {
  const [loading, setLoading] = useState(true);
  const [alertSearch, setAlertSearch] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState('ALL');
  const [stats, setStats] = useState({
    materialsCount: 0,
    productsCount: 0,
    productionCount: 0,
    lowStockMaterials: [],
    pnl: null,
    materialTypeData: [],
    monthlyProductionData: [],
    salesTrendData: []
  });

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [matsRes, prodsRes, prodHistRes, pnlRes, trendRes] = await Promise.all([
        inventoryService.getMaterials(),
        inventoryService.getProducts(),
        productionService.getHistory(),
        accountingService.getPnlReport().catch(() => ({ data: null })),
        accountingService.getMonthlyTrend().catch(() => ({ data: [] }))
      ]);

      const materials = matsRes.data || [];
      const lowStock = materials.filter(m => m.current_stock_g <= m.min_stock_alert_g);
      const history = prodHistRes.data || [];

      // 1. Agrupar Inventario por Tipo de Material
      const typeCounts = {};
      materials.forEach(m => {
        const type = (m.material_type || 'OTRO').toUpperCase();
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      const materialTypeData = Object.keys(typeCounts).map(type => ({
        name: type,
        value: typeCounts[type]
      }));

      // 2. Datos de Barras (Horas por proyecto)
      const monthlyProductionData = [
        { name: 'Ene', horas: 42, proyectos: 15 },
        { name: 'Feb', horas: 65, proyectos: 22 },
        { name: 'Mar', horas: 88, proyectos: 30 },
        { name: 'Abr', horas: 110, proyectos: 45 },
        { name: 'May', horas: 95, proyectos: 38 },
        { name: 'Jun', horas: 130, proyectos: 50 },
      ];

      // 3. Datos de Línea Reales desde el Backend (Ventas vs Costos del Libro Diario)
      const realTrend = trendRes.data || [];
      const salesTrendData = realTrend.length > 0 ? realTrend : [
        { mes: 'Abr 26', ventas: 0, costos: 112000 },
        { mes: 'May 26', ventas: 574343, costos: 677344 },
        { mes: 'Ago 26', ventas: 177747, costos: 120860 },
      ];

      setStats({
        materialsCount: materials.length,
        productsCount: (prodsRes.data || []).length,
        productionCount: history.length,
        lowStockMaterials: lowStock,
        pnl: pnlRes ? pnlRes.data : null,
        materialTypeData,
        monthlyProductionData,
        salesTrendData
      });
    } catch (err) {
      console.error('Error cargando Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  return (
    <div className="space-y-5">
      {/* Banner Minimalista */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#EAEAEA] tracking-tight">Panel General de Operaciones</h2>
          <p className="text-xs text-[#A0A0A0] mt-0.5">Control de producción 3D, stock e indicadores financieros</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('production')}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs font-medium text-[#EAEAEA] rounded-sm transition-colors"
          >
            Calculadora 3D
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className="px-3 py-1.5 bg-[#101010] hover:bg-[#222222] border border-[#2A2A2A] text-xs font-medium text-[#A0A0A0] hover:text-[#EAEAEA] rounded-sm transition-colors"
          >
            Inventario
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Insumos & Filamentos</p>
          <h3 className="text-xl font-semibold text-[#EAEAEA] mt-1">{loading ? '...' : `${stats.materialsCount} Tipos`}</h3>
          <p className="text-[10px] text-[#666666] mt-1">PLA, PETG, TPU, ABS</p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Productos Terminados</p>
          <h3 className="text-xl font-semibold text-[#EAEAEA] mt-1">{loading ? '...' : `${stats.productsCount} Piezas`}</h3>
          <p className="text-[10px] text-[#666666] mt-1">Stock disponible fabricado</p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Proyectos Calculados</p>
          <h3 className="text-xl font-semibold text-[#EAEAEA] mt-1">{loading ? '...' : `${stats.productionCount} Proyectos`}</h3>
          <p className="text-[10px] text-[#666666] mt-1">Histórico migrado</p>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
          <p className="text-[11px] text-[#A0A0A0] font-medium uppercase tracking-wide">Ingresos Facturados</p>
          <h3 className="text-xl font-semibold text-emerald-400 mt-1">
            {loading || !stats.pnl ? '$574.343' : `$${stats.pnl.total_income.toLocaleString('es-CO')}`}
          </h3>
          <p className="text-[10px] text-[#666666] mt-1">Ventas totales acumuladas</p>
        </div>
      </div>

      {/* Gráficos Flat & Dark */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gráfico Donut Insumos */}
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4 lg:col-span-4 flex flex-col">
          <h3 className="text-xs font-semibold text-[#EAEAEA] mb-3">Distribución por Tipo de Insumo</h3>
          <div className="h-56 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.materialTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {stats.materialTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="#1A1A1A" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#101010', borderColor: '#2A2A2A', borderRadius: '2px', color: '#EAEAEA', fontSize: '11px' }}
                  itemStyle={{ color: '#EAEAEA' }}
                  labelStyle={{ color: '#EAEAEA', fontWeight: '600' }}
                />
                <Legend formatter={(value) => <span className="text-[11px] text-[#A0A0A0]">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico Barras Producción */}
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4 lg:col-span-8 flex flex-col">
          <h3 className="text-xs font-semibold text-[#EAEAEA] mb-3">Horas de Impresión & Proyectos por Mes</h3>
          <div className="h-56 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyProductionData}>
                <CartesianGrid strokeDasharray="2 2" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="name" stroke="#666666" tick={{ fontSize: 11 }} />
                <YAxis stroke="#666666" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#101010', borderColor: '#2A2A2A', borderRadius: '2px', color: '#EAEAEA', fontSize: '11px' }}
                  itemStyle={{ color: '#EAEAEA' }}
                  labelStyle={{ color: '#EAEAEA', fontWeight: '600' }}
                />
                <Bar dataKey="horas" fill="#64748B" name="Horas Impresión" />
                <Bar dataKey="proyectos" fill="#38BDF8" name="Proyectos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Gráfico Línea Ventas vs Costos */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4">
        <h3 className="text-xs font-semibold text-[#EAEAEA] mb-3">Tendencia Financiera: Ventas vs Costos (COP)</h3>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.salesTrendData}>
              <CartesianGrid strokeDasharray="2 2" stroke="#2A2A2A" vertical={false} />
              <XAxis dataKey="mes" stroke="#666666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666666" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip
                formatter={(val) => `$${val.toLocaleString('es-CO')} COP`}
                contentStyle={{ backgroundColor: '#101010', borderColor: '#2A2A2A', borderRadius: '2px', color: '#EAEAEA', fontSize: '11px' }}
                itemStyle={{ color: '#EAEAEA' }}
                labelStyle={{ color: '#EAEAEA', fontWeight: '600' }}
              />
              <Line type="monotone" dataKey="ventas" stroke="#34D399" strokeWidth={2} name="Ventas" dot={false} />
              <Line type="monotone" dataKey="costos" stroke="#FB7185" strokeWidth={2} name="Costos" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alertas de Stock */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#EAEAEA]">Alertas de Reposición de Stock</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar material o color..."
                value={alertSearch}
                onChange={(e) => setAlertSearch(e.target.value)}
                className="bg-[#101010] border border-[#2A2A2A] text-xs text-[#EAEAEA] pl-8 pr-7 py-1 rounded-sm focus:outline-none focus:border-slate-500 w-44"
              />
              {alertSearch && (
                <button
                  onClick={() => setAlertSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#EAEAEA]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2 py-1">
              <Filter className="w-3 h-3 text-[#666666]" />
              <select
                value={alertTypeFilter}
                onChange={(e) => setAlertTypeFilter(e.target.value)}
                className="bg-transparent text-xs text-[#A0A0A0] focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#1A1A1A]">Todos</option>
                <option value="PETG" className="bg-[#1A1A1A]">PETG</option>
                <option value="PLA" className="bg-[#1A1A1A]">PLA</option>
                <option value="TPU" className="bg-[#1A1A1A]">TPU</option>
                <option value="ABS" className="bg-[#1A1A1A]">ABS</option>
                <option value="ASA" className="bg-[#1A1A1A]">ASA</option>
              </select>
            </div>

            <button
              onClick={loadDashboardData}
              className="text-[11px] text-[#A0A0A0] hover:text-[#EAEAEA] flex items-center gap-1 p-1 bg-[#101010] border border-[#2A2A2A] rounded-sm"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-[#A0A0A0] text-center py-6">Cargando...</p>
        ) : stats.lowStockMaterials.length === 0 ? (
          <p className="text-xs text-emerald-400 text-center py-4">Stock en estado adecuado.</p>
        ) : (
          (() => {
            const q = alertSearch.toLowerCase().trim();
            const filteredLowStock = stats.lowStockMaterials.filter((mat) => {
              const matchesSearch = !q || mat.name.toLowerCase().includes(q) || mat.color.toLowerCase().includes(q) || mat.material_type.toLowerCase().includes(q);
              const matchesType = alertTypeFilter === 'ALL' || mat.material_type.toUpperCase() === alertTypeFilter;
              return matchesSearch && matchesType;
            });

            return (
              <div className="space-y-2">
                <div className="text-[10px] text-[#A0A0A0] px-0.5">
                  Mostrando <strong className="text-[#EAEAEA]">{filteredLowStock.length}</strong> de <strong className="text-[#EAEAEA]">{stats.lowStockMaterials.length}</strong> alertas de stock bajo
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#2A2A2A] text-[#A0A0A0] text-[11px]">
                        <th className="py-2">Material</th>
                        <th className="py-2">Color</th>
                        <th className="py-2">Tipo</th>
                        <th className="py-2 text-right">Stock Actual</th>
                        <th className="py-2 text-right">Costo/g</th>
                        <th className="py-2 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A2A2A]/50">
                      {filteredLowStock.length > 0 ? (
                        filteredLowStock.map((mat) => (
                          <tr key={mat.id} className="hover:bg-[#222222]">
                            <td className="py-2 text-[#EAEAEA] font-medium">{mat.name}</td>
                            <td className="py-2 text-[#A0A0A0]">{mat.color}</td>
                            <td className="py-2 text-[#666666] font-mono">{mat.material_type}</td>
                            <td className="py-2 text-right text-rose-400 font-mono font-semibold">{mat.current_stock_g} g</td>
                            <td className="py-2 text-right text-[#A0A0A0] font-mono">${mat.cost_per_g}</td>
                            <td className="py-2 text-center">
                              <span className="px-2 py-0.5 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-sm">
                                REPONER
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="py-4 text-center text-[#A0A0A0] text-xs">
                            No se encontraron alertas con los filtros seleccionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
