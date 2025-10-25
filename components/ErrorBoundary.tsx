import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 rounded-md" role="alert">
          <h1 className="font-bold text-lg mb-2">Oops! Algo deu errado.</h1>
          <p>Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.</p>
          {this.state.error && (
            <pre className="mt-4 text-xs whitespace-pre-wrap">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
