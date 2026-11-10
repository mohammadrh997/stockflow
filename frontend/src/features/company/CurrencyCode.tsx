import { useCompany } from './queries'

// The company's currency after an amount, e.g. "120.00 USD". Nothing until it has loaded.
export function CurrencyCode() {
  const company = useCompany()
  if (!company.data) return null
  // A real space rather than a margin, so copying or hearing it gives "40.00 USD".
  return <span className="text-xs font-normal text-muted-foreground"> {company.data.currency}</span>
}
