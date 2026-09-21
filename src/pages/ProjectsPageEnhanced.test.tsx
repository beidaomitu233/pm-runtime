import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { ProjectsPageEnhanced } from './ProjectsPageEnhanced'

const project = { id: '01J00000000000000000000000', name: '客户平台', description: null, createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><ProjectsPageEnhanced /></MemoryRouter></QueryClientProvider>)
}

describe('ProjectsPageEnhanced', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(apiClient, 'listProjects').mockResolvedValue({ items: [project], nextCursor: null })
  })

  it('supports searching and opening a rename dialog', async () => {
    renderPage()
    expect(await screen.findByText('客户平台')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('搜索项目名称'), { target: { value: '客户' } })
    expect(await screen.findByDisplayValue('客户')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重命名 客户平台' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('重命名项目')
  })

  it('validates the create form and prevents an empty submission', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '新建项目' }))
    const submit = screen.getByRole('button', { name: '创建项目' })
    expect(submit).toBeDisabled()
    expect(screen.getByText('请输入项目名称。')).toBeInTheDocument()
  })

  it('submits a valid new project once', async () => {
    vi.spyOn(apiClient, 'createProject').mockResolvedValue({ ...project, id: '01J00000000000000000000001' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '新建项目' }))
    fireEvent.change(screen.getByLabelText(/项目名称/), { target: { value: '新项目' } })
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(apiClient.createProject).toHaveBeenCalledWith('新项目', undefined))
  })
})
