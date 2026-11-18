import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar, SearchInput } from '@/components/ListToolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RecordLink } from '@/components/RecordLink'
import { useListState } from '@/lib/recordPager'
import { useListParams } from '@/lib/useListParams'
import { AccessSummary } from './AccessSummary'
import { useUsers, type User } from './queries'

const columns: Column<User>[] = [
  {
    header: 'Name',
    cell: (user) => <RecordLink to={`/users/${user.id}`}>{user.name}</RecordLink>,
  },
  { header: 'Email', cell: (user) => user.email },
  { header: 'Access', cell: (user) => <AccessSummary user={user} /> },
  {
    header: 'Status',
    cell: (user) => (user.is_active ? null : <Badge variant="secondary">Inactive</Badge>),
  },
]

export function UsersPage() {
  const list = useListParams()
  const name = list.get('name')
  const users = useUsers(name)
  // Loaded whole, so each user opened from here steps through these same rows.
  const listState = useListState({ limit: 0, skip: 0, recordBase: '/users' }, users.data)

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Users"
        actions={
          <Button asChild>
            <Link to="/users/new">
              <Plus />
              New user
            </Link>
          </Button>
        }
      />
      <ListToolbar>
        <SearchInput
          value={name}
          onChange={(value) => list.set('name', value)}
          placeholder="Search by name"
        />
      </ListToolbar>
      <DataTable
        columns={columns}
        rows={users.data}
        rowKey={(user) => user.id}
        rowHref={(user) => `/users/${user.id}`}
        rowState={listState}
        isPending={users.isPending}
        error={users.error}
        onRetry={() => users.refetch()}
        emptyMessage={name ? 'No users match your search.' : 'No users yet.'}
      />
    </div>
  )
}
