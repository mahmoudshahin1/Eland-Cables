import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 shadow-sm max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-rose-900">
                {this.props.fallbackTitle || 'Component Encountered an Issue'}
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                {this.state.error?.message || 'An unexpected rendering error occurred in this view.'}
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={this.handleReset}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              <RefreshCw className="w-4 h-4 me-1.5" />
              Reset & Try Again
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
              className="bg-white border-rose-200 text-rose-800"
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
