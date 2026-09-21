import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { apiClient, RuntimeApiError } from '../api/client'
import { useUiStore } from '../state/uiStore'

export function AppShell() {
  return <div className="app-shell"><header className="topbar"><div><span className="brand-mark">PM</span><span className="brand-name">PM Runtime</span></div><ProjectSwitcher /><div className="runtime-badge"><span /> Runtime 已连接</div></header><div className="app-body"><aside className="sidebar"><nav aria-label="主导航"><NavLink to="/projects" className={navClass}>项目</NavLink><NavLink to="/settings/connections" className={navClass}>连接设置</NavLink><NavLink to="/diagnostics" className={navClass}>诊断</NavLink></nav></aside><main className="main-content"><Outlet /></main></div></div>
}

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link${isActive ? ' active' : ''}`
}

function ProjectSwitcher() {
  const location = useLocation()
  const navigate = useNavigate()
  const setRecentProjectId = useUiStore((state) => state.setRecentProjectId)
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => apiClient.listProjects('?limit=50'), staleTime: 30_000 })
  const currentProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1]

  if (projects.isPending) return <div className="project-switcher muted">加载项目…</div>
  if (projects.isError) return <div className="project-switcher muted">项目列表暂不可用</div>
  if (!projects.data.items.length) return <div className="project-switcher muted">暂无项目</div>

  const changeProject = (projectId: string) => {
    setRecentProjectId(projectId)
    if (!currentProjectId) {
      navigate(`/projects/${projectId}/meetings`)
      return
    }
    navigate(location.pathname.replace(`/projects/${currentProjectId}`, `/projects/${projectId}`))
  }

  return <label className="project-switcher"><span className="sr-only">当前项目</span><select value={currentProjectId ?? ''} onChange={(event) => changeProject(event.target.value)}><option value="" disabled>选择项目</option>{projects.data.items.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
}

export function PageError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const requestId = error instanceof RuntimeApiError ? error.requestId : undefined
  return <section className="inline-error" role="alert"><strong>暂时无法加载</strong><p>{error instanceof Error ? error.message : 'Runtime 返回了未知错误。'}</p>{requestId && <span className="request-id">requestId：{requestId}</span>}{onRetry && <button className="button sm" onClick={onRetry}>重试</button>}</section>
}
