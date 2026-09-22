import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Runtime state 文件路径，与 runtime-sidecar/src/daemon.ts 中的 dataDir 约定保持一致。 */
const RUNTIME_STATE_PATH = fileURLToPath(new URL('./.pm-runtime/runtime-state.json', import.meta.url))

interface RuntimeStateFile {
  host: string
  port: number
  sessionToken: string
  expiresAt: string
}

async function readRuntimeState(): Promise<RuntimeStateFile | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(RUNTIME_STATE_PATH, 'utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const state = parsed as Partial<RuntimeStateFile>
  if (typeof state.host !== 'string' || typeof state.port !== 'number' || typeof state.sessionToken !== 'string') return null
  if (typeof state.expiresAt !== 'string' || Date.parse(state.expiresAt) <= Date.now()) return null
  return state as RuntimeStateFile
}

/**
 * 开发期 Runtime 配置注入。
 *
 * 生产环境由 Tauri 安全上下文注入 base URL 与令牌（FRONTEND_PLAN §8）。在没有桌面壳之前，
 * 浏览器端没有注入来源，`getConfig()` 只能回落到相对路径 `/api/v1`，请求会打到 Vite dev server
 * 并拿到非 JSON 响应，RuntimeGate 因此恒显示“本地服务尚未就绪”。
 *
 * 只做注入、不做代理：base URL 指向 Runtime 的真实回环端口，令牌读自 state 文件，
 * 端口与令牌都不写死，也不写入 localStorage。Runtime 未启动时不注入，页面照常显示不可用状态，
 * 不会把“服务没起来”伪装成“已连通”。
 *
 * 注入来源边界（COM-036 收口，TASK-002）：本插件只在 `vite dev`（apply: 'serve'）生效，
 * 服务纯浏览器开发链路，永不进入生产构建。生产（Tauri 壳内）唯一来源是
 * `initRuntimeConfig()` 调用的 `runtime_start` 命令；`tauri dev` 下若两者并存，
 * 以 Tauri 注入覆盖本插件结果（见 src/api/client.ts）。
 */
function runtimeConfigInjection(): Plugin {
  return {
    name: 'pm-runtime-config-injection',
    apply: 'serve',
    async transformIndexHtml() {
      const state = await readRuntimeState()
      if (!state) {
        console.warn(
          `[pm-runtime] 未找到可用的 Runtime state（${RUNTIME_STATE_PATH}）。先执行 "pnpm runtime:dev"，否则页面会停在“本地服务尚未就绪”。`
        )
        return []
      }
      const config = {
        baseUrl: `http://${state.host}:${state.port}/api/v1`,
        sessionToken: state.sessionToken,
      }
      return [
        {
          tag: 'script',
          children: `window.__PM_RUNTIME_CONFIG__=${JSON.stringify(config)}`,
          injectTo: 'head-prepend' as const,
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), runtimeConfigInjection()],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
})
