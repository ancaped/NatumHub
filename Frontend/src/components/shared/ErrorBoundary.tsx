import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.onReset) {
      this.onReset();
    }
  };

  private get onReset() {
    return this.props.onReset;
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 border border-zinc-200 rounded-2xl my-4 max-w-2xl mx-auto text-center shadow-sm animate-in fade-in duration-200">
          <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4 border border-red-100">
            <AlertTriangle className="h-8 w-8" />
          </div>
          
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
            {this.props.fallbackTitle || 'Algo deu errado ao carregar esta tela'}
          </h2>
          
          <p className="text-sm text-zinc-500 mt-2 max-w-md">
            Ocorreu um erro inesperado na interface deste módulo. Tente recarregar ou retornar ao Painel Inicial.
          </p>

          {this.state.error && (
            <div className="w-full mt-6 bg-zinc-900 text-zinc-300 p-4 rounded-xl text-left font-mono text-xs overflow-auto max-h-48 border border-zinc-800 shadow-inner">
              <span className="text-red-400 font-bold">Erro:</span> {this.state.error.message}
              {this.state.error.stack && (
                <pre className="mt-2 text-[10px] text-zinc-500 leading-relaxed overflow-x-auto whitespace-pre">
                  {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
            >
              <RotateCcw className="h-4 w-4" /> Tentar Novamente
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
            >
              <Home className="h-4 w-4" /> Voltar ao Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
