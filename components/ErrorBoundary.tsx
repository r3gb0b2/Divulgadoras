
import React, { ErrorInfo, ReactNode } from 'react';

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
// Fix: Inherit from React.Component directly to ensure base class properties like 'state' and 'props' are recognized.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Added constructor with super(props) and explicitly initialized state to properly set up class component inheritance.
  constructor(props: ErrorBoundaryProps) {
    super(props);
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
    // Fix: Access state member inherited from React.Component base class.
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

    // Fix: Access props member inherited from React.Component base class.
    return this.props.children;
  }
}

export default ErrorBoundary;
