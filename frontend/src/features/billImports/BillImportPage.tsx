import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError, errorMessage } from '@/api/errors'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DisabledReason } from '@/components/DisabledReason'
import { DoneByRows } from '@/components/DoneByRows'
import { ErrorMessage } from '@/components/ErrorMessage'
import { InlineTextField } from '@/components/InlineTextField'
import { Money } from '@/components/Money'
import { NotFoundPage } from '@/components/NotFoundPage'
import { PageHeader } from '@/components/PageHeader'
import { PageSpinner } from '@/components/PageSpinner'
import { Panel } from '@/components/Panel'
import { PartnerPicker } from '@/components/PartnerPicker'
import { RecordLayout } from '@/components/RecordLayout'
import { WarehouseName } from '@/components/RecordNames'
import { WarehousePicker } from '@/components/WarehousePicker'
import { Button } from '@/components/ui/button'
import { usePurchaseOrder } from '@/features/purchase/queries'
import { useWarehouses } from '@/features/warehouses/queries'
import { formatDate } from '@/lib/dates'
import { ImportSupplier } from './BillImportsPage'
import { ImportLinesTable } from './ImportLinesTable'
import { ImportStateBadge } from './ImportStateBadge'
import { ImportWarnings } from './ImportWarnings'
import { useBillImport, useFinishImport, useUpdateImport, type BillImport } from './queries'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

const none = <span className="text-muted-foreground">Not on the bill</span>

// The order a confirmed import became, by its reference.
function OrderLink({ id }: { id: number }) {
  const order = usePurchaseOrder(id)
  return (
    <Button asChild variant="outline">
      <Link to={`/purchase-orders/${id}`}>
        <ExternalLink />
        Open {order.data?.reference ?? 'the purchase order'}
      </Link>
    </Button>
  )
}

function Actions({ bill }: { bill: BillImport }) {
  const finish = useFinishImport(bill.id)
  const navigate = useNavigate()
  if (bill.state === 'done' && bill.purchase_order_id !== null) {
    return <OrderLink id={bill.purchase_order_id} />
  }
  if (bill.state !== 'open') return null

  const blocking = bill.warnings.filter((warning) => warning.blocks_confirm)

  async function create() {
    try {
      const done = await finish.confirm.mutateAsync()
      toast.success('Draft purchase order created')
      if (done.purchase_order_id !== null) navigate(`/purchase-orders/${done.purchase_order_id}`)
    } catch (error) {
      // 409: something changed meanwhile (the reference was used, it was confirmed already).
      toast.error(
        error instanceof ApiError && typeof error.detail === 'string'
          ? error.detail
          : errorMessage(error),
      )
    }
  }

  return (
    <>
      <DisabledReason reason={blocking.length > 0 ? blocking[0].message : null}>
        <Button disabled={blocking.length > 0 || finish.confirm.isPending} onClick={create}>
          {finish.confirm.isPending ? 'Creating…' : 'Create purchase order'}
        </Button>
      </DisabledReason>
      <ConfirmDialog
        trigger={
          <Button variant="outline" disabled={finish.confirm.isPending}>
            Discard
          </Button>
        }
        title="Discard this import?"
        description="Nothing is created from it. You can import the bill again later."
        confirmLabel="Discard"
        destructive
        onConfirm={async () => {
          await finish.discard.mutateAsync()
          toast.success('Import discarded')
        }}
      />
    </>
  )
}

function Details({ bill, editable }: { bill: BillImport; editable: boolean }) {
  const update = useUpdateImport(bill.id)
  const warehouses = useWarehouses()
  const severalWarehouses = (warehouses.data?.length ?? 0) > 1

  async function save(changes: Parameters<typeof update.mutateAsync>[0]) {
    try {
      await update.mutateAsync(changes)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Panel>
      <div className="grid gap-6">
        <ImportWarnings warnings={bill.warnings} />
        <dl className="grid max-w-2xl grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          <Detail label="On the bill">{bill.supplier_name ?? none}</Detail>
          <Detail label="Supplier">
            {editable ? (
              <PartnerPicker
                id="import-supplier"
                role="supplier"
                value={bill.partner_id}
                onChange={(partnerId) => partnerId !== null && void save({ partner_id: partnerId })}
                placeholder="Choose the supplier"
                disabled={update.isPending}
              />
            ) : (
              <ImportSupplier bill={bill} />
            )}
          </Detail>
          <Detail label="Bill number">
            {editable ? (
              <InlineTextField
                // Remount with what the server saved.
                key={bill.partner_reference ?? ''}
                label="Bill number"
                value={bill.partner_reference}
                placeholder="As printed on the bill"
                onSave={(partner_reference) => update.mutateAsync({ partner_reference })}
              />
            ) : (
              (bill.partner_reference ?? none)
            )}
          </Detail>
          <Detail label="Bill date">{bill.bill_date ? formatDate(bill.bill_date) : none}</Detail>
          <Detail label="Currency">{bill.currency ?? none}</Detail>
          <Detail label="Goods go to">
            {editable && severalWarehouses ? (
              <WarehousePicker
                id="import-warehouse"
                value={bill.warehouse_id}
                onChange={(warehouseId) =>
                  warehouseId !== null && void save({ warehouse_id: warehouseId })
                }
                disabled={update.isPending}
              />
            ) : bill.warehouse_id !== null ? (
              <WarehouseName id={bill.warehouse_id} />
            ) : (
              '—'
            )}
          </Detail>
          <Detail label="Bill total">
            {bill.bill_total !== null ? <Money value={bill.bill_total} /> : none}
          </Detail>
          <Detail label="Items total">
            <Money value={bill.total} />
          </Detail>
          <DoneByRows label="Imported" at={bill.created_at} by={bill.created_by} />
        </dl>
      </div>
    </Panel>
  )
}

export function BillImportPage() {
  const id = Number(useParams().importId)
  const query = useBillImport(id)

  if (query.isPending) return <PageSpinner />
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundPage />
  if (query.isError) return <ErrorMessage error={query.error} onRetry={() => query.refetch()} />

  const bill = query.data
  const editable = bill.state === 'open'
  const title = bill.partner_reference
    ? `Bill ${bill.partner_reference}`
    : `Bill import #${bill.id}`

  return (
    <RecordLayout
      header={<PageHeader title={title} trail={[{ to: '/bill-imports', label: 'Bill imports' }]} />}
      status={<ImportStateBadge state={bill.state} />}
      actions={<Actions bill={bill} />}
      details={<Details bill={bill} editable={editable} />}
    >
      <section className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Items</h2>
        <ImportLinesTable bill={bill} editable={editable} />
      </section>
    </RecordLayout>
  )
}
