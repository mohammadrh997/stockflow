import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

export const PAGE_SIZE = 20

// List filters live in the URL, so a refresh, a shared link or a re-login keeps them.
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(0, Number(searchParams.get('page') ?? 0) || 0)

  function get(key: string): string {
    return searchParams.get(key) ?? ''
  }

  function set(key: string, value: string) {
    setSearchParams(
      (params) => {
        if (value) params.set(key, value)
        else params.delete(key)
        params.delete('page')
        return params
      },
      { replace: true },
    )
  }

  function setPage(next: number) {
    setSearchParams((params) => {
      if (next > 0) params.set('page', String(next))
      else params.delete('page')
      return params
    })
  }

  return { page, skip: page * PAGE_SIZE, limit: PAGE_SIZE, get, set, setPage }
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
