
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component to catch and handle uncaught errors in child components.
 */
// Fix: Use imported Component directly to ensure correct inheritance and resolve 'state', 'setState', and 'props' errors
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Fix: state is inherited from Component
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error("Uncaught error:", error, errorInfo);
    
    // Fix: setState is inherited from Component
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render() {
    // Fix: state is inherited from Component
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500 text-center">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
               <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Ops! Algo deu errado.</h1>
            <p className="mb-4 text-gray-400">
              Ocorreu um erro inesperado. Por favor, tente recarregar a página ou voltar para o início.
            </p>
            <div className="flex flex-col gap-2">
                <button
                onClick={() => window.location.reload()}
                className="w-full py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded transition-colors font-semibold"
                >
                Recarregar Página
                </button>
                <a href="/#/admin" className="block py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors font-semibold">
                    Voltar ao Painel
                </a>
            </div>
          </div>
        </div>
      );
    }

    // Fix: props is inherited from Component
    return this.props.children;
  }
}

export default ErrorBoundary;
