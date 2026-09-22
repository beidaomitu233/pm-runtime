import { useQuery } from '@tanstack/react-query'
import { API_SCHEMA_VERSION } from '@pm/contracts'
import { apiClient, isRetryableRuntimeError, RuntimeApiError, RuntimeResponseError } from '../api/client'

interface Props { children: React.ReactNode }

export function RuntimeGate({ children }: Props) {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.getHealth,
    retry: (failureCount, error) => isRetryableRuntimeError(error) && failureCount < 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
    staleTime: 10_000,
  })

  if (health.isPending) {
    return <main className="center-page"><section className="status-card" aria-live="polite"><div className="spinner" /><p className="eyebrow">PM Runtime</p><h1>正在启动本地服务</h1><p>正在检查 Runtime、数据库和数据目录状态。</p></section></main>
  }

  if (health.isError) {
    const requestId = health.error instanceof RuntimeApiError || health.error instanceof RuntimeResponseError ? health.error.requestId : undefined
    return <RuntimeUnavailable requestId={requestId} onRetry={() => void health.refetch()} />
  }

  if (health.data.schemaVersion !== API_SCHEMA_VERSION || health.data.status === 'incompatible') {
    return <RuntimeIncompatible actualVersion={health.data.schemaVersion} requestId={undefined} />
  }

  if (health.data.status === 'unavailable') {
    return <RuntimeUnavailable onRetry={() => void health.refetch()} />
  }

  return <>{children}</>
}

function RuntimeUnavailable({ requestId, onRetry }: { requestId?: string; onRetry: () => void }) {
  return <main className="center-page"><section className="status-card" role="alert"><p className="eyebrow">Runtime 不可用</p><h1>本地服务尚未就绪</h1><p>业务数据不会在服务未就绪时显示为空。请启动或重试本地 Runtime。</p>{requestId && <p className="request-id">requestId：{requestId}</p>}<div className="button-row"><button className="button primary" onClick={onRetry}>重新检查</button><a className="button" href="/diagnostics">打开诊断</a></div></section></main>
}

function RuntimeIncompatible({ actualVersion, requestId }: { actualVersion: string; requestId?: string }) {
  return <main className="center-page"><section className="status-card" role="alert"><p className="eyebrow">版本不兼容</p><h1>Runtime 版本需要更新</h1><p>当前 Runtime schema 为 {actualVersion}，前端需要 {API_SCHEMA_VERSION}。业务页面已暂停，避免误读数据。</p>{requestId && <p className="request-id">requestId：{requestId}</p>}</section></main>
}
