import {
  type ApiEnvelope,
  type ApiErrorBody,
  type HealthResponse,
  type ProjectListResponse,
  type ProjectSummary,
  isHealthResponse,
  isProjectListResponse,
  isProjectSummary,
} from '../types/contracts'
import {
  type MeetingContentChunk,
  type MeetingDetail,
  type MeetingListResponse,
  type MeetingSummary,
  isMeetingContentChunk,
  isMeetingDetail,
  isMeetingListResponse,
  isMeetingSummary,
} from '../types/meetingContracts'
import {
  type DiagramDetail,
  type DiagramListResponse,
  isDiagramDetail,
  isDiagramListResponse,
} from '../types/diagramContracts'

export class RuntimeApiError extends Error {
  readonly code: string
  readonly requestId?: string
  readonly status?: number
  readonly details?: unknown
  readonly retryable: boolean

  constructor(body: ApiErrorBody, options: { requestId?: string; status?: number } = {}) {
    super(body.message)
    this.name = 'RuntimeApiError'
    this.code = body.code
    this.requestId = options.requestId
    this.status = options.status
    this.details = body.details
    this.retryable = body.retryable ?? false
  }
}

export class RuntimeResponseError extends Error {
  readonly requestId?: string

  constructor(message: string, requestId?: string) {
    super(message)
    this.name = 'RuntimeResponseError'
    this.requestId = requestId
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  idempotencyKey?: string
  timeoutMs?: number
}

type Parser<T> = (value: unknown) => value is T

function getConfig() {
  return window.__PM_RUNTIME_CONFIG__ ?? { baseUrl: '/api/v1' }
}

function requestId() {
  return crypto.randomUUID()
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function parseFailure(value: unknown): { error: ApiErrorBody; requestId?: string } | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (!candidate.error || typeof candidate.error !== 'object') return null
  const error = candidate.error as Record<string, unknown>
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return null
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: typeof error.retryable === 'boolean' ? error.retryable : undefined,
    },
    requestId: typeof candidate.requestId === 'string' ? candidate.requestId : undefined,
  }
}

async function request<T>(path: string, options: RequestOptions, parser: Parser<T>): Promise<T> {
  const config = getConfig()
  const outgoingRequestId = requestId()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)

  try {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Request-Id', outgoingRequestId)
    if (config.sessionToken) headers.set('X-PM-Session', config.sessionToken)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)

    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      signal: controller.signal,
    })
    const responseRequestId = response.headers.get('X-Request-Id') ?? outgoingRequestId
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new RuntimeResponseError('Runtime 返回了无法解析的响应。', responseRequestId)
    }

    if (!response.ok) {
      const failure = parseFailure(payload)
      if (failure) throw new RuntimeApiError(failure.error, { requestId: failure.requestId ?? responseRequestId, status: response.status })
      throw new RuntimeApiError(
        { code: `HTTP_${response.status}`, message: 'Runtime 请求失败。', retryable: response.status >= 500 },
        { requestId: responseRequestId, status: response.status },
      )
    }

    if (!payload || typeof payload !== 'object' || !('data' in payload) || typeof (payload as ApiEnvelope<T>).requestId !== 'string') {
      throw new RuntimeResponseError('Runtime 返回结构不符合当前版本合同。', responseRequestId)
    }
    const data = (payload as ApiEnvelope<unknown>).data
    if (!parser(data)) throw new RuntimeResponseError('Runtime 返回的数据未通过前端合同校验。', responseRequestId)
    return data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RuntimeApiError({ code: 'REQUEST_TIMEOUT', message: 'Runtime 响应超时，请重试。', retryable: true }, { requestId: outgoingRequestId })
    }
    if (error instanceof TypeError) {
      throw new RuntimeApiError({ code: 'RUNTIME_UNAVAILABLE', message: '无法连接本地 Runtime。', retryable: true }, { requestId: outgoingRequestId })
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export const apiClient = {
  getHealth: () => request<HealthResponse>('/health', { method: 'GET', timeoutMs: 3_000 }, isHealthResponse),
  listProjects: (query = '') => request<ProjectListResponse>(`/projects${query}`, { method: 'GET' }, isProjectListResponse),
  getProject: (projectId: string) => request<ProjectSummary>(`/projects/${encodeURIComponent(projectId)}`, { method: 'GET' }, isProjectSummary),
  createProject: (name: string, description?: string) => request<ProjectSummary>('/projects', { method: 'POST', body: { name, ...(description ? { description } : {}) }, idempotencyKey: crypto.randomUUID() }, isProjectSummary),
  renameProject: (projectId: string, name: string) => request<ProjectSummary>(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: { name }, idempotencyKey: crypto.randomUUID() }, isProjectSummary),
  listMeetings: (projectId: string, query = '') => request<MeetingListResponse>(`/projects/${encodeURIComponent(projectId)}/meetings${query}`, { method: 'GET' }, isMeetingListResponse),
  createMeeting: (projectId: string, title: string, text: string) => request<MeetingSummary>(`/projects/${encodeURIComponent(projectId)}/meetings`, { method: 'POST', body: { title, text }, idempotencyKey: crypto.randomUUID() }, isMeetingSummary),
  getMeeting: (meetingId: string) => request<MeetingDetail>(`/meetings/${encodeURIComponent(meetingId)}`, { method: 'GET' }, isMeetingDetail),
  getMeetingContent: (meetingId: string, offset: number, limit = 8000) => request<MeetingContentChunk>(`/meetings/${encodeURIComponent(meetingId)}/content?offset=${offset}&limit=${limit}`, { method: 'GET' }, isMeetingContentChunk),
  listDiagrams: (projectId: string, query = '') => request<DiagramListResponse>(`/projects/${encodeURIComponent(projectId)}/diagrams${query}`, { method: 'GET' }, isDiagramListResponse),
  getDiagram: (diagramId: string) => request<DiagramDetail>(`/diagrams/${encodeURIComponent(diagramId)}`, { method: 'GET' }, isDiagramDetail),
}

export function isRetryableRuntimeError(error: unknown) {
  return error instanceof RuntimeApiError && error.retryable
}
