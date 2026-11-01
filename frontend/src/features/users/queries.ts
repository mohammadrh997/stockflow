import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'
import { meQueryKey } from '@/auth/useAuth'

export type User = Schemas['UserRead']
export type AccessLevel = User['sales_access']

export const ACCESS_LEVELS: AccessLevel[] = ['none', 'user', 'manager']

export function useUsers(name: string) {
  return useQuery({
    queryKey: ['users', { name }],
    queryFn: () => unwrap(api.GET('/users', { params: { query: { name: name || undefined } } })),
    placeholderData: keepPreviousData,
  })
}

export function useUser(id: number) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => unwrap(api.GET('/users/{user_id}', { params: { path: { user_id: id } } })),
  })
}

// Admins can edit their own row too, so the current user is refreshed as well.
function useStoreUser() {
  const queryClient = useQueryClient()
  return (user: User) => {
    queryClient.setQueryData(['user', user.id], user)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: meQueryKey }),
    ])
  }
}

export function useCreateUser() {
  const store = useStoreUser()
  return useMutation({
    mutationFn: (body: Schemas['UserCreate']) => unwrap(api.POST('/users', { body })),
    onSuccess: store,
  })
}

export function useUpdateUser(id: number) {
  const store = useStoreUser()
  return useMutation({
    mutationFn: (body: Schemas['UserUpdate']) =>
      unwrap(api.PATCH('/users/{user_id}', { params: { path: { user_id: id } }, body })),
    onSuccess: store,
  })
}

export function useSetUserActive(id: number) {
  const store = useStoreUser()
  return useMutation({
    mutationFn: (active: boolean) => {
      const params = { path: { user_id: id } }
      return unwrap(
        active
          ? api.POST('/users/{user_id}/activate', { params })
          : api.POST('/users/{user_id}/deactivate', { params }),
      )
    },
    onSuccess: store,
  })
}

export function useResetPassword(id: number) {
  return useMutation({
    mutationFn: (newPassword: string) =>
      unwrap(
        api.POST('/users/{user_id}/reset-password', {
          params: { path: { user_id: id } },
          body: { new_password: newPassword },
        }),
      ),
  })
}
