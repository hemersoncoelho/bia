import React, { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-6">
            <h1 className="text-xl font-semibold text-stone-200">Algo deu errado</h1>
            <p className="text-sm text-stone-500 font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors mx-auto"
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
