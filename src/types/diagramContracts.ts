export type DiagramType = 'flowchart' | 'swimlane'
export type DiagramStatus = 'validating' | 'rendering' | 'ready' | 'validation_failed' | 'render_failed'
export type DiagramOrientation = 'horizontal' | 'vertical'

export interface DiagramWarning {
  code: string
  message: string
  path?: string
}

export interface DiagramSummary {
  id: string
  projectId: string
  meetingId?: string | null
  title: string
  diagramType: DiagramType
  orientation: DiagramOrientation
  status: DiagramStatus
  currentRevisionNo: number
  warnings?: DiagramWarning[]
  createdAt: string
  updatedAt: string
}

export interface DiagramListResponse {
  items: DiagramSummary[]
  nextCursor?: string | null
}

export interface DiagramRevisionSummary {
  revisionNo: number
  source: 'agent_render' | 'editor_save' | 'history_fork'
  changeNote?: string | null
  contentSha256: string
  createdAt: string
}

export interface DiagramDetail extends DiagramSummary {
  currentRevision?: DiagramRevisionSummary | null
  revisions?: DiagramRevisionSummary[]
}

export function isDiagramWarning(value: unknown): value is DiagramWarning {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

export function isDiagramSummary(value: unknown): value is DiagramSummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' && typeof candidate.projectId === 'string' && typeof candidate.title === 'string' && ['flowchart', 'swimlane'].includes(String(candidate.diagramType)) && ['horizontal', 'vertical'].includes(String(candidate.orientation)) && ['validating', 'rendering', 'ready', 'validation_failed', 'render_failed'].includes(String(candidate.status)) && typeof candidate.currentRevisionNo === 'number' && typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string' && (!candidate.warnings || Array.isArray(candidate.warnings) && candidate.warnings.every(isDiagramWarning))
}

export function isDiagramListResponse(value: unknown): value is DiagramListResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.items) && candidate.items.every(isDiagramSummary)
}

export function isDiagramRevisionSummary(value: unknown): value is DiagramRevisionSummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.revisionNo === 'number' && ['agent_render', 'editor_save', 'history_fork'].includes(String(candidate.source)) && typeof candidate.contentSha256 === 'string' && typeof candidate.createdAt === 'string'
}

export function isDiagramDetail(value: unknown): value is DiagramDetail {
  return isDiagramSummary(value)
}

