import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Schemas } from '@/api/client'
import { unwrap } from '@/api/errors'

export type Warehouse = Schemas['WarehouseRead']
export type WarehouseCreate = Schemas['WarehouseCreate']
export type WarehouseUpdate = Schemas['WarehouseUpdate']
export type Location = Schemas['LocationRead']
export type LocationType = Schemas['LocationType']

export type LocationListParams = {
  warehouse_id?: number
  location_type?: LocationType
  include_archived?: boolean
}

export const VIRTUAL_LOCATION_TYPES: LocationType[] = ['supplier', 'customer', 'loss']

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: () => unwrap(api.GET('/warehouses')),
  })
}

export function useWarehouse(id: number) {
  return useQuery({
    queryKey: ['warehouse', id],
    queryFn: () =>
      unwrap(api.GET('/warehouses/{warehouse_id}', { params: { path: { warehouse_id: id } } })),
  })
}

export function useLocations(params: LocationListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['locations', params],
    queryFn: () => unwrap(api.GET('/locations', { params: { query: params } })),
    enabled: options.enabled,
  })
}

function useInvalidateWarehouses() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse'] }),
      queryClient.invalidateQueries({ queryKey: ['locations'] }),
    ])
}

export function useCreateWarehouse() {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: (body: WarehouseCreate) => unwrap(api.POST('/warehouses', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateWarehouse(id: number) {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: (body: WarehouseUpdate) =>
      unwrap(
        api.PATCH('/warehouses/{warehouse_id}', { params: { path: { warehouse_id: id } }, body }),
      ),
    onSuccess: invalidate,
  })
}

export function useCreateLocation() {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: (body: Schemas['LocationCreate']) => unwrap(api.POST('/locations', { body })),
    onSuccess: invalidate,
  })
}

export function useRenameLocation(id: number) {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: (name: string) =>
      unwrap(
        api.PATCH('/locations/{location_id}', {
          params: { path: { location_id: id } },
          body: { name },
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useSetLocationArchived(id: number) {
  const invalidate = useInvalidateWarehouses()
  return useMutation({
    mutationFn: (archived: boolean) => {
      const params = { path: { location_id: id } }
      return unwrap(
        archived
          ? api.POST('/locations/{location_id}/archive', { params })
          : api.POST('/locations/{location_id}/unarchive', { params }),
      )
    },
    onSuccess: invalidate,
  })
}
