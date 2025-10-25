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
  // FIX: All errors are caused by state not being properly declared on the class.
  // Initializing state as a class property correctly declares it and resolves the cascading type errors for `state`, `setState`, and `props`.
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Este método de ciclo de vida é acionado após um erro ser lançado por um componente descendente.
    // Usamos para atualizar o estado e renderizar uma UI de fallback.
    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo,
    });
    // Você também pode registrar o erro em um serviço de relatórios de erro aqui
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // UI de Fallback
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

    // Normalmente, apenas renderiza os filhos
    return this.props.children;
  }
}

export default ErrorBoundary;
