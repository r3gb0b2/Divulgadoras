import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// FIX: To function as an Error Boundary, this must be a class component that extends React.Component.
// This gives it access to state, props, and the necessary lifecycle methods.
class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    // FIX: Initialize state in the constructor. The 'state' property does not exist on a plain class.
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // FIX: Updated getDerivedStateFromError to return a full State object to conform to React's type definitions.
  static getDerivedStateFromError(error: Error): State {
    // This lifecycle method is called after an error has been thrown by a descendant component.
    // It should return a value to update state.
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // This lifecycle method is also called after an error has been thrown by a descendant component.
    // It receives two parameters: the error that was thrown, and an object with a componentStack key.
    // FIX: Use 'this.setState' which is available on React.Component.
    this.setState({
      errorInfo: errorInfo,
    });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    // FIX: Access state via 'this.state' which is available on React.Component.
    if (this.state.hasError) {
      return (
        <div className="bg-red-900 bg-opacity-50 border-l-4 border-red-500 text-red-200 p-6 rounded-md shadow-lg" role="alert">
          <h1 className="text-2xl font-bold mb-2">Ops! Algo deu errado.</h1>
          <p className="mb-4">
            A aplicação encontrou um erro inesperado. Isso pode ser um problema temporário ou um bug.
          </p>
          <p className="mb-4">Tente recarregar a página. Se o problema persistir, entre em contato com o suporte.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700"
          >
            Recarregar Página
          </button>
          
          {this.state.error && (
            <details className="mt-6 text-left bg-black bg-opacity-30 p-3 rounded-md">
              <summary className="cursor-pointer font-semibold text-red-100">Detalhes técnicos do erro</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap">
                <strong>Mensagem:</strong> {this.state.error.toString()}
                {this.state.errorInfo && (
                  <>
                    <br /><br />
                    <strong>Stack de Componentes:</strong>
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
        </div>
      );
    }

    // FIX: Access children via 'this.props' which is available on React.Component.
    return this.props.children;
  }
}

export default ErrorBoundary;