import React, { useState, useEffect } from 'react';
import { Calendar, X } from 'lucide-react';

/**
 * Utilidad para comprobar si una fecha (ISO string o Date) se encuentra
 * dentro del rango [startDate, endDate] en formato YYYY-MM-DD.
 */
export const isDateInRange = (recordDate, startDate, endDate) => {
  if (!startDate && !endDate) return true;
  if (!recordDate) return false;

  const d = new Date(recordDate);
  if (isNaN(d.getTime())) return false;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateFormatted = `${yyyy}-${mm}-${dd}`;

  if (startDate && dateFormatted < startDate) return false;
  if (endDate && dateFormatted > endDate) return false;
  return true;
};

/**
 * Formatea una fecha a formato local Colombia (DD/MM/AAAA)
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Formatea una fecha y hora a formato local Colombia (DD/MM/AAAA HH:MM)
 */
export const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function DateRangeFilter({
  startDate = '',
  endDate = '',
  onChange,
  className = ''
}) {
  const [preset, setPreset] = useState('ALL');

  // Sincronizar preset cuando cambian startDate y endDate externamente
  useEffect(() => {
    if (!startDate && !endDate) {
      setPreset('ALL');
    }
  }, [startDate, endDate]);

  const handlePresetChange = (value) => {
    setPreset(value);
    const now = new Date();
    const toYMD = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (value === 'ALL') {
      onChange({ startDate: '', endDate: '' });
    } else if (value === 'TODAY') {
      const today = toYMD(now);
      onChange({ startDate: today, endDate: today });
    } else if (value === 'LAST_7_DAYS') {
      const past = new Date();
      past.setDate(now.getDate() - 6);
      onChange({ startDate: toYMD(past), endDate: toYMD(now) });
    } else if (value === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      onChange({ startDate: toYMD(start), endDate: toYMD(end) });
    } else if (value === 'LAST_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      onChange({ startDate: toYMD(start), endDate: toYMD(end) });
    } else if (value === 'THIS_YEAR') {
      const start = `${now.getFullYear()}-01-01`;
      const end = `${now.getFullYear()}-12-31`;
      onChange({ startDate: start, endDate: end });
    }
  };

  const handleStartDateChange = (val) => {
    setPreset('CUSTOM');
    onChange({ startDate: val, endDate });
  };

  const handleEndDateChange = (val) => {
    setPreset('CUSTOM');
    onChange({ startDate, endDate: val });
  };

  const handleClear = () => {
    setPreset('ALL');
    onChange({ startDate: '', endDate: '' });
  };

  const isFiltered = Boolean(startDate || endDate);

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {/* Selector de Período Rápido */}
      <div className={`flex items-center gap-1.5 bg-[#101010] border rounded-sm px-2 py-1 text-xs transition-colors ${
        isFiltered ? 'border-emerald-500/40 text-emerald-400' : 'border-[#2A2A2A] text-[#A0A0A0]'
      }`}>
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="bg-transparent text-xs text-[#EAEAEA] focus:outline-none cursor-pointer pr-1"
        >
          <option value="ALL" className="bg-[#1A1A1A]">Todas las fechas</option>
          <option value="TODAY" className="bg-[#1A1A1A]">Hoy</option>
          <option value="LAST_7_DAYS" className="bg-[#1A1A1A]">Últimos 7 días</option>
          <option value="THIS_MONTH" className="bg-[#1A1A1A]">Este Mes</option>
          <option value="LAST_MONTH" className="bg-[#1A1A1A]">Mes Anterior</option>
          <option value="THIS_YEAR" className="bg-[#1A1A1A]">Este Año</option>
          <option value="CUSTOM" className="bg-[#1A1A1A]">Personalizado</option>
        </select>
      </div>

      {/* Rango de Fechas (Desde / Hasta) */}
      <div className="flex items-center gap-1 bg-[#101010] border border-[#2A2A2A] rounded-sm px-2 py-0.5 text-xs">
        <span className="text-[10px] text-[#666666] font-medium">Desde:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartDateChange(e.target.value)}
          className="bg-transparent text-[#EAEAEA] text-xs focus:outline-none cursor-pointer w-[110px] font-mono"
        />
        <span className="text-[10px] text-[#666666] font-medium ml-1">Hasta:</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => handleEndDateChange(e.target.value)}
          className="bg-transparent text-[#EAEAEA] text-xs focus:outline-none cursor-pointer w-[110px] font-mono"
        />
        {isFiltered && (
          <button
            type="button"
            onClick={handleClear}
            className="text-slate-400 hover:text-rose-400 ml-1 p-0.5 rounded transition-colors"
            title="Limpiar filtro de fechas"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
