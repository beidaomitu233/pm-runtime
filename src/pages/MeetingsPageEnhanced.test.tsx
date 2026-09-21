import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { MeetingsPageEnhanced } from './MeetingsPageEnhanced'

const meeting = { id: '01J00000000000000000000000', projectId: '01J00000000000000000000001', title: '产品评审', sourceType: 'paste' as const, charCount: 120, importStatus: 'ready' as const, createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/projects/01J00000000000000000000001/meetings']}><Routes><Route path="/projects/:projectId/meetings" element={<MeetingsPageEnhanced />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('MeetingsPageEnhanced', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(apiClient, 'listMeetings').mockResolvedValue({ items: [meeting], nextCursor: null })
  })

  it('renders meeting status and filters', async () => {
    renderPage()
    expect(await screen.findByText('产品评审')).toBeInTheDocument()
    expect(screen.getByText('可读取', { selector: '.meeting-status' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('状态筛选'), { target: { value: 'failed' } })
    // 筛选后页面框架必须保留：筛选控件若被骨架屏替换，「状态筛选」会取不到。
    expect(screen.getByLabelText('状态筛选')).toHaveValue('failed')
    await waitFor(() => expect(apiClient.listMeetings).toHaveBeenCalledWith('01J00000000000000000000001', expect.stringContaining('status=failed')))
  })

  it('validates pasted meeting content before submitting', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '粘贴会议' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存会议' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/会议标题/), { target: { value: '评审会' } })
    expect(screen.getByRole('button', { name: '保存会议' })).toBeDisabled()
    expect(screen.getByText('请粘贴会议正文。')).toBeInTheDocument()
  })

  it('submits a valid pasted meeting', async () => {
    vi.spyOn(apiClient, 'createMeeting').mockResolvedValue(meeting)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '粘贴会议' }))
    fireEvent.change(screen.getByLabelText(/会议标题/), { target: { value: '评审会' } })
    fireEvent.change(screen.getByLabelText(/会议正文/), { target: { value: '讨论流程和下一步。' } })
    fireEvent.click(screen.getByRole('button', { name: '保存会议' }))
    await waitFor(() => expect(apiClient.createMeeting).toHaveBeenCalledWith('01J00000000000000000000001', '评审会', '讨论流程和下一步。'))
  })
})

