import { Component, Suspense } from "react";
import PrimarySpinner from "@/components/ui/spinner";
import { useLocation } from "react-router-dom";

class PageErrorBoundary extends Component {
  state = { failed: false, pathname: null };

  static getDerivedStateFromProps({ pathname }, state) {
    // Reset failure on navigation without remounting the persistent staff layout.
    return pathname === state.pathname ? null : { failed: false, pathname };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">This page could not load</h1>
          <p>Check your connection, then reload to try again.</p>
          <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a href="/">Return home</a>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RouteContent({ children }) {
  const { pathname } = useLocation();
  // A failed deployment chunk needs a fresh document; repeatedly importing its old URL cannot recover it.
  return (
    <PageErrorBoundary pathname={pathname}>
      <Suspense fallback={<div role="status" aria-label="Loading page"><PrimarySpinner /></div>}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
