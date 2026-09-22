import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import type { DiagramStatus, DiagramSummary, DiagramType } from '@pm/contracts'
import { apiClient } from '../api/client'
import { PageError } from '../app/AppShell'
import './diagrams.css'

export function DiagramsPageEnhanced() {
  const { projectId } = useParams()
  const [type, setType] = useState<DiagramType | ''>('')
  const [status, setStatus] = useState<DiagramStatus | ''>('')
  const diagrams = useQuery({ queryKey: ['diagrams', projectId, type, status], queryFn: () => apiClient.listDiagrams(projectId!, buildQuery(type, status)), enabled: Boolean(projectId) })

  return <section className="diagram-page">
    <div className="page-heading"><div><p className="eyebrow">项目主线</p><h1>流程图</h1><p>查看 Agent 生成的流程图和泳道图版本。</p></div></div>
    <div className="diagram-toolbar"><select aria-label="图形类型筛选" value={type} onChange={(event) => setType(event.target.value as DiagramType | '')}><option value="">全部类型</option><option value="flowchart">流程图</option><option value="swimlane">泳道图</option></select><select aria-label="图形状态筛选" value={status} onChange={(event) => setStatus(event.target.value as DiagramStatus | '')}><option value="">全部状态</option><option value="ready">可编辑</option><option value="render_failed">生成失败</option><option value="rendering">生成中</option></select></div>
    {diagrams.isPending && <div className="skeleton-list" aria-label="流程图加载中"><div /><div /><div /></div>}
    {diagrams.isError && <PageError error={diagrams.error} onRetry={() => void diagrams.refetch()} />}
    {diagrams.data && (diagrams.data.items.length ? <div className="diagram-list">{diagrams.data.items.map((diagram) => <DiagramRow key={diagram.id} diagram={diagram} />)}</div> : <div className="empty-state"><div className="empty-icon">◇</div><h2>还没有流程图</h2><p>在宿主 Agent 中调用 diagram.render 后，图形会出现在这里。</p></div>)}
  </section>
}

function DiagramRow({ diagram }: { diagram: DiagramSummary }) {
  const editable = diagram.status === 'ready' && diagram.currentRevisionNo > 0
  return <article className="diagram-row"><div className={`diagram-type ${diagram.diagramType}`}>{diagram.diagramType === 'flowchart' ? '流程' : '泳道'}</div><div className="diagram-main"><Link className="diagram-title" to={`/projects/${diagram.projectId}/diagrams/${diagram.id}`}>{diagram.title}</Link><div className="diagram-meta"><span>{diagram.orientation === 'horizontal' ? '横向' : '纵向'}</span><span>revision {diagram.currentRevisionNo || '—'}</span>{diagram.meetingId && <span>来源会议：{diagram.meetingId}</span>}</div></div><div className="diagram-actions"><span className={`diagram-status ${diagram.status}`}>{diagramStatusLabel(diagram.status)}</span>{editable ? <Link className="button sm" to={`/projects/${diagram.projectId}/diagrams/${diagram.id}`}>查看详情</Link> : <button className="button sm" disabled title="当前图形不可编辑">查看详情</button>}</div></article>
}

function buildQuery(type: string, status: string) { const params = new URLSearchParams({ limit: '50' }); if (type) params.set('type', type); if (status) params.set('status', status); return `?${params.toString()}` }
function diagramStatusLabel(status: DiagramStatus) { return status === 'ready' ? '可编辑' : status === 'render_failed' ? '生成失败' : '生成中' }

