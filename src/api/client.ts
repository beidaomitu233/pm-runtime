import {
  type HealthResponse,
  type MeetingContent,
  type MeetingSummary,
  type Page,
  type Project,
  type SuccessEnvelope,
  type DiagramDetail,
  type DiagramSummary,
  parseDiagramDetail,
  parseDiagramList,
  parseErrorEnvelope,
  parseHealthResponse,
  parseMeetingContent,
  parseMeetingList,
  parseMeetingSummary,
  parseProject,
  parseProjectList,
} from '@pm/contracts'

export interface RuntimeConfig {
  baseUrl: string
  sessionToken?: string
}

declare global {
  interface Window {
    __PM_RUNTIME_CONFIG__?: RuntimeConfig
  }
}

/**
 * 当前是否运行在 Tauri 桌面壳内（Tauri 2 注入 `__TAURI_INTERNALS__`）。
 *
 * 注入来源边界（COM-036 收口）：
 * - 生产（Tauri 打包构建）：只有本函数这一条来源——`runtime_start` 命令返回 baseUrl/sessionToken。
 * - 开发期浏览器（`vite dev`，无壳）：仅由 vite `transformIndexHtml` 插件读
 *   `.pm-runtime/runtime-state.json` 注入（插件 `apply: 'serve'`，不进生产构建）。
 * - 开发期 `tauri dev`：两者都存在，Tauri 上下文内以后者为准并覆盖开发期注入，避免双来源漂移。
 */
export function isTauriContext(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 桌面壳就绪后的唯一生产注入入口。必须在渲染前 await 完成。
 * 非 Tauri 上下文（纯浏览器开发）直接返回，沿用开发期注入；
 * invoke 失败不抛出——`getConfig()` 保持回落，RuntimeGate 正常显示不可用状态。
 */
export async function initRuntimeConfig(timeoutMs = 10_000): Promise<void> {
  if (!isTauriContext()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const config = await Promise.race([
      invoke<{ baseUrl: string; sessionToken?: string }>('runtime_start'),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('runtime_start timeout')), timeoutMs)),
    ])
    if (config && typeof config.baseUrl === 'string' && config.baseUrl.length > 0) {
      window.__PM_RUNTIME_CONFIG__ = config
    }
  } catch (error) {
    console.warn('[pm-runtime] Tauri runtime_start 失败，RuntimeGate 将显示不可用状态。', error)
  }
}

type RuntimeErrorBody = {
  code: string
  message: string
  details?: unknown
  retryable?: boolean
}

export class RuntimeApiError extends Error {
  readonly code: string
  readonly requestId?: string
  readonly status?: number
  readonly details?: unknown
  readonly retryable: boolean

  constructor(body: RuntimeErrorBody, options: { requestId?: string; status?: number } = {}) {
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

type Parser<T> = (value: unknown) => T

function getConfig() {
  return window.__PM_RUNTIME_CONFIG__ ?? { baseUrl: '/api/v1' }
}

function requestId() {
  return crypto.randomUUID()
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function parseFailureStrict(value: unknown): { error: RuntimeErrorBody; requestId?: string } | null {
  try {
    const envelope = parseErrorEnvelope(value)
    return {
      error: {
        code: envelope.error.code,
        message: envelope.error.message,
        details: envelope.error.details,
        retryable: envelope.error.retryable,
      },
      requestId: envelope.requestId,
    }
  } catch {
    return null
  }
}

function parseFailure(value: unknown): { error: RuntimeErrorBody; requestId?: string } | null {
  const strict = parseFailureStrict(value)
  if (strict) return strict
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

    if (!payload || typeof payload !== 'object' || !('data' in payload) || typeof (payload as SuccessEnvelope<unknown>).requestId !== 'string') {
      throw new RuntimeResponseError('Runtime 返回结构不符合当前版本合同。', responseRequestId)
    }
    let data: T
    try {
      data = parser((payload as SuccessEnvelope<unknown>).data)
    } catch {
      throw new RuntimeResponseError('Runtime 返回的数据未通过前端合同校验。', responseRequestId)
    }
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
  getHealth: () => request<HealthResponse>('/health', { method: 'GET', timeoutMs: 3_000 }, parseHealthResponse),
  listProjects: (query = '') => request<Page<Project>>(`/projects${query}`, { method: 'GET' }, parseProjectList),
  getProject: (projectId: string) => request<Project>(`/projects/${encodeURIComponent(projectId)}`, { method: 'GET' }, parseProject),
  createProject: (name: string, description?: string) => request<Project>('/projects', { method: 'POST', body: { name, ...(description ? { description } : {}) }, idempotencyKey: crypto.randomUUID() }, parseProject),
  renameProject: (projectId: string, name: string) => request<Project>(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: { name }, idempotencyKey: crypto.randomUUID() }, parseProject),
  listMeetings: (projectId: string, query = '') => request<Page<MeetingSummary>>(`/projects/${encodeURIComponent(projectId)}/meetings${query}`, { method: 'GET' }, parseMeetingList),
  createMeeting: (projectId: string, title: string, text: string) => request<MeetingSummary>(`/projects/${encodeURIComponent(projectId)}/meetings`, { method: 'POST', body: { title, text }, idempotencyKey: crypto.randomUUID() }, parseMeetingSummary),
  getMeeting: (meetingId: string) => request<MeetingSummary>(`/meetings/${encodeURIComponent(meetingId)}`, { method: 'GET' }, parseMeetingSummary),
  getMeetingContent: (meetingId: string, offset: number, limit = 8000) => request<MeetingContent>(`/meetings/${encodeURIComponent(meetingId)}/content?offset=${offset}&limit=${limit}`, { method: 'GET' }, parseMeetingContent),
  listDiagrams: (projectId: string, query = '') => request<Page<DiagramSummary>>(`/projects/${encodeURIComponent(projectId)}/diagrams${query}`, { method: 'GET' }, parseDiagramList),
  getDiagram: (diagramId: string) => request<DiagramDetail>(`/diagrams/${encodeURIComponent(diagramId)}`, { method: 'GET' }, parseDiagramDetail),
}

export function isRetryableRuntimeError(error: unknown) {
  return error instanceof RuntimeApiError && error.retryable
}
