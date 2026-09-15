import React from 'react';
import { Printer, X } from 'lucide-react';

export default function InvoicePrintView({ document, onClose }) {
  if (!document) return null;

  const handlePrint = () => {
    window.print();
  };

  const isInvoice = document.doc_type === 'FACTURA';

  const formatMoney = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] text-[#EAEAEA] rounded-sm w-full max-w-4xl max-h-[90vh] flex flex-col shadow-none overflow-hidden text-xs">
        {/* Bar superior no imprimible */}
        <div className="p-3 bg-[#101010] border-b border-[#2A2A2A] flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Vista Previa de {isInvoice ? 'Factura' : 'Cotización'}</span>
            <span className="font-mono text-[11px] text-slate-400">({document.doc_number})</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-sm text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" strokeWidth={1.5} /> Imprimir / PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#A0A0A0] hover:text-[#EAEAEA] bg-[#101010] border border-[#2A2A2A] rounded-sm"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Área imprimible en blanco puro */}
        <div className="p-8 sm:p-12 overflow-y-auto bg-white text-slate-900 printable-area space-y-6 font-sans">
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3.5">
              <img 
                src="/prisma_icon.png" 
                alt="Prisma Lab" 
                className="w-14 h-14 object-contain" 
              />
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">PRISMA LAB 3D</h1>
                <p className="text-xs text-slate-600">Servicios e Impresión 3D Profesional</p>
                <p className="text-[10px] text-slate-500">contacto@prismalab.co | +57 300 000 0000</p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-2.5 py-0.5 rounded-sm text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                {document.doc_type}
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1 font-mono">{document.doc_number}</h2>
              <p className="text-[11px] text-slate-500">Fecha: {new Date(document.created_at || Date.now()).toLocaleDateString('es-CO')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-sm border border-slate-200 text-xs">
            <div>
              <p className="font-semibold text-slate-500 uppercase text-[9px] mb-0.5">CLIENTE / FACTURADO A</p>
              <h3 className="font-bold text-slate-900">{document.customer ? document.customer.name : 'CLIENTE GENERAL PRISMA LAB'}</h3>
              <p className="text-slate-600 text-[11px]">{document.customer?.email || 'contacto@cliente.com'}</p>
            </div>

            <div className="text-right space-y-0.5 text-[11px]">
              <p className="font-semibold text-slate-500 uppercase text-[9px]">PAGO</p>
              <p className="text-slate-700">Estado: <span className="font-bold text-slate-900">{document.status}</span></p>
            </div>
          </div>

          <div className="overflow-hidden border border-slate-200 rounded-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Descripción Ítem</th>
                  <th className="py-2.5 px-3 text-center">Cant</th>
                  <th className="py-2.5 px-3 text-right">Precio Unitario</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {document.items && document.items.length > 0 ? (
                  document.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{item.product_name}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{item.quantity} und</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">${formatMoney(item.unit_price)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${formatMoney(item.total_price)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-slate-800">Servicio de Fabricación e Impresión 3D</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{document.quantity || 1} und</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">${formatMoney(document.subtotal)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${formatMoney(document.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-56 space-y-1.5 text-xs bg-slate-50 p-3 rounded-sm border border-slate-200">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">${formatMoney(document.subtotal)}</span>
              </div>
              {Number(document.discount) > 0 && (
                <div className="flex justify-between text-amber-600 font-medium">
                  <span>Descuento:</span>
                  <span className="font-mono">-${formatMoney(document.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-bold border-t border-slate-300 pt-1.5">
                <span>TOTAL:</span>
                <span className="font-mono">${formatMoney(document.total)} COP</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
