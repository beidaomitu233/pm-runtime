import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeGate } from './RuntimeGate'
import { apiClient } from '../api/client'

describe('RuntimeGate', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('does not render business content while health is loading', () => {
    vi.spyOn(apiClient, 'getHealth').mockReturnValue(new Promise(() => undefined))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><RuntimeGate><div>业务页面</div></RuntimeGate></QueryClientProvider>)
    expect(screen.getByText('正在启动本地服务')).toBeInTheDocument()
    expect(screen.queryByText('业务页面')).not.toBeInTheDocument()
  })

  it('shows schema incompatibility without rendering business content', async () => {
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({ appVersion: '0.1.0', sidecarVersion: '0.1.0', schemaVersion: '9.9', status: 'ready' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><RuntimeGate><div>业务页面</div></RuntimeGate></QueryClientProvider>)
    expect(await screen.findByText('Runtime 版本需要更新')).toBeInTheDocument()
    expect(screen.queryByText('业务页面')).not.toBeInTheDocument()
  })
})
