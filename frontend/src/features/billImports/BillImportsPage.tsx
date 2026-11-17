import { Link } from 'react-router'

import { DataTable, type Column } from '@/components/DataTable'
import { ListToolbar } from '@/components/ListToolbar'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PartnerName } from '@/components/RecordNames'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime } from '@/lib/format'
import { useListState, type ListState } from '@/lib/recordPager'
import { useListParams } from '@/lib/useListParams'
import { ImportBillDialog } from './ImportBillDialog'
import { ImportStateBadge } from './ImportStateBadge'
import { useBillImports, type BillImportState, type BillImportSummary } from './queries'

const TABS: { value: BillImportState | 'all'; label: string }[] = [
  { value: 'open', label: 'To review' },
  { value: 'done', label: 'Done' },
  { value: 'discarded', label: 'Discarded' },
  { value: 'all', label: 'All' },
]

// The supplier we matched, or the name as printed on the bill until one is chosen.
export function ImportSupplier({
  bill,
}: {
  bill: Pick<BillImportSummary, 'partner_id' | 'supplier_name'>
}) {
  if (bill.partner_id !== null) return <PartnerName id={bill.partner_id} />
  return (
    <span className="text-muted-foreground">
      {bill.supplier_name ? `“${bill.supplier_name}” (not matched)` : 'Not found on the bill'}
    </span>
  )
}

function columns(listState: ListState | undefined): Column<BillImportSummary>[] {
  return [
    {
      header: 'Bill',
      cell: (bill) => (
        <Link
          to={`/bill-imports/${bill.id}`}
          state={listState}
          className="font-medium hover:underline"
        >
          {bill.partner_reference ?? `Import #${bill.id}`}
        </Link>
      ),
    },
    { header: 'Supplier', cell: (bill) => <ImportSupplier bill={bill} /> },
    {
      header: 'Items',
      cell: (bill) => (
        <span className="flex flex-wrap items-center gap-2">
          {bill.line_count}
          {bill.state === 'open' && bill.missing_products > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {bill.missing_products} without a product
            </span>
          )}
        </span>
      ),
    },
    { header: 'Status', cell: (bill) => <ImportStateBadge state={bill.state} /> },
    { header: 'Imported', cell: (bill) => formatDateTime(bill.created_at) },
    { header: 'By', cell: (bill) => bill.created_by.name },
  ]
}

export function BillImportsPage() {
  const list = useListParams()
  const requested = list.get('state')
  // Opens on what still needs a look.
  const tab = TABS.some((t) => t.value === requested) ? requested : 'open'
  const imports = useBillImports({
    state: tab === 'all' ? undefined : (tab as BillImportState),
    skip: list.skip,
    limit: list.limit,
  })

  // What each import opened from here gets, to step through this same tab.
  const listState = useListState(
    {
      endpoint: '/bill-imports',
      query: { state: tab === 'all' ? undefined : tab },
      limit: list.limit,
      skip: list.skip,
      recordBase: '/bill-imports',
    },
    imports.data?.data,
  )

  return (
    <div className="grid gap-6">
      <PageHeader title="Bill imports" actions={<ImportBillDialog />} />
      <p className="-mt-3 max-w-2xl text-sm text-muted-foreground">
        Import a supplier's bill to turn it into a draft purchase order: it's read and matched to
        your suppliers and products, and you review it before anything is created.
      </p>
      <ListToolbar>
        <Tabs
          value={tab}
          onValueChange={(value) => list.set('state', value === 'open' ? '' : value)}
        >
          <TabsList>
            {TABS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </ListToolbar>
      <DataTable
        columns={columns(listState)}
        rows={imports.data?.data}
        rowKey={(bill) => bill.id}
        rowHref={(bill) => `/bill-imports/${bill.id}`}
        rowState={listState}
        isPending={imports.isPending}
        error={imports.error}
        onRetry={() => imports.refetch()}
        emptyMessage={tab === 'open' ? 'No bills waiting for review.' : 'No bill imports here.'}
      />
      <Pagination
        page={list.page}
        pageSize={list.limit}
        rowCount={imports.data?.data.length}
        // The server says how many there are, so the last page is known exactly.
        hasNext={imports.data ? list.skip + list.limit < imports.data.total : undefined}
        onPageChange={list.setPage}
      />
    </div>
  )
}
