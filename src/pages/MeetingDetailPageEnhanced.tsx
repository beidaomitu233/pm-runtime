import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { apiClient, RuntimeApiError } from '../api/client'
import { PageError } from '../app/AppShell'
import { useUiStore } from '../state/uiStore'
import './meetings.css'

export function MeetingDetailPageEnhanced() {
  const { projectId, meetingId } = useParams()
  const [offset, setOffset] = useState(0)
  const [copyError, setCopyError] = useState('')
  const meeting = useQuery({ queryKey: ['meeting', meetingId], queryFn: () => apiClient.getMeeting(meetingId!), enabled: Boolean(meetingId) })
  const content = useQuery({ queryKey: ['meeting-content', meetingId, offset], queryFn: () => apiClient.getMeetingContent(meetingId!, offset), enabled: Boolean(meetingId && meeting.data?.status === 'ready') })
  const showToast = useUiStore((state) => state.showToast)

  if (meeting.isPending) return <section className="meeting-page"><div className="loading-panel">正在加载会议…</div></section>
  if (meeting.isError) return <section className="meeting-page"><PageError error={meeting.error} onRetry={() => void meeting.refetch()} /></section>
  const metadata = meeting.data
  const agentPrompt = `请使用 PM Runtime 读取项目 ${metadata.projectId} 的会议 ${metadata.id}，按会议内容生成流程图。请先读取元数据，再按 offset 分块读取正文。`
  const copy = async (value: string, message: string) => { try { await navigator.clipboard.writeText(value); setCopyError(''); showToast(message) } catch { setCopyError('剪贴板权限被拒绝，请手动选择下方文本复制。') } }

  return <section className="meeting-page"><div className="context-bar"><Link to={`/projects/${projectId}/meetings`}>会议</Link><span>/</span><strong title={metadata.title}>{metadata.title}</strong></div><div className="detail-heading"><div><p className="eyebrow">会议详情</p><h1>{metadata.title}</h1><p className="meeting-id">meeting ID：<code>{metadata.id}</code></p></div><button className="button" onClick={() => void copy(metadata.id, 'meeting ID 已复制')}>复制 meeting ID</button></div><div className="meeting-detail-grid"><section className="detail-card"><h2>来源与状态</h2><dl className="metadata-grid"><div><dt>来源</dt><dd>{metadata.sourceType.toUpperCase()}</dd></div><div><dt>字符数</dt><dd>{metadata.charCount.toLocaleString('zh-CN')}</dd></div><div><dt>导入状态</dt><dd><span className={`meeting-status ${metadata.status}`}>{metadata.status === 'ready' ? '可读取' : metadata.status === 'failed' ? '导入失败' : '导入中'}</span></dd></div><div><dt>创建时间</dt><dd>{formatDate(metadata.createdAt)}</dd></div></dl>{metadata.status === 'failed' && <p className="field-error">{metadata.errorCode || '导入失败'}</p>}</section><section className="detail-card"><h2>交给宿主 Agent</h2><p className="detail-help">以下内容只复制到剪贴板，不会发送到外部服务。</p><textarea className="agent-prompt" readOnly value={agentPrompt} onFocus={(event) => event.currentTarget.select()} /><button className="button" onClick={() => void copy(agentPrompt, 'Agent 引导文本已复制')}>复制引导文本</button>{copyError && <p className="field-error" role="alert">{copyError}</p>}</section></div>{metadata.status === 'ready' && <section className="detail-card content-card"><div className="content-card-heading"><div><h2>会议正文</h2><p>按字符范围分块读取，当前显示 {content.data ? `${content.data.offset.toLocaleString('zh-CN')}–${content.data.endOffset.toLocaleString('zh-CN')}` : '加载中'} / {metadata.charCount.toLocaleString('zh-CN')}</p></div><div className="button-row"><button className="button sm" disabled={!offset || content.isFetching} onClick={() => setOffset(Math.max(0, offset - 8000))}>上一块</button><button className="button sm" disabled={!content.data?.hasMore || content.isFetching} onClick={() => setOffset(content.data?.endOffset ?? offset)}>下一块</button></div></div>{content.isPending || content.isFetching ? <div className="loading-panel">正在读取正文分块…</div> : content.isError ? <PageError error={content.error} onRetry={() => void content.refetch()} /> : <pre className="meeting-content">{content.data?.text}</pre>}</section>}</section>
}
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date) }

