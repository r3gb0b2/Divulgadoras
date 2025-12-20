import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component to catch runtime errors.
 */
// Fix: Use Component from named import to ensure proper type resolution of props and state
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {

  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Properly initialize state inherited from Component
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render(): ReactNode {
    // Access state member inherited from Component
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500 text-center">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Ops! Algo deu errado.</h1>
            <p className="mb-6 text-gray-300">
              Ocorreu um erro inesperado na aplicação.
            </p>
             <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-white rounded-xl transition-colors font-bold shadow-lg"
            >
              Recarregar Página
            </button>
             <a href="/" className="block mt-6 text-sm text-gray-400 hover:text-white underline">
                Voltar para a Página Inicial
            </a>
          </div>
        </div>
      );
    }

    // Access props member inherited from Component
    return this.props.children;
  }
}

export default ErrorBoundary;