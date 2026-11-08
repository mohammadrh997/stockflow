import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './server'

// The default 1 s wait for findBy… is tight when every test file runs in parallel (and in CI).
configure({ asyncUtilTimeout: 3000 })

// jsdom lacks ResizeObserver, which Radix components measure with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom lacks the pointer-capture and scrolling APIs Radix Select and cmdk call.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
})

afterAll(() => server.close())
