import { create } from 'zustand'

interface UiState {
  recentProjectId?: string
  toast?: { id: number; message: string }
  setRecentProjectId: (projectId: string) => void
  showToast: (message: string) => void
  clearToast: () => void
}

export const useUiStore = create<UiState>((set) => ({
  recentProjectId: undefined,
  toast: undefined,
  setRecentProjectId: (recentProjectId) => set({ recentProjectId }),
  showToast: (message) => set({ toast: { id: Date.now(), message } }),
  clearToast: () => set({ toast: undefined }),
}))
