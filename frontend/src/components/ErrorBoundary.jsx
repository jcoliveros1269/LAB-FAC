import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-6 bg-[#141414] border border-[#2A2A2A] rounded-sm text-center space-y-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-full text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#EAEAEA]">Ocurrió un error inesperado en la vista</h2>
            <p className="text-xs text-[#A0A0A0] max-w-md">
              {this.state.error?.message || 'Error en el renderizado de la interfaz.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-[#EAEAEA] rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
            <button
              onClick={this.handleReload}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
