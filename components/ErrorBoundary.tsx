import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  // FIX: Replaced the constructor with a class property for state initialization.
  // This is a more modern syntax that should resolve the type errors where `this.state`, 
  // `this.props`, and `this.setState` were not being found on the component instance.
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // This lifecycle method is called after an error has been thrown by a descendant component.
    // It should return a value to update state.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // This lifecycle method is also called after an error has been thrown by a descendant component.
    // It receives two parameters: the error that was thrown, and an object with a componentStack key.
    this.setState({
      errorInfo: errorInfo,
    });
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-6 rounded-md shadow-lg" role="alert">
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
            <details className="mt-6 text-left bg-black/30 p-3 rounded-md">
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

    return this.props.children;
  }
}

export default ErrorBoundary;
