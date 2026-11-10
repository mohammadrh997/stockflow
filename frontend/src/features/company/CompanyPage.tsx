import { ErrorMessage } from '@/components/ErrorMessage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Panel } from '@/components/Panel'
import { CompanyForm } from './CompanyForm'
import { CompanyLogo } from './CompanyLogo'
import { useCompany } from './queries'

export function CompanyPage() {
  const company = useCompany()

  return (
    <div className="grid gap-6">
      <PageHeader title="Company" />
      <p className="max-w-2xl text-sm text-muted-foreground">
        These details are printed at the top of every invoice, bill and order PDF.
      </p>
      {company.isPending ? (
        <PageSpinner />
      ) : company.error ? (
        <ErrorMessage error={company.error} onRetry={() => company.refetch()} />
      ) : (
        <Panel className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
          <CompanyLogo company={company.data} />
          <CompanyForm company={company.data} />
        </Panel>
      )}
    </div>
  )
}
