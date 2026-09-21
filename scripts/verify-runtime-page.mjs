/**
 * 开发期联调冒烟检查：用真实浏览器确认页面能到达 Runtime。
 *
 * 为什么需要它：B-6（浏览器端无法到达 Runtime）不是单个页面的缺陷，而是整条链路的问题。
 * httpBaseline 的单测走 `inject`，绕过了浏览器真正会走的 CORS preflight；只有真实浏览器
 * 才能暴露“preflight 被静默拦截”这类问题。see COM-029、COM-036。
 *
 * 用法（需要两个进程同时在跑）：
 *   终端 1：pnpm runtime:dev
 *   终端 2：pnpm dev
 *   终端 3：node scripts/verify-runtime-page.mjs
 *
 * 环境变量：
 *   PM_PAGE_URL  页面地址，默认 http://127.0.0.1:1420/
 *   PM_CHROMIUM  指定 chromium 可执行文件；不设置时优先用本机已装的 ms-playwright 浏览器
 *
 * 退出码：0 表示页面已连上 Runtime；1 表示未连上（脚本会打印实际观测到的请求与页面文本）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const url = process.env.PM_PAGE_URL ?? 'http://127.0.0.1:1420/'
const EXPECTED_PORT = process.env.PM_RUNTIME_PORT ?? ''

/**
 * playwright 期望的浏览器版本可能尚未下载；若本机已有可用的 chromium，直接复用它，
 * 避免为一次冒烟检查下载新的浏览器。
 */
function resolveExecutablePath() {
  if (process.env.PM_CHROMIUM) return process.env.PM_CHROMIUM
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  return ['chromium-1223', 'chromium-1208']
    .map((dir) => join(base, dir, 'chrome-win64', 'chrome.exe'))
    .find((candidate) => existsSync(candidate))
}

const executablePath = resolveExecutablePath()
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
})
const context = await browser.newContext({ viewport: { width: 1024, height: 720 } })
const page = await context.newPage()

const apiCalls = []
const consoleErrors = []
page.on('response', (response) => {
  if (response.url().includes('/api/v1/')) apiCalls.push(`${response.status()} ${response.url()}`)
})
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200))
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 200)}`))

await page.goto(url, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(2500)

const bodyText = await page.innerText('body').catch(() => '')
const runtimeConfig = await page.evaluate(() => window.__PM_RUNTIME_CONFIG__ ?? null)
const navLabels = await page.locator('nav a, aside a').allInnerTexts().catch(() => [])

const healthOk = apiCalls.some((call) => call.startsWith('200 ') && call.includes('/api/v1/health'))
const portMatches = EXPECTED_PORT ? apiCalls.every((call) => call.includes(`:${EXPECTED_PORT}`)) : true
const showsUnavailable = bodyText.includes('本地服务尚未就绪')
const passed = healthOk && portMatches && !showsUnavailable

console.log(
  JSON.stringify(
    {
      passed,
      apiCalls,
      consoleErrors,
      runtimeConfig: runtimeConfig ? { ...runtimeConfig, sessionToken: '<redacted>' } : null,
      showsRuntimeUnavailable: showsUnavailable,
      showsVersionMismatch: bodyText.includes('Runtime 版本需要更新'),
      navLabels,
      bodySnippet: bodyText.replace(/\s+/g, ' ').slice(0, 300),
    },
    null,
    2
  )
)

await page.screenshot({ path: 'docs/evidence/runtime-connected.png' })
await browser.close()

console.log(passed ? 'PASS: 页面已连上 Runtime' : 'FAIL: 页面未连上 Runtime')
process.exitCode = passed ? 0 : 1
