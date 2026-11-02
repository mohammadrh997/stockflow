import { useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { canEditPartners } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { Panel } from '@/components/Panel'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Button } from '@/components/ui/button'
import { PartnerForm } from './PartnerForm'
import { partnerFormValues, toPartnerPayload } from './partnerValues'
import { usePartner, useSetPartnerArchived, useUpdatePartner } from './queries'

export function PartnerPage() {
  const id = Number(useParams().partnerId)
  const { user } = useAuth()
  const partner = usePartner(id)
  const updatePartner = useUpdatePartner(id)
  const setArchived = useSetPartnerArchived(id)
  const canEdit = canEditPartners(user)

  if (partner.isPending) return <PageSpinner />
  if (partner.error instanceof ApiError && partner.error.status === 404) return <NotFoundPage />
  if (partner.isError) {
    return <ErrorMessage error={partner.error} onRetry={() => partner.refetch()} />
  }

  const { data } = partner
  const archiving = data.is_active
  const values = partnerFormValues(data)

  return (
    <div className="grid gap-6">
      <PageHeader
        pageTitle={data.name}
        trail={[{ to: '/partners', label: 'Partners' }]}
        title={
          <>
            {data.name}
            {!data.is_active && <ArchivedBadge />}
          </>
        }
        actions={
          canEdit && (
            <ConfirmDialog
              trigger={<Button variant="outline">{archiving ? 'Archive' : 'Unarchive'}</Button>}
              title={archiving ? `Archive ${data.name}?` : `Unarchive ${data.name}?`}
              description={
                archiving
                  ? 'Archived partners are hidden from lists and cannot be used on new orders.'
                  : 'The partner will appear in lists and can be used on orders again.'
              }
              confirmLabel={archiving ? 'Archive' : 'Unarchive'}
              destructive={archiving}
              onConfirm={async () => {
                await setArchived.mutateAsync(archiving)
                toast.success(archiving ? `Archived ${data.name}` : `Unarchived ${data.name}`)
              }}
            />
          )
        }
      />
      <Panel>
        <PartnerForm
          // Remount with what the server saved (it lower-cases the email, for example).
          key={JSON.stringify(values)}
          readOnly={!canEdit}
          submitLabel="Save changes"
          defaultValues={values}
          onSubmit={async (formValues) => {
            await updatePartner.mutateAsync(toPartnerPayload(formValues))
            toast.success('Partner saved')
          }}
        />
      </Panel>
    </div>
  )
}
