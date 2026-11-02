import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './errors'

const MAX_RETRIES = 2

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const clientError = error instanceof ApiError && error.status >= 400 && error.status < 500
          return !clientError && failureCount < MAX_RETRIES
        },
      },
    },
  })
}
