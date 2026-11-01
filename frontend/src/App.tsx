import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider, type RouterProviderProps } from 'react-router/dom'

type Props = { queryClient: QueryClient; router: RouterProviderProps['router'] }

export function App({ queryClient, router }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
