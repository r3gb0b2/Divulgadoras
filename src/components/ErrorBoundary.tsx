
import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component to catch runtime errors in the component tree.
 * Inherits from React.Component to provide standard error handling behavior.
 */
// Fix: Use React.Component explicitly to ensure proper type resolution of props, state, and methods like setState
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {

  // Explicit constructor with props to ensure proper initialization
  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Initialize state inherited from React.Component
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  // Handle errors during lifecycle
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // Using setState from inherited React.Component class
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render(): ReactNode {
    // Access state member inherited from React.Component
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Ops! Algo deu errado.</h1>
            <p className="mb-4 text-gray-300">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            {/* Checking error state using inherited state member */}
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

    // Access props member inherited from React.Component
    return this.props.children;
  }
}

export default ErrorBoundary;
