import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/Layout/AppLayout'
import Dashboard from './pages/Dashboard'
import TransferList from './pages/TransferList'
import ServerSettings from './pages/ServerSettings'
import ScheduleConfig from './pages/ScheduleConfig'
import FileWatcher from './pages/FileWatcher'
import AppSettings from './pages/AppSettings'

const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="transfers" element={<TransferList />} />
          <Route path="servers" element={<ServerSettings />} />
          <Route path="schedules" element={<ScheduleConfig />} />
          <Route path="watchers" element={<FileWatcher />} />
          <Route path="settings" element={<AppSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
