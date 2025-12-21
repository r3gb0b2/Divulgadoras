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
 * Standard implementation using React Class Component.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // FIX: Explicitly defined state property with its type.
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  // Static method for error state transformation.
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  // Standard lifecycle method for side-effects when an error is caught.
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error("Uncaught error:", error, errorInfo);
    
    // FIX: Inherited setState correctly typed and accessible in class components.
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render() {
    // FIX: Correct access to state in class component.
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Ops! Algo deu errado.</h1>
            <p className="mb-4 text-gray-300">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            {/* FIX: Safely accessing error state from inherited state object. */}
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

    // FIX: Accessing children via this.props.
    return this.props.children;
  }
}

export default ErrorBoundary;