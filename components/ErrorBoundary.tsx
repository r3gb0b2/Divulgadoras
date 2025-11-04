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
  // FIX: Switched to a constructor for state initialization. Using class properties for state (`state = ...`) can fail if the build configuration (e.g., Babel or TypeScript) isn't set up for it, leading to an undefined `this` context and errors like 'setState' or 'props' not being found. The constructor is the standard and safest way to initialize state in a React class component.
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // FIX: With the constructor correctly initializing the component, 'this.setState' is now available and works as expected.
    this.setState({
      errorInfo: errorInfo,
    });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    // FIX: Accessing `this.state` is now safe because it's initialized in the constructor.
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

    // FIX: Accessing `this.props` is now safe because `super(props)` was called in the constructor.
    return this.props.children;
  }
}

export default ErrorBoundary;
