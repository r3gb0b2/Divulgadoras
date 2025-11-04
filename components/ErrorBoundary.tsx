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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  // FIX: Switched from a class property for state to constructor-based initialization.
  // This ensures `this` context is correctly established for React class components across different TypeScript configurations,
  // resolving errors where properties like 'state', 'setState', and 'props' are not recognized.
=======
  // FIX: Switched from class property to constructor-based state initialization. This resolves potential TypeScript type inference issues, ensuring `this` is correctly typed as a React.Component instance and has access to `setState` and `props`.
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
=======
  // FIX: Switched from class property to constructor-based state initialization. This resolves potential TypeScript type inference issues, ensuring `this` is correctly typed as a React.Component instance and has access to `setState` and `props`.
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }
<<<<<<< HEAD
<<<<<<< HEAD
=======
  // FIX: Switched from constructor-based state initialization to class property syntax. This explicitly declares the 'state' property on the class, which can resolve TypeScript errors where inherited properties are not correctly identified.
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };
>>>>>>> parent of acb136d (fix(storage): Organize post proofs in nested folders)
=======
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
=======
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
    // FIX: Correctly call this.setState to update the state with error information. This method is inherited from React.Component.
>>>>>>> parent of acb136d (fix(storage): Organize post proofs in nested folders)
=======
    // FIX: With state initialization moved to the constructor, `this.setState` is now correctly recognized as an inherited method, fixing the error.
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
=======
    // FIX: With state initialization moved to the constructor, `this.setState` is now correctly recognized as an inherited method, fixing the error.
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
    this.setState({
      errorInfo: errorInfo,
    });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
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

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
    // FIX: Correctly access this.props.children. `props` is a property of a React.Component instance.
>>>>>>> parent of acb136d (fix(storage): Organize post proofs in nested folders)
=======
    // FIX: `this.props` is now correctly recognized as an inherited property, fixing the error.
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
=======
    // FIX: `this.props` is now correctly recognized as an inherited property, fixing the error.
>>>>>>> parent of e2d7194 (fix(PostCheck): Simplify conditional rendering for inactive posts)
    return this.props.children;
  }
}

export default ErrorBoundary;
