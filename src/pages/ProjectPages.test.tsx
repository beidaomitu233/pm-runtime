import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { ProjectRouteGate } from './ProjectPages'

describe('ProjectRouteGate', () => {
  it('rejects malformed project IDs before calling the API', () => {
    const getProject = vi.spyOn(apiClient, 'getProject')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projects/not-an-ulid/meetings']}><Routes><Route path="/projects/:projectId" element={<ProjectRouteGate />}><Route path="meetings" element={<div>会议</div>} /></Route></Routes></MemoryRouter></QueryClientProvider>)
    expect(screen.getByText('项目 ID 格式无效。')).toBeInTheDocument()
    expect(getProject).not.toHaveBeenCalled()
  })

  it('shows the 404 path when the project request fails', async () => {
    vi.spyOn(apiClient, 'getProject').mockRejectedValue(new Error('项目不存在或已归档。'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projects/01J00000000000000000000000/meetings']}><Routes><Route path="/projects/:projectId" element={<ProjectRouteGate />}><Route path="meetings" element={<div>会议</div>} /></Route></Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('找不到这个项目')).toBeInTheDocument()
    expect(screen.queryByText('会议')).not.toBeInTheDocument()
  })
})
