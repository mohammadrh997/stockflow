import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { canEditPartners } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar, SearchInput, ShowArchivedToggle } from '@/components/ListToolbar'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useListParams } from '@/lib/useListParams'
import { PartnerRoles } from './PartnerRoles'
import { usePartners, type Partner } from './queries'

const columns: Column<Partner>[] = [
  {
    header: 'Name',
    cell: (partner) => (
      <Link to={`/partners/${partner.id}`} className="font-medium hover:underline">
        {partner.name}
      </Link>
    ),
  },
  { header: 'Email', cell: (partner) => partner.email },
  { header: 'Phone', cell: (partner) => partner.phone },
  { header: 'Roles', cell: (partner) => <PartnerRoles partner={partner} /> },
  { header: 'Status', cell: (partner) => (partner.is_active ? null : <ArchivedBadge />) },
]

type RoleFilter = 'all' | 'customers' | 'suppliers'

export function PartnersPage() {
  const { user } = useAuth()
  const list = useListParams()
  const name = list.get('name')
  const role = (list.get('role') || 'all') as RoleFilter
  const showArchived = list.get('archived') === 'true'
  const partners = usePartners({
    name: name || undefined,
    is_customer: role === 'customers' ? true : undefined,
    is_supplier: role === 'suppliers' ? true : undefined,
    include_archived: showArchived,
    skip: list.skip,
    limit: list.limit,
  })

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Partners"
        actions={
          canEditPartners(user) && (
            <Button asChild>
              <Link to="/partners/new">
                <Plus />
                New partner
              </Link>
            </Button>
          )
        }
      />
      <ListToolbar>
        <Tabs
          value={role}
          onValueChange={(value) => list.set('role', value === 'all' ? '' : value)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput
          value={name}
          onChange={(value) => list.set('name', value)}
          placeholder="Search by name"
        />
        <ShowArchivedToggle
          checked={showArchived}
          onChange={(checked) => list.set('archived', checked ? 'true' : '')}
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={partners.data}
        rowKey={(partner) => partner.id}
        rowHref={(partner) => `/partners/${partner.id}`}
        isPending={partners.isPending}
        error={partners.error}
        onRetry={() => partners.refetch()}
        emptyMessage={name ? 'No partners match your search.' : 'No partners yet.'}
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={partners.data?.length}
        onPageChange={list.setPage}
      />
    </div>
  )
}
