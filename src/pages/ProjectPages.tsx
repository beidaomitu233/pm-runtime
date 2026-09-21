import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { PageError } from '../app/AppShell'

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export function ProjectRouteGate() {
  const { projectId } = useParams()
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => apiClient.getProject(projectId!), enabled: Boolean(projectId && ulidPattern.test(projectId)) })
  if (!projectId || !ulidPattern.test(projectId)) return <ProjectNotFound reason="项目 ID 格式无效。" />
  if (project.isPending) return <div className="loading-panel">正在加载项目…</div>
  if (project.isError) return <ProjectNotFound reason={project.error instanceof Error ? project.error.message : '项目不存在或已归档。'} />
  return <ProjectContext projectName={project.data.name}><Outlet /></ProjectContext>
}

function ProjectContext({ projectName, children }: { projectName: string; children: React.ReactNode }) { return <div className="project-context"><div className="context-bar"><Link to="/projects">项目</Link><span>/</span><strong title={projectName}>{projectName}</strong></div>{children}</div> }

export function ProjectHomeRedirect() { const { projectId } = useParams(); return <Navigate replace to={`/projects/${projectId}/meetings`} /> }

export function MeetingsPage() { return <ProjectPlaceholder title="会议" description="会议导入、分块查看和 meeting ID 复制将在 FE-012～FE-017 中接入。" /> }
export function DiagramsPage() { return <ProjectPlaceholder title="流程图" description="图形列表、版本和导出将在 FE-018～FE-025 中接入。" /> }

function ProjectPlaceholder({ title, description }: { title: string; description: string }) { const navigate = useNavigate(); return <section className="placeholder-card"><p className="eyebrow">项目主线</p><h1>{title}</h1><p>{description}</p><div className="button-row"><button className="button" onClick={() => navigate('/projects')}>返回项目列表</button></div></section> }

export function ProjectNotFound({ reason }: { reason: string }) { return <section className="placeholder-card"><p className="eyebrow">404</p><h1>找不到这个项目</h1><p>{reason}</p><Link className="button primary" to="/projects">返回项目列表</Link></section> }

export function SettingsConnectionsPage() { return <SettingsPlaceholder title="连接设置" description="Runtime 连接与宿主适配状态将在 FE-026～FE-027 中接入。" /> }
export function DiagnosticsPage() { return <SettingsPlaceholder title="诊断" description="当前页面只提供入口占位；FE-029 将补充去敏诊断摘要。" /> }
function SettingsPlaceholder({ title, description }: { title: string; description: string }) { return <section className="placeholder-card"><p className="eyebrow">设置</p><h1>{title}</h1><p>{description}</p></section> }

export function ProjectErrorBoundaryPage() { return <PageError error={new Error('项目页面加载失败。')} /> }
