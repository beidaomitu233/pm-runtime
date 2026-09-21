import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient, RuntimeApiError, RuntimeResponseError } from './client'

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.__PM_RUNTIME_CONFIG__ = { baseUrl: 'http://127.0.0.1:4310/api/v1', sessionToken: 'test-session' }
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
    await expect(apiClient.getHealth()).rejects.toMatchObject<Partial<RuntimeApiError>>({ code: 'RUNTIME_UNAVAILABLE', requestId: 'req-1', retryable: true })
  })

  it('rejects malformed success envelopes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { status: 'ready' }, requestId: 'req-2' }), { status: 200 }))
    await expect(apiClient.getHealth()).rejects.toBeInstanceOf(RuntimeResponseError)
  })
})
