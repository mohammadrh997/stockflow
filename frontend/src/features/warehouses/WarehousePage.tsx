import { useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { can } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ArchivedBadge } from '@/components/ArchivedBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable, type Column } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ShowArchivedToggle } from '@/components/ListToolbar'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useListParams } from '@/lib/useListParams'
import { AddLocationForm } from './AddLocationForm'
import { useLocations, useSetLocationArchived, useWarehouse, type Location } from './queries'
import { RenameLocationDialog } from './RenameLocationDialog'
import { WarehouseSettingsForm } from './WarehouseSettingsForm'

function ArchiveLocationButton({ location }: { location: Location }) {
  const setArchived = useSetLocationArchived(location.id)
  const archiving = location.is_active

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          {archiving ? 'Archive' : 'Unarchive'}
        </Button>
      }
      title={archiving ? `Archive ${location.name}?` : `Unarchive ${location.name}?`}
      description={
        archiving
          ? 'Archived locations are hidden and cannot receive stock. A location that still holds stock cannot be archived.'
          : 'The location can be used for stock again.'
      }
      confirmLabel={archiving ? 'Archive' : 'Unarchive'}
      destructive={archiving}
      onConfirm={async () => {
        await setArchived.mutateAsync(archiving)
        toast.success(archiving ? `Archived ${location.name}` : `Unarchived ${location.name}`)
      }}
    />
  )
}

export function WarehousePage() {
  const id = Number(useParams().warehouseId)
  const { user } = useAuth()
  const list = useListParams()
  const showArchived = list.get('archived') === 'true'
  const warehouse = useWarehouse(id)
  const locations = useLocations({
    warehouse_id: id,
    location_type: 'internal',
    include_archived: showArchived,
  })
  const canManage = can(user, 'inventory', 'manager')

  if (warehouse.isPending) return <PageSpinner />
  if (warehouse.error instanceof ApiError && warehouse.error.status === 404) {
    return <NotFoundPage />
  }
  if (warehouse.isError) {
    return <ErrorMessage error={warehouse.error} onRetry={() => warehouse.refetch()} />
  }

  const { data } = warehouse
  const defaultName = data.locations.find((l) => l.id === data.default_location_id)?.name

  const columns: Column<Location>[] = [
    { header: 'Name', cell: (location) => <span className="font-medium">{location.name}</span> },
    {
      header: 'Status',
      cell: (location) => (
        <div className="flex gap-1">
          {location.id === data.default_location_id && <Badge>Default</Badge>}
          {!location.is_active && <ArchivedBadge />}
        </div>
      ),
    },
  ]
  if (canManage) {
    columns.push({
      header: 'Actions',
      className: 'text-right',
      cell: (location) => (
        <div className="flex justify-end gap-1">
          <RenameLocationDialog location={location} />
          {location.id !== data.default_location_id && (
            <ArchiveLocationButton location={location} />
          )}
        </div>
      ),
    })
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title={
          <>
            {data.name}
            <Badge variant="outline">{data.code}</Badge>
          </>
        }
      />

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        {canManage ? (
          <WarehouseSettingsForm
            // Remount with what the server saved.
            key={`${data.name}|${data.default_location_id}`}
            warehouse={data}
          />
        ) : (
          <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{data.name}</dd>
            <dt className="text-muted-foreground">Default location</dt>
            <dd>{defaultName ?? '—'}</dd>
          </dl>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Locations</h2>
          <ShowArchivedToggle
            checked={showArchived}
            onChange={(checked) => list.set('archived', checked ? 'true' : '')}
          />
        </div>
        {canManage && <AddLocationForm warehouseId={data.id} />}
        <DataTable
          columns={columns}
          rows={locations.data}
          rowKey={(location) => location.id}
          isPending={locations.isPending}
          error={locations.error}
          onRetry={() => locations.refetch()}
          emptyMessage="No locations."
        />
      </section>
    </div>
  )
}
