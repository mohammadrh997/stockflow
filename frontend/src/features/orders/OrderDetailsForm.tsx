import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { applyFieldErrors } from '@/api/errors'
import { canEditPartners } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { PartnerPicker } from '@/components/PartnerPicker'
import { WarehousePicker } from '@/components/WarehousePicker'
import { Button } from '@/components/ui/button'
import { QuickCreatePartnerDialog } from '@/features/partners/QuickCreatePartnerDialog'
import { useWarehouses } from '@/features/warehouses/queries'

export type OrderDetails = { partner_id: number; warehouse_id?: number }

type Values = { partner_id: number | null; warehouse_id: number | null }

type Props = {
  role: 'customer' | 'supplier'
  defaultValues?: { partner_id: number; warehouse_id: number }
  submitLabel: string
  onSubmit: (details: OrderDetails) => Promise<unknown>
}

// The partner and warehouse of an order. The warehouse field only appears when there is a choice:
// with a single warehouse the server picks it.
export function OrderDetailsForm({ role, defaultValues, submitLabel, onSubmit }: Props) {
  const { user } = useAuth()
  const [newPartnerName, setNewPartnerName] = useState<string | null>(null)
  const warehouses = useWarehouses()
  const severalWarehouses = (warehouses.data?.length ?? 0) > 1
  const [formError, setFormError] = useState<string | null>(null)
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: {
      partner_id: defaultValues?.partner_id ?? null,
      warehouse_id: defaultValues?.warehouse_id ?? null,
    },
  })
  const partnerLabel = role === 'supplier' ? 'Supplier' : 'Customer'

  async function submit(values: Values) {
    setFormError(null)
    try {
      await onSubmit({
        partner_id: values.partner_id!,
        warehouse_id: severalWarehouses ? values.warehouse_id! : undefined,
      })
    } catch (error) {
      const fields = ['partner_id', 'warehouse_id'] as const
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
        <div>
          <Button
            type="submit"
            disabled={isSubmitting || warehouses.isPending || (!!defaultValues && !isDirty)}
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
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
