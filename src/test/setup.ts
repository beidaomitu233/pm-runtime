import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest 未开启 globals，RTL 不会自动注册 cleanup。
// 不显式清理会让上一个用例的 DOM 残留到下一个用例，产生跨用例的 "Found multiple elements"。
afterEach(() => {
  cleanup()
})
