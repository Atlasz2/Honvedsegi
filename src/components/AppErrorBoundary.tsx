import React from "react";

type State = {
  hasError: boolean;
  message: string;
};

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Ismeretlen hiba",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("UI runtime error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0f14", color: "#e5e7eb", fontFamily: "Rajdhani, sans-serif", padding: 16 }}>
          <div style={{ maxWidth: 760, width: "100%", border: "1px solid #334155", borderTop: "3px solid #22c55e", padding: 16, background: "#111827" }}>
            <h1 style={{ margin: 0, fontSize: 28 }}>Alkalmazás hiba</h1>
            <p style={{ marginTop: 8, opacity: 0.9 }}>A felület futás közben hibába ütközött.</p>
            <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", background: "#0f172a", padding: 12, border: "1px solid #1f2937" }}>{this.state.message}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "8px 12px", border: "1px solid #22c55e", background: "transparent", color: "#22c55e", cursor: "pointer" }}>
              Újratöltés
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
