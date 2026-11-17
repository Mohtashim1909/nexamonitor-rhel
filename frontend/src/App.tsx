import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { OverviewPage } from '@/pages/OverviewPage'
import { ContainersPage } from '@/pages/ContainersPage'
import { ContainerDetailPage } from '@/pages/ContainerDetailPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { LogsPage } from '@/pages/LogsPage'
import { SystemHealthPage } from '@/pages/SystemHealthPage'
import { ComparisonsPage } from '@/pages/ComparisonsPage'
import { ImagesPage } from '@/pages/ImagesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="containers" element={<ContainersPage />} />
        <Route path="containers/:id" element={<ContainerDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="system" element={<SystemHealthPage />} />
        <Route path="comparisons" element={<ComparisonsPage />} />
        <Route path="images" element={<ImagesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
