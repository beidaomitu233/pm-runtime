export type RuntimeStatus = 'ready' | 'degraded' | 'unavailable' | 'incompatible'

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
  retryable?: boolean
}

export interface ApiEnvelope<T> {
  data: T
  requestId: string
}

export interface ApiFailure {
  error: ApiErrorBody
  requestId: string
}

export interface HealthResponse {
  appVersion: string
  sidecarVersion: string
  schemaVersion: string
  status: RuntimeStatus
  dataDirMasked?: string
}

export interface ProjectSummary {
  id: string
  name: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectListResponse {
  items: ProjectSummary[]
  nextCursor?: string | null
}

export interface RuntimeConfig {
  baseUrl: string
  sessionToken?: string
}

declare global {
  interface Window {
    __PM_RUNTIME_CONFIG__?: RuntimeConfig
  }
}

export const EXPECTED_SCHEMA_VERSION = '0.1'

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.appVersion === 'string' &&
    typeof candidate.sidecarVersion === 'string' &&
    typeof candidate.schemaVersion === 'string' &&
    ['ready', 'degraded', 'unavailable', 'incompatible'].includes(String(candidate.status))
  )
}

export function isProjectSummary(value: unknown): value is ProjectSummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  )
}

export function isProjectListResponse(value: unknown): value is ProjectListResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.items) && candidate.items.every(isProjectSummary)
}
