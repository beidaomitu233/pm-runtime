import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { ErrorBoundary } from './app/ErrorBoundary'
import { GlobalFeedback } from './app/GlobalFeedback'
import { RuntimeGate } from './app/RuntimeGate'
import { DiagnosticsPage, ProjectHomeRedirect, ProjectRouteGate, SettingsConnectionsPage } from './pages/ProjectPages'
import { ProjectsPageEnhanced as ProjectsPage } from './pages/ProjectsPageEnhanced'
import { MeetingsPageEnhanced } from './pages/MeetingsPageEnhanced'
import { MeetingDetailPageEnhanced } from './pages/MeetingDetailPageEnhanced'
import { DiagramsPageEnhanced } from './pages/DiagramsPageEnhanced'
import { DiagramDetailPageEnhanced, DiagramEditorPlaceholder } from './pages/DiagramDetailPageEnhanced'
import { initRuntimeConfig } from './api/client'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status
        return failureCount < 2 && status !== 400 && status !== 401 && status !== 403 && status !== 404
      },
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><RuntimeGate><Routes><Route element={<AppShell />}><Route path="/" element={<Navigate replace to="/projects" />} /><Route path="/projects" element={<ProjectsPage />} /><Route path="/projects/:projectId" element={<ProjectRouteGate />}><Route index element={<ProjectHomeRedirect />} /><Route path="meetings" element={<MeetingsPageEnhanced />} /><Route path="meetings/:meetingId" element={<MeetingDetailPageEnhanced />} /><Route path="diagrams" element={<DiagramsPageEnhanced />} /><Route path="diagrams/:diagramId" element={<DiagramDetailPageEnhanced />} /><Route path="diagrams/:diagramId/edit" element={<DiagramEditorPlaceholder />} /></Route><Route path="/settings/connections" element={<SettingsConnectionsPage />} /><Route path="/diagnostics" element={<DiagnosticsPage />} /><Route path="*" element={<Navigate replace to="/projects" />} /></Route></Routes></RuntimeGate><GlobalFeedback /></BrowserRouter></QueryClientProvider>
}

// 渲染前完成生产注入（Tauri 上下文内走 runtime_start；纯浏览器开发为 no-op）。
// 失败不阻塞渲染：RuntimeGate 会按 getConfig() 的回落展示不可用状态。
void initRuntimeConfig().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>)
})
