import { Outlet, type RouteObject } from 'react-router'

import { AuthProvider } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { can, canEditPartners } from '@/auth/permissions'
import { RequireAccess } from '@/auth/RequireAccess'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from '@/components/NotFoundPage'
import { HomePage } from '@/features/home/HomePage'
import { NewPartnerPage } from '@/features/partners/NewPartnerPage'
import { PartnerPage } from '@/features/partners/PartnerPage'
import { PartnersPage } from '@/features/partners/PartnersPage'
import { NewProductPage } from '@/features/products/NewProductPage'
import { ProductPage } from '@/features/products/ProductPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { NewPurchaseOrderPage } from '@/features/purchase/NewPurchaseOrderPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { PurchaseOrderPage } from '@/features/purchase/PurchaseOrderPage'
import { PurchaseOrdersPage } from '@/features/purchase/PurchaseOrdersPage'
import { NewSalesOrderPage } from '@/features/sales/NewSalesOrderPage'
import { SalesOrderPage } from '@/features/sales/SalesOrderPage'
import { SalesOrdersPage } from '@/features/sales/SalesOrdersPage'
import { StockPage } from '@/features/stock/StockPage'
import { NewAdjustmentPage } from '@/features/transfers/NewAdjustmentPage'
import { NewInternalTransferPage } from '@/features/transfers/NewInternalTransferPage'
import { TransferPage } from '@/features/transfers/TransferPage'
import { TransfersPage } from '@/features/transfers/TransfersPage'
import { NewUserPage } from '@/features/users/NewUserPage'
import { UserPage } from '@/features/users/UserPage'
import { UsersPage } from '@/features/users/UsersPage'
import { WarehousePage } from '@/features/warehouses/WarehousePage'
import { WarehousesPage } from '@/features/warehouses/WarehousesPage'

// AuthProvider sits inside the router so it and the pages it wraps can use navigation hooks.
export const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: 'products', element: <ProductsPage /> },
              {
                path: 'products/new',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'inventory', 'manager')}>
                    <NewProductPage />
                  </RequireAccess>
                ),
              },
              { path: 'products/:productId', element: <ProductPage /> },
              { path: 'partners', element: <PartnersPage /> },
              {
                path: 'partners/new',
                element: (
                  <RequireAccess allowed={canEditPartners}>
                    <NewPartnerPage />
                  </RequireAccess>
                ),
              },
              { path: 'partners/:partnerId', element: <PartnerPage /> },
              { path: 'stock', element: <StockPage /> },
              {
                path: 'purchase-orders',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'purchase')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <PurchaseOrdersPage /> },
                  { path: 'new', element: <NewPurchaseOrderPage /> },
                  { path: ':orderId', element: <PurchaseOrderPage /> },
                ],
              },
              {
                path: 'sales-orders',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'sales')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <SalesOrdersPage /> },
                  { path: 'new', element: <NewSalesOrderPage /> },
                  { path: ':orderId', element: <SalesOrderPage /> },
                ],
              },
              {
                path: 'transfers',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'inventory')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <TransfersPage /> },
                  { path: 'internal', element: <NewInternalTransferPage /> },
                  {
                    path: 'adjustment',
                    element: (
                      <RequireAccess allowed={(user) => can(user, 'inventory', 'manager')}>
                        <NewAdjustmentPage />
                      </RequireAccess>
                    ),
                  },
                  { path: ':transferId', element: <TransferPage /> },
                ],
              },
              { path: 'warehouses', element: <WarehousesPage /> },
              { path: 'warehouses/:warehouseId', element: <WarehousePage /> },
              {
                path: 'users',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'admin')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <UsersPage /> },
                  { path: 'new', element: <NewUserPage /> },
                  { path: ':userId', element: <UserPage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]
