import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { PartnerForm } from './PartnerForm'
import { toPartnerPayload } from './partnerValues'
import { useCreatePartner } from './queries'

export function NewPartnerPage() {
  const navigate = useNavigate()
  const createPartner = useCreatePartner()

  return (
    <div className="grid gap-6">
      <PageHeader title="New partner" back={{ to: '/partners', label: 'Partners' }} />
      <PartnerForm
        submitLabel="Create partner"
        onSubmit={async (values) => {
          const partner = await createPartner.mutateAsync(toPartnerPayload(values))
          toast.success(`Created ${partner.name}`)
          navigate(`/partners/${partner.id}`, { replace: true })
        }}
      />
    </div>
  )
}
