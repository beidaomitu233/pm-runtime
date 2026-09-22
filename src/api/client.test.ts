import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient, initRuntimeConfig, isTauriContext, RuntimeApiError, RuntimeResponseError } from './client'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('initRuntimeConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    delete window.__PM_RUNTIME_CONFIG__
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('is a no-op outside the Tauri shell and keeps the browser dev injection', async () => {
    window.__PM_RUNTIME_CONFIG__ = { baseUrl: 'http://127.0.0.1:4310/api/v1', sessionToken: 'dev-injected' }
    expect(isTauriContext()).toBe(false)
    await initRuntimeConfig()
    expect(window.__PM_RUNTIME_CONFIG__).toEqual({ baseUrl: 'http://127.0.0.1:4310/api/v1', sessionToken: 'dev-injected' })
    const { invoke } = await import('@tauri-apps/api/core')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('takes the Tauri runtime_start result as the production injection source', async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue({ baseUrl: 'http://127.0.0.1:45123/api/v1', sessionToken: 'tauri-token' })
    expect(isTauriContext()).toBe(true)
    await initRuntimeConfig()
    expect(invoke).toHaveBeenCalledWith('runtime_start')
    expect(window.__PM_RUNTIME_CONFIG__).toEqual({ baseUrl: 'http://127.0.0.1:45123/api/v1', sessionToken: 'tauri-token' })
  })

  it('swallows runtime_start failures so RuntimeGate can render the unavailable state', async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockRejectedValue(new Error('sidecar missing'))
    await expect(initRuntimeConfig()).resolves.toBeUndefined()
    expect(window.__PM_RUNTIME_CONFIG__).toBeUndefined()
  })

  it('ignores an empty baseUrl from a malformed invoke result', async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue({ baseUrl: '' })
    await initRuntimeConfig()
    expect(window.__PM_RUNTIME_CONFIG__).toBeUndefined()
  })
})

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.__PM_RUNTIME_CONFIG__ = { baseUrl: 'http://127.0.0.1:4310/api/v1', sessionToken: 'test-session' }
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('adds request and session headers and validates health data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { appVersion: '0.1.0', sidecarVersion: '0.1.0', schemaVersion: '0.1', status: 'ready' }, requestId: 'server-id' }), { status: 200 }))
    await expect(apiClient.getHealth()).resolves.toMatchObject({ schemaVersion: '0.1', status: 'ready' })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'), expect.objectContaining({ headers: expect.any(Headers) }))
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers
    expect(headers.get('X-PM-Session')).toBe('test-session')
    expect(headers.get('X-Request-Id')).toBeTruthy()
  })

  it('maps structured API errors without exposing response internals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'RUNTIME_UNAVAILABLE', message: '本地服务不可用。', retryable: true }, requestId: 'req-1' }), { status: 503 }))
    await expect(apiClient.getHealth()).rejects.toMatchObject({ code: 'RUNTIME_UNAVAILABLE', requestId: 'req-1', retryable: true })
  })

  it('rejects malformed success envelopes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { status: 'ready' }, requestId: 'req-2' }), { status: 200 }))
    await expect(apiClient.getHealth()).rejects.toBeInstanceOf(RuntimeResponseError)
  })

  it('accepts a well-formed project list payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        items: [{ id: '01J00000000000000000000000', name: '客户平台', description: null, createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' }],
        nextCursor: null,
      },
      requestId: '01J8Z7QK2N4G6H8J9K0M1N2P3Q',
    }), { status: 200 }))
    await expect(apiClient.listProjects()).resolves.toMatchObject({
      items: [{ name: '客户平台', description: null }],
      nextCursor: null,
    })
  })

  it('rejects malformed project payloads through the shared contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        items: [{ id: '01J00000000000000000000000', name: '客户平台', createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' }],
        nextCursor: null,
      },
      requestId: 'req-projects',
    }), { status: 200 }))
    await expect(apiClient.listProjects()).rejects.toBeInstanceOf(RuntimeResponseError)
  })
})
