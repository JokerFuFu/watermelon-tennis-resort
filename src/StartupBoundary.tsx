import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Keeps the recovery screen available if React cannot render the workbench. */
export default class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('工作台未能完成渲染', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="startup-recovery-shell" data-startup-recovery role="alert" aria-labelledby="startup-recovery-title">
      <div className="startup-recovery-card">
        <div className="startup-recovery-brand">🍉 西瓜网球度假酒店</div>
        <h1 id="startup-recovery-title">页面没有完成加载</h1>
        <p>工作台暂时无法显示，请重新加载此页。已保存的方案不会被删除。</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载此页</button>
      </div>
    </main>
  }
}
