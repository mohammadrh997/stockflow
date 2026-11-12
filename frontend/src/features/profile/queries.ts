import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas, type TokenResponse } from '@/api/client'
import { unwrap } from '@/api/errors'
import { meQueryKey, useAuth } from '@/auth/useAuth'

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => unwrap(api.PATCH('/auth/me', { body: { name } })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryKey, user)
      return queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useChangePassword() {
  const { replaceTokens } = useAuth()
  return useMutation({
    mutationFn: async (body: Schemas['PasswordChange']) =>
      (await unwrap(api.POST('/auth/me/password', { body }))) as TokenResponse,
    onSuccess: (data) => replaceTokens(data),
  })
}
