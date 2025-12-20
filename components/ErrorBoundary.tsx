
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
 * FIXED: Extending Component directly from the named import to ensure proper inheritance chain detection by the TypeScript compiler.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // FIX: Removed 'override' keyword as the compiler was failing to verify the base class member.
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  // FIX: Removed 'override' keyword to resolve compilation error when inheritance is not correctly detected.
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // FIX: setState is now correctly recognized as a member of the base class.
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  // FIX: Removed 'override' keyword to resolve compilation error.
  public render() {
    // FIX: state is now correctly recognized as a member of the base class.
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Ops! Algo deu errado.</h1>
            <p className="mb-4 text-gray-300">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            {this.state.error && (
              <div className="bg-gray-900 p-3 rounded border border-gray-700 text-sm font-mono overflow-auto mb-4">
                <p className="text-red-400">{this.state.error.toString()}</p>
              </div>
            )}
             <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded transition-colors font-semibold"
            >
              Recarregar Página
            </button>
             <a href="/" className="block text-center mt-4 text-sm text-gray-400 hover:text-white underline">
                Voltar para a Página Inicial
            </a>
          </div>
        </div>
      );
    }

    // FIX: props is now correctly recognized as a member of the base class.
    return this.props.children;
  }
}

export default ErrorBoundary;
