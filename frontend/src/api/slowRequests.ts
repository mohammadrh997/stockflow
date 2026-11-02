import { useSyncExternalStore } from 'react'

// The free server sleeps when idle and its first request can take up to a minute.
// Requests still pending after this long are reported so the UI can say so.
export const SLOW_REQUEST_MS = 5000

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const slow = new Set<string>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function requestStarted(id: string): void {
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      slow.add(id)
      notify()
    }, SLOW_REQUEST_MS),
  )
}

export function requestFinished(id: string): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  if (slow.delete(id)) notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function hasSlowRequests() {
  return slow.size > 0
}

export function useHasSlowRequests(): boolean {
  return useSyncExternalStore(subscribe, hasSlowRequests)
}
