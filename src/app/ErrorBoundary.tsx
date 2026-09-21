import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep diagnostics in the UI only; meeting content and tokens are not logged.
    console.error('PM Runtime UI error', error.message, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="center-page" role="alert">
        <section className="status-card">
          <p className="eyebrow">应用错误</p>
          <h1>页面暂时无法显示</h1>
          <p>可以刷新页面重试。如果问题持续，请从设置中复制去敏诊断信息。</p>
          <button className="button primary" onClick={() => window.location.reload()}>刷新页面</button>
        </section>
      </main>
    )
  }
}
