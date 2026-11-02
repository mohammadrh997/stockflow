import { useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DisabledReason } from '@/components/DisabledReason'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { useSetUserActive, useUpdateUser, useUser } from './queries'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { UserForm } from './UserForm'

export function UserPage() {
  const id = Number(useParams().userId)
  const { user: currentUser } = useAuth()
  const user = useUser(id)
  const updateUser = useUpdateUser(id)
  const setActive = useSetUserActive(id)

  if (user.isPending) return <PageSpinner />
  if (user.error instanceof ApiError && user.error.status === 404) return <NotFoundPage />
  if (user.isError) return <ErrorMessage error={user.error} onRetry={() => user.refetch()} />

  const { data } = user
  const isSelf = data.id === currentUser?.id
  const deactivating = data.is_active

  return (
    <div className="grid gap-8">
      <PageHeader
        pageTitle={data.name}
        trail={[{ to: '/users', label: 'Users' }]}
        title={
          <>
            {data.name}
            {!data.is_active && <Badge variant="secondary">Inactive</Badge>}
          </>
        }
        actions={
          <>
            <ResetPasswordDialog user={data} />
            <DisabledReason reason={isSelf ? "You can't deactivate yourself." : null}>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={isSelf}>
                    {deactivating ? 'Deactivate' : 'Activate'}
                  </Button>
                }
                title={deactivating ? `Deactivate ${data.name}?` : `Activate ${data.name}?`}
                description={
                  deactivating
                    ? 'They are logged out and can no longer log in. Their records are kept.'
                    : 'They can log in again with their current password.'
                }
                confirmLabel={deactivating ? 'Deactivate' : 'Activate'}
                destructive={deactivating}
                onConfirm={async () => {
                  await setActive.mutateAsync(!deactivating)
                  toast.success(
                    deactivating ? `Deactivated ${data.name}` : `Activated ${data.name}`,
                  )
                }}
              />
            </DisabledReason>
          </>
        }
      />
      <UserForm
        // Remount with what the server saved (it lower-cases the email, for example).
        key={JSON.stringify(data)}
        isSelf={isSelf}
        submitLabel="Save changes"
        defaultValues={{
          email: data.email,
          name: data.name,
          password: '',
          is_admin: data.is_admin,
          sales_access: data.sales_access,
          purchase_access: data.purchase_access,
          inventory_access: data.inventory_access,
        }}
        onSubmit={async (values) => {
          await updateUser.mutateAsync({
            email: values.email,
            name: values.name,
            is_admin: values.is_admin,
            sales_access: values.sales_access,
            purchase_access: values.purchase_access,
            inventory_access: values.inventory_access,
          })
          toast.success('User saved')
        }}
      />
      <p className="text-sm text-muted-foreground">Created {formatDateTime(data.created_at)}</p>
    </div>
  )
}
