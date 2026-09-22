import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import type { MeetingSourceType, MeetingStatus, MeetingSummary } from '@pm/contracts'
import { apiClient, RuntimeApiError } from '../api/client'
import { PageError } from '../app/AppShell'
import './meetings.css'

export function MeetingsPageEnhanced() {
  const { projectId } = useParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MeetingStatus | ''>('')
  const [sourceType, setSourceType] = useState<MeetingSourceType | ''>('')
  const [showPaste, setShowPaste] = useState(false)
  const meetings = useQuery({ queryKey: ['meetings', projectId, query, status, sourceType], queryFn: () => apiClient.listMeetings(projectId!, buildQuery(query, status, sourceType)), enabled: Boolean(projectId) })
  const queryClient = useQueryClient()
  const createMeeting = useMutation({ mutationFn: ({ title, text }: { title: string; text: string }) => apiClient.createMeeting(projectId!, title, text), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['meetings', projectId] }); setShowPaste(false) } })

  return <section className="meeting-page">
    <div className="page-heading"><div><p className="eyebrow">项目主线</p><h1>会议</h1><p>导入会议内容后，宿主 Agent 可按 meeting ID 读取正文并生成流程图。</p></div><button className="button primary" onClick={() => setShowPaste(true)}>粘贴会议</button></div>
    <div className="meeting-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">搜索会议</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会议标题" /></label><select aria-label="状态筛选" value={status} onChange={(event) => setStatus(event.target.value as MeetingStatus | '')}><option value="">全部状态</option><option value="ready">可读取</option><option value="importing">导入中</option><option value="failed">导入失败</option></select><select aria-label="来源筛选" value={sourceType} onChange={(event) => setSourceType(event.target.value as MeetingSourceType | '')}><option value="">全部来源</option><option value="paste">粘贴</option><option value="txt">TXT</option><option value="md">MD</option><option value="docx">DOCX</option></select></div>
    {meetings.isPending && <div className="skeleton-list" aria-label="会议加载中"><div /><div /><div /></div>}
    {meetings.isError && <PageError error={meetings.error} onRetry={() => void meetings.refetch()} />}
    {meetings.data && (meetings.data.items.length ? <div className="meeting-list">{meetings.data.items.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} />)}</div> : <div className="empty-state"><div className="empty-icon">＋</div><h2>还没有会议资料</h2><p>先粘贴一份会议记录，生成可追溯的 meeting ID。</p><button className="button primary" onClick={() => setShowPaste(true)}>粘贴会议</button></div>)}
    {showPaste && <PasteMeetingDialog pending={createMeeting.isPending} error={createMeeting.error} onClose={() => { setShowPaste(false); createMeeting.reset() }} onSubmit={(title, text) => createMeeting.mutate({ title, text })} />}
  </section>
}

function MeetingRow({ meeting }: { meeting: MeetingSummary }) {
  return <article className="meeting-row"><div className={`meeting-source ${meeting.sourceType}`}>{meeting.sourceType.toUpperCase()}</div><div className="meeting-main"><Link to={`/projects/${meeting.projectId}/meetings/${meeting.id}`} className="meeting-title">{meeting.title}</Link><div className="meeting-meta"><span>{meeting.charCount.toLocaleString('zh-CN')} 字符</span><span>{formatDate(meeting.createdAt)}</span>{meeting.originalFilename && <span title={meeting.originalFilename}>{meeting.originalFilename}</span>}</div>{meeting.status === 'failed' && <p className="meeting-error">{meeting.errorCode || '导入失败'}</p>}</div><span className={`meeting-status ${meeting.status}`}>{statusLabel(meeting.status)}</span></article>
}

function PasteMeetingDialog({ pending, error, onClose, onSubmit }: { pending: boolean; error: unknown; onClose: () => void; onSubmit: (title: string, text: string) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const titleError = title.trim().length === 0 ? '请输入会议标题。' : title.trim().length > 120 ? '标题不能超过 120 个字符。' : ''
  const textError = text.length === 0 ? '请粘贴会议正文。' : text.length > 2_000_000 ? '正文超过当前上限。' : ''
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose() }}><section className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="paste-meeting-title"><div className="modal-header"><h2 id="paste-meeting-title">粘贴会议</h2><button className="icon-button" aria-label="关闭" onClick={onClose} disabled={pending}>×</button></div><form onSubmit={(event) => { event.preventDefault(); if (!titleError && !textError && !pending) onSubmit(title.trim(), text) }}><div className="modal-body"><label className="form-field"><span>会议标题 <i>*</i></span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(titleError)} />{titleError && <small className="field-error-text">{titleError}</small>}</label><label className="form-field"><span>会议正文 <i>*</i></span><textarea className="meeting-textarea" value={text} onChange={(event) => setText(event.target.value)} aria-invalid={Boolean(textError)} placeholder="粘贴会议记录、决策和待办…" />{textError && <small className="field-error-text">{textError}</small>}<small className="char-counter">{text.length.toLocaleString('zh-CN')} / 2,000,000 字符</small></label>{Boolean(error) && <p className="field-error" role="alert">{error instanceof RuntimeApiError ? error.message : '会议导入失败，请重试。'}{error instanceof RuntimeApiError && error.requestId ? <small>requestId：{error.requestId}</small> : null}</p>}</div><div className="modal-footer"><button type="button" className="button" onClick={onClose} disabled={pending}>取消</button><button type="submit" className="button primary" disabled={Boolean(titleError || textError) || pending}>{pending ? '导入中…' : '保存会议'}</button></div></form></section></div>
}

function buildQuery(query: string, status: string, sourceType: string) { const params = new URLSearchParams({ limit: '50' }); if (query.trim()) params.set('q', query.trim()); if (status) params.set('status', status); if (sourceType) params.set('sourceType', sourceType); return `?${params.toString()}` }
function statusLabel(status: MeetingStatus) { return status === 'ready' ? '可读取' : status === 'importing' ? '导入中' : '导入失败' }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date) }

