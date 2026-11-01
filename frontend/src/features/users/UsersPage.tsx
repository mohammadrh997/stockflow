import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar, SearchInput } from '@/components/ListToolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useListParams } from '@/lib/useListParams'
import { AccessSummary } from './AccessSummary'
import { useUsers, type User } from './queries'

const columns: Column<User>[] = [
  {
    header: 'Name',
    cell: (user) => (
      <Link to={`/users/${user.id}`} className="font-medium hover:underline">
        {user.name}
      </Link>
    ),
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
        isPending={users.isPending}
        error={users.error}
        onRetry={() => users.refetch()}
        emptyMessage={name ? 'No users match your search.' : 'No users yet.'}
      />
    </div>
  )
}
