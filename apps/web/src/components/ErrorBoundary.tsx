import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 border border-red-200">
            <div className="text-center">
              <div className="text-red-600 text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-red-900 mb-4">
                Oops! Something went wrong
              </h1>
              <p className="text-red-700 mb-6">
                The application encountered an unexpected error. Please refresh
                the page to try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Refresh Page
              </button>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-red-800 font-medium">
                    Error Details (Development)
                  </summary>
                  <pre className="mt-2 p-4 bg-red-100 rounded text-sm text-red-800 overflow-auto">
                    {this.state.error.message}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
