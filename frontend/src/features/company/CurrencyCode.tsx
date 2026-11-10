import { useCompany } from './queries'

// The company's currency after an amount, e.g. "120.00 USD". Nothing until it has loaded.
export function CurrencyCode() {
  const company = useCompany()
  if (!company.data) return null
  return (
    <span className="ml-1 text-xs font-normal text-muted-foreground">{company.data.currency}</span>
  )
}
