import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Lad UI crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="app-error-boundary">
        <section className="app-error-boundary__panel" aria-labelledby="app-error-title">
          <span>Лад восстановится</span>
          <h1 id="app-error-title">Экран не загрузился</h1>
          <p>Последнее расписание и записи сохранены на устройстве. Перезапусти интерфейс, чтобы продолжить.</p>
          <button type="button" onClick={() => window.location.reload()}>Перезапустить</button>
        </section>
      </main>
    );
  }
}
