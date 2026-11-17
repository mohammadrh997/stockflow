import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ApiError, applyFieldErrors } from '@/api/errors'
import { canEditPartners } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { PartnerPicker } from '@/components/PartnerPicker'
import { SaveBar } from '@/components/SaveBar'
import { WarehousePicker } from '@/components/WarehousePicker'
import { Input } from '@/components/ui/input'
import { QuickCreatePartnerDialog } from '@/features/partners/QuickCreatePartnerDialog'
import { useWarehouses } from '@/features/warehouses/queries'

export type OrderDetails = {
  partner_id: number
  warehouse_id?: number
  // Purchase orders only: the supplier's own number for the order.
  partner_reference?: string | null
}

type Values = { partner_id: number | null; warehouse_id: number | null; partner_reference: string }

type Props = {
  role: 'customer' | 'supplier'
  defaultValues?: { partner_id: number; warehouse_id: number; partner_reference?: string | null }
  submitLabel: string
  onSubmit: (details: OrderDetails) => Promise<unknown>
}

// The partner and warehouse of an order, and on a purchase order the supplier's reference.
// The warehouse field only appears when there is a choice: with a single warehouse the
// server picks it.
export function OrderDetailsForm({ role, defaultValues, submitLabel, onSubmit }: Props) {
  const { user } = useAuth()
  const [newPartnerName, setNewPartnerName] = useState<string | null>(null)
  const warehouses = useWarehouses()
  const severalWarehouses = (warehouses.data?.length ?? 0) > 1
  const supplier = role === 'supplier'
  const [formError, setFormError] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: {
      partner_id: defaultValues?.partner_id ?? null,
      warehouse_id: defaultValues?.warehouse_id ?? null,
      partner_reference: defaultValues?.partner_reference ?? '',
    },
  })
  const partnerLabel = supplier ? 'Supplier' : 'Customer'

  async function submit(values: Values) {
    setFormError(null)
    try {
      await onSubmit({
        partner_id: values.partner_id!,
        warehouse_id: severalWarehouses ? values.warehouse_id! : undefined,
        // Empty means none: the server clears it.
        ...(supplier && { partner_reference: values.partner_reference.trim() || null }),
      })
      reset(values) // what was saved is the new starting point
    } catch (error) {
      // A reference already used for this supplier: said on the field it's about.
      if (supplier && error instanceof ApiError && error.status === 409) {
        setError('partner_reference', { type: 'server', message: String(error.detail) })
        return
      }
      const fields = ['partner_id', 'warehouse_id', 'partner_reference'] as const
      setFormError(applyFieldErrors(error, fields, setError).join(' ') || null)
    }
  }

  return (
    <>
      <form className="grid max-w-xl gap-4" onSubmit={handleSubmit(submit)} noValidate>
        {formError && <ErrorMessage message={formError} />}
        <div className="grid gap-4">
          <FormField
            label={partnerLabel}
            htmlFor="order-partner"
            error={errors.partner_id?.message}
          >
            <Controller
              name="partner_id"
              control={control}
              rules={{ validate: (value) => value !== null || `Choose a ${role}.` }}
              render={({ field }) => (
                <PartnerPicker
                  id="order-partner"
                  role={role}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                  onCreate={canEditPartners(user) ? setNewPartnerName : undefined}
                />
              )}
            />
          </FormField>
          {supplier && (
            <FormField
              label="Supplier reference"
              htmlFor="order-partner-reference"
              error={errors.partner_reference?.message}
              hint="Their own number for this order, if they gave one."
            >
              <Input
                id="order-partner-reference"
                className="sm:w-72"
                disabled={isSubmitting}
                aria-invalid={errors.partner_reference ? true : undefined}
                {...register('partner_reference', {
                  maxLength: { value: 100, message: 'Use at most 100 characters.' },
                })}
              />
            </FormField>
          )}
          {severalWarehouses && (
            <FormField
              label="Warehouse"
              htmlFor="order-warehouse"
              error={errors.warehouse_id?.message}
            >
              <Controller
                name="warehouse_id"
                control={control}
                rules={{ validate: (value) => value !== null || 'Choose a warehouse.' }}
                render={({ field }) => (
                  <WarehousePicker
                    id="order-warehouse"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                  />
                )}
              />
            </FormField>
          )}
        </div>
        <SaveBar
          label={submitLabel}
          isSubmitting={isSubmitting}
          disabled={warehouses.isPending}
          isDirty={isDirty}
          onDiscard={() => reset()}
          // Editing a saved order waits for a change; creating one is ready at once.
          trackChanges={!!defaultValues}
        />
      </form>
      {/* Outside the form, so submitting the dialog doesn't submit the order. */}
      <QuickCreatePartnerDialog
        name={newPartnerName}
        role={role}
        onClose={() => setNewPartnerName(null)}
        onCreated={(partner) => {
          setNewPartnerName(null)
          setValue('partner_id', partner.id, { shouldDirty: true, shouldValidate: true })
        }}
      />
    </>
  )
}
