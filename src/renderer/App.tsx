import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/Layout/AppLayout'
import Dashboard from './pages/Dashboard'
import TransferList from './pages/TransferList'
import ServerSettings from './pages/ServerSettings'
import ScheduleConfig from './pages/ScheduleConfig'
import FileWatcher from './pages/FileWatcher'
import ServerBrowser from './pages/ServerBrowser'
import AppSettings from './pages/AppSettings'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#ff4d4f' }}>
          <h2>应用加载错误</h2>
          <pre>{this.state.error?.message}</pre>
          <pre style={{ fontSize: 12, color: '#999' }}>{this.state.error?.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="transfers" element={<TransferList />} />
            <Route path="servers" element={<ServerSettings />} />
            <Route path="schedules" element={<ScheduleConfig />} />
            <Route path="watchers" element={<FileWatcher />} />
            <Route path="browser" element={<ServerBrowser />} />
            <Route path="settings" element={<AppSettings />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
