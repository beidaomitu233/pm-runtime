import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../api/client'
import { PageError } from '../app/AppShell'

export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => apiClient.listProjects('?limit=50') })
  if (projects.isPending) return <PageFrame title="项目"><div className="skeleton-list"><div /><div /><div /></div></PageFrame>
  if (projects.isError) return <PageFrame title="项目"><PageError error={projects.error} onRetry={() => void projects.refetch()} /></PageFrame>
  return <PageFrame title="项目"><div className="page-heading"><div><p className="eyebrow">本机项目</p><h1>项目</h1><p>选择项目后查看会议和流程图。</p></div><button className="button primary" disabled title="FE-008 承接创建项目表单">新建项目</button></div>{projects.data.items.length ? <div className="project-grid">{projects.data.items.map((project) => <Link className="project-card" key={project.id} to={`/projects/${project.id}/meetings`}><div className="project-card-icon">{project.name.slice(0, 1)}</div><div><h2>{project.name}</h2><p>{project.description || '暂无项目说明'}</p><time dateTime={project.updatedAt}>最近更新：{formatDate(project.updatedAt)}</time></div></Link>)}</div> : <EmptyProjects />}</PageFrame>
}

function PageFrame({ title, children }: { title: string; children: React.ReactNode }) { return <section aria-labelledby="page-title"><div className="sr-only"><h1 id="page-title">{title}</h1></div>{children}</section> }
function EmptyProjects() { return <div className="empty-state"><div className="empty-icon">＋</div><h2>还没有项目</h2><p>创建第一个项目后，从会议资料开始整理流程。</p><button className="button primary" disabled title="FE-008 承接创建项目表单">新建项目</button></div> }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date) }
