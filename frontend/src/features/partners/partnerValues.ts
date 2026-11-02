import type { Partner } from './queries'

export type PartnerFormValues = {
  name: string
  email: string
  phone: string
  address: string
  is_customer: boolean
  is_supplier: boolean
}

export function partnerFormValues(partner: Partner): PartnerFormValues {
  return {
    name: partner.name,
    email: partner.email ?? '',
    phone: partner.phone ?? '',
    address: partner.address ?? '',
    is_customer: partner.is_customer,
    is_supplier: partner.is_supplier,
  }
}

// The API rejects empty strings for these fields; null clears them.
export function toPartnerPayload(values: PartnerFormValues) {
  return {
    name: values.name.trim(),
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
    is_customer: values.is_customer,
    is_supplier: values.is_supplier,
  }
}
