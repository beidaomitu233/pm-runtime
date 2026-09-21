import { useEffect } from 'react'
import { useUiStore } from '../state/uiStore'

export function GlobalFeedback() {
  const toast = useUiStore((state) => state.toast)
  const clearToast = useUiStore((state) => state.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(clearToast, 3_500)
    return () => window.clearTimeout(timer)
  }, [clearToast, toast])

  if (!toast) return null
  return <div className="toast" role="status" aria-live="polite">{toast.message}</div>
}
