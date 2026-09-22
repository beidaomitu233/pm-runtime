import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { DiagramsPageEnhanced } from './DiagramsPageEnhanced'

const diagram = { id: '01J00000000000000000000000', projectId: '01J00000000000000000000001', meetingId: null, title: '客户流程', diagramType: 'flowchart' as const, orientation: 'horizontal' as const, status: 'ready' as const, currentRevisionNo: 2, lastErrorCode: null, createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projects/01J00000000000000000000001/diagrams']}><Routes><Route path="/projects/:projectId/diagrams" element={<DiagramsPageEnhanced />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('DiagramsPageEnhanced', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(apiClient, 'listDiagrams').mockResolvedValue({ items: [diagram], nextCursor: null })
  })

  it('shows current revision and type filters', async () => {
    renderPage()
    expect(await screen.findByText('客户流程')).toBeInTheDocument()
    expect(screen.getByText('revision 2')).toBeInTheDocument()
    expect(screen.getByLabelText('图形类型筛选')).toBeInTheDocument()
  })
})

