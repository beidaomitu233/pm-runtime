export type MeetingSourceType = 'paste' | 'txt' | 'md' | 'docx'
export type MeetingImportStatus = 'importing' | 'ready' | 'failed'

export interface MeetingSummary {
  id: string
  projectId: string
  title: string
  sourceType: MeetingSourceType
  originalFilename?: string | null
  charCount: number
  importStatus: MeetingImportStatus
  importErrorCode?: string | null
  importErrorMessage?: string | null
  createdAt: string
  updatedAt: string
}

export interface MeetingListResponse {
  items: MeetingSummary[]
  nextCursor?: string | null
}

export interface MeetingDetail extends MeetingSummary {
  byteCount: number
  textSha256?: string | null
}

export interface MeetingContentChunk {
  text: string
  offset: number
  endOffset: number
  totalChars: number
  hasMore: boolean
}

export function isMeetingSummary(value: unknown): value is MeetingSummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' && typeof candidate.projectId === 'string' && typeof candidate.title === 'string' && typeof candidate.charCount === 'number' && ['paste', 'txt', 'md', 'docx'].includes(String(candidate.sourceType)) && ['importing', 'ready', 'failed'].includes(String(candidate.importStatus)) && typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string'
}

export function isMeetingListResponse(value: unknown): value is MeetingListResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.items) && candidate.items.every(isMeetingSummary)
}

export function isMeetingDetail(value: unknown): value is MeetingDetail {
  return isMeetingSummary(value) && typeof (value as MeetingDetail).byteCount === 'number'
}

export function isMeetingContentChunk(value: unknown): value is MeetingContentChunk {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.text === 'string' && typeof candidate.offset === 'number' && typeof candidate.endOffset === 'number' && typeof candidate.totalChars === 'number' && typeof candidate.hasMore === 'boolean'
}

