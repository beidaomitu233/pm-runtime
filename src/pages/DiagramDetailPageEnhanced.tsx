import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import type { DiagramStatus } from '@pm/contracts'
import { apiClient, RuntimeApiError } from '../api/client'
import { PageError } from '../app/AppShell'
import './diagrams.css'

export function DiagramDetailPageEnhanced() {
  const { projectId, diagramId } = useParams()
  const diagram = useQuery({ queryKey: ['diagram', diagramId], queryFn: () => apiClient.getDiagram(diagramId!), enabled: Boolean(diagramId) })
  if (diagram.isPending) return <section className="diagram-page"><div className="loading-panel">正在加载图形…</div></section>
  if (diagram.isError) return <section className="diagram-page"><PageError error={diagram.error} onRetry={() => void diagram.refetch()} /></section>
  const current = diagram.data.currentRevision
  const editable = diagram.data.status === 'ready' && diagram.data.currentRevisionNo > 0
  return <section className="diagram-page"><div className="context-bar"><Link to={`/projects/${projectId}/diagrams`}>流程图</Link><span>/</span><strong title={diagram.data.title}>{diagram.data.title}</strong></div><div className="detail-heading"><div><p className="eyebrow">图形详情</p><h1>{diagram.data.title}</h1><p className="diagram-id">diagram ID：<code>{diagram.data.id}</code></p></div><div className="button-row"><Link className="button" to={`/projects/${projectId}/diagrams/${diagram.data.id}/edit`}>打开编辑器</Link><button className="button primary" disabled title="导出功能将在 FE-024 接入">导出</button></div></div><div className="diagram-detail-grid"><section className="detail-card"><h2>图形状态</h2><dl className="metadata-grid"><div><dt>类型</dt><dd>{diagram.data.diagramType === 'flowchart' ? '流程图' : '泳道图'}</dd></div><div><dt>方向</dt><dd>{diagram.data.orientation === 'horizontal' ? '横向' : '纵向'}</dd></div><div><dt>状态</dt><dd><span className={`diagram-status ${diagram.data.status}`}>{diagramStatusLabel(diagram.data.status)}</span></dd></div><div><dt>当前 revision</dt><dd>{diagram.data.currentRevisionNo || '暂无'}</dd></div></dl>{diagram.data.meetingId && <p className="detail-help">来源会议：<Link to={`/projects/${projectId}/meetings/${diagram.data.meetingId}`}>{diagram.data.meetingId}</Link></p>}</section><section className="detail-card"><h2>校验 warning</h2>{diagram.data.warnings?.length ? <ul className="warning-list">{diagram.data.warnings.map((warning) => <li key={`${warning.code}-${warning.path}`}><strong>{warning.code}</strong><span>{warning.message}</span>{warning.path && <code>{warning.path}</code>}</li>)}</ul> : <p className="detail-help">当前 revision 没有 warning。</p>}</section></div><section className="detail-card revision-card"><div className="content-card-heading"><div><h2>版本历史</h2><p>历史 revision 只读，不会改变当前版本。</p></div><span className="revision-current">{editable ? `当前版本 v${diagram.data.currentRevisionNo}` : '暂无可编辑版本'}</span></div>{diagram.data.revisions?.length ? <div className="revision-list">{diagram.data.revisions.map((revision) => <div className="revision-row" key={revision.revisionNo}><div><strong>v{revision.revisionNo}</strong><span>{revision.source === 'agent_render' ? 'Agent 生成' : revision.source === 'editor_save' ? '编辑保存' : '历史另存'}</span></div><div><span>{revision.changeNote || '无变更说明'}</span><code>{revision.contentSha256.slice(0, 12)}…</code></div><time>{formatDate(revision.createdAt)}</time></div>)}</div> : current ? <div className="revision-row"><div><strong>v{current.revisionNo}</strong><span>当前版本</span></div><div><code>{current.contentSha256.slice(0, 12)}…</code></div><time>{formatDate(current.createdAt)}</time></div> : <p className="detail-help">暂无版本记录。</p>}</section></section>
}

export function DiagramEditorPlaceholder() {
  return <section className="diagram-page"><div className="placeholder-card"><p className="eyebrow">编辑器技术闸门</p><h1>本地编辑器尚未接入</h1><p>FE-020 需要先验证离线 diagrams.net 资源、CSP、postMessage 和许可证；当前不会创建空 revision。</p><Link className="button" to={`/projects/${useParams().projectId}/diagrams`}>返回图形列表</Link></div></section>
}

function diagramStatusLabel(status: DiagramStatus) { return status === 'ready' ? '可编辑' : status === 'render_failed' ? '生成失败' : '生成中' }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date) }

