import type { FormEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient, RuntimeApiError } from '../api/client'
import { PageError } from '../app/AppShell'
import type { ProjectSummary } from '../types/contracts'
import './projects.css'

export function ProjectsPageEnhanced() {
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<'create' | 'rename' | null>(null)
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null)
  const projects = useQuery({
    queryKey: ['projects', search],
    queryFn: () => apiClient.listProjects(buildQuery(search)),
    placeholderData: (previous) => previous,
  })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const createMutation = useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) => apiClient.createProject(name, description),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setDialog(null)
      navigate(`/projects/${project.id}/meetings`)
    },
  })
  const renameMutation = useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) => apiClient.renameProject(projectId, name),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })
      setDialog(null)
      setRenameTarget(null)
    },
  })

  if (projects.isPending) return <PageFrame title="项目"><div className="skeleton-list"><div /><div /><div /></div></PageFrame>
  if (projects.isError) return <PageFrame title="项目"><PageError error={projects.error} onRetry={() => void projects.refetch()} /></PageFrame>

  return <PageFrame title="项目">
    <div className="page-heading"><div><p className="eyebrow">本机项目</p><h1>项目</h1><p>选择项目后查看会议和流程图。</p></div><button className="button primary" onClick={() => setDialog('create')}>新建项目</button></div>
    <div className="list-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">搜索项目</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目名称" /></label><span className="toolbar-count">{projects.data.items.length} 个项目</span></div>
    {projects.data.items.length ? <div className="project-grid">{projects.data.items.map((project) => <ProjectCard key={project.id} project={project} onRename={() => { setRenameTarget(project); setDialog('rename') }} />)}</div> : <EmptyProjects onCreate={() => setDialog('create')} />}
    {projects.data.nextCursor && <button className="button load-more" disabled title="cursor 分页待后端列表合同完成后启用">加载更多</button>}
    {dialog === 'create' && <ProjectDialog title="新建项目" submitLabel="创建项目" pending={createMutation.isPending} error={createMutation.error} onClose={() => { setDialog(null); createMutation.reset() }} onSubmit={(name, description) => createMutation.mutate({ name, description })} />}
    {dialog === 'rename' && renameTarget && <ProjectDialog title="重命名项目" initialName={renameTarget.name} submitLabel="保存名称" pending={renameMutation.isPending} error={renameMutation.error} onClose={() => { setDialog(null); setRenameTarget(null); renameMutation.reset() }} onSubmit={(name) => renameMutation.mutate({ projectId: renameTarget.id, name })} />}
  </PageFrame>
}

function ProjectCard({ project, onRename }: { project: ProjectSummary; onRename: () => void }) {
  return <article className="project-card"><Link className="project-card-link" to={`/projects/${project.id}/meetings`}><div className="project-card-icon">{project.name.slice(0, 1)}</div><div className="project-card-copy"><h2>{project.name}</h2><p>{project.description || '暂无项目说明'}</p><time dateTime={project.updatedAt}>最近更新：{formatDate(project.updatedAt)}</time></div></Link><button className="icon-button" aria-label={`重命名 ${project.name}`} title="重命名" onClick={onRename}>···</button></article>
}

function ProjectDialog({ title, initialName = '', submitLabel, pending, error, onClose, onSubmit }: { title: string; initialName?: string; submitLabel: string; pending: boolean; error: unknown; onClose: () => void; onSubmit: (name: string, description?: string) => void }) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) onClose() }; document.addEventListener('keydown', onKeyDown); return () => document.removeEventListener('keydown', onKeyDown) }, [onClose, pending])
  const validation = name.trim().length === 0 ? '请输入项目名称。' : name.trim().length > 80 ? '项目名称不能超过 80 个字符。' : undefined
  const submit = (event: FormEvent) => { event.preventDefault(); if (!validation && !pending) onSubmit(name.trim(), description.trim() || undefined) }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><div className="modal-header"><h2 id="project-dialog-title">{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose} disabled={pending}>×</button></div><form onSubmit={submit}><div className="modal-body"><label className="form-field"><span>项目名称 <i>*</i></span><input ref={nameRef} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(validation)} aria-describedby={validation ? 'project-name-error' : undefined} /></label>{title === '新建项目' && <label className="form-field"><span>项目说明</span><textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} /></label>}{validation && <p className="field-error" id="project-name-error">{validation}</p>}{error && <p className="field-error" role="alert">{error instanceof RuntimeApiError ? error.message : '保存项目失败，请重试。'}{error instanceof RuntimeApiError && error.requestId && <small>requestId：{error.requestId}</small>}</p>}</div><div className="modal-footer"><button type="button" className="button" onClick={onClose} disabled={pending}>取消</button><button type="submit" className="button primary" disabled={Boolean(validation) || pending}>{pending ? '保存中…' : submitLabel}</button></div></form></section></div>
}

function PageFrame({ title, children }: { title: string; children: ReactNode }) { return <section aria-labelledby="page-title"><div className="sr-only"><h1 id="page-title">{title}</h1></div>{children}</section> }
function EmptyProjects({ onCreate }: { onCreate: () => void }) { return <div className="empty-state"><div className="empty-icon">＋</div><h2>还没有项目</h2><p>创建第一个项目后，从会议资料开始整理流程。</p><button className="button primary" onClick={onCreate}>新建项目</button></div> }
function buildQuery(search: string) { const params = new URLSearchParams({ limit: '50' }); if (search.trim()) params.set('q', search.trim()); return `?${params.toString()}` }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date) }
