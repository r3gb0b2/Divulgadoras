
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
/* FIX: Explicitly extending Component from react to ensure state, setState, and props are correctly inherited and recognized by TypeScript. The errors on lines 21, 40, 48, 56, 58, and 75 indicated that 'ErrorBoundary' was not being treated as a proper React class component. */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    /* FIX: Correctly initializing state in the constructor to fix the 'state does not exist' error on line 21 */
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // Static method for error state transformation.
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  // Standard lifecycle method for side-effects when an error is caught.
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error("Uncaught error:", error, errorInfo);
    
    /* FIX: Accessing this.setState which is now properly inherited from the Component class, fixing the error on line 40 */
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render() {
    /* FIX: Correctly accessing state from the component instance, fixing errors on lines 48, 56, and 58 */
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

    /* FIX: Correctly accessing children from this.props, fixing the error on line 75 */
    return this.props.children;
  }
}

export default ErrorBoundary;
