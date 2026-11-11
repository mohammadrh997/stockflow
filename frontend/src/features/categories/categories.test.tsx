import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { makeUser, renderApp, signInAs } from '@/test/renderApp'
import { API, server } from '@/test/server'
import { heightOf, parentChoices } from './categoryTree'
import type { Category } from './queries'

function cat(id: number, path: string, parent_id: number | null, is_active = true): Category {
  const parts = path.split(' / ')
  return { id, name: parts.at(-1)!, parent_id, is_active, path, depth: parts.length }
}

// Sorted by path, as the API sends them.
const tree = [
  cat(1, 'Furniture', null),
  cat(2, 'Furniture / Chairs', 1),
  cat(3, 'Furniture / Chairs / Office', 2),
  cat(4, 'Furniture / Tables', 1),
  cat(5, 'Paper', null),
]

const deep = [
  cat(10, 'A', null),
  cat(11, 'A / B', 10),
  cat(12, 'A / B / C', 11),
  cat(13, 'A / B / C / D', 12),
  cat(14, 'A / B / C / D / E', 13),
]

describe('category tree', () => {
  it('measures how many levels a branch spans', () => {
    expect(heightOf(tree, 1)).toBe(3)
    expect(heightOf(tree, 3)).toBe(1)
  })

  it('never offers a move into the category itself or below it', () => {
    const choices = parentChoices(tree, tree[1]).map((c) => c.id)
    expect(choices).toEqual([1, 4, 5])
  })

  it('leaves out parents that would make the tree too deep', () => {
    // A new category can't go under level 5...
    expect(parentChoices(deep).map((c) => c.id)).toEqual([10, 11, 12, 13])
    // ...and a two-level branch can't go under level 4.
    const branch = [...deep, cat(20, 'X', null), cat(21, 'X / Y', 20)]
    expect(parentChoices(branch, branch[5]).map((c) => c.id)).toEqual([10, 11, 12])
  })
})

describe('categories page', () => {
  function mockTree(categories: Category[] = tree) {
    server.use(http.get(`${API}/categories`, () => HttpResponse.json(categories)))
  }

  it('shows the tree read-only to people who cannot manage products', async () => {
    mockTree()
    signInAs(makeUser({ sales_access: 'user' }))
    renderApp('/categories')

    const list = await screen.findByRole('list', { name: 'Categories' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Furniture', 'Chairs', 'Office', 'Tables', 'Paper'])
    expect(screen.queryByRole('button', { name: 'New category' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
    const [section] = screen.getAllByRole('navigation', { name: 'Section' })
    expect(within(section).getByRole('link', { name: 'Categories' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('adds a subcategory under the row it was opened from', async () => {
    mockTree()
    let body: unknown
    server.use(
      http.post(`${API}/categories`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(cat(9, 'Furniture / Chairs / Gaming', 2), { status: 201 })
      }),
    )
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/categories')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Actions for Chairs' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add subcategory' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox', { name: 'Parent category' })).toHaveTextContent(
      'Furniture / Chairs',
    )
    await user.type(within(dialog).getByLabelText('Name'), ' Gaming ')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))

    await waitFor(() => expect(body).toEqual({ name: 'Gaming', parent_id: 2 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('sends only the name when a category is renamed in place', async () => {
    mockTree()
    let body: unknown
    server.use(
      http.patch(`${API}/categories/4`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(cat(4, 'Furniture / Desks', 1))
      }),
    )
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/categories')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Actions for Tables' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename or move' }))
    const name = within(await screen.findByRole('dialog')).getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Desks')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(body).toEqual({ name: 'Desks' }))
  })

  it('says why the server refused to archive', async () => {
    mockTree()
    server.use(
      http.post(`${API}/categories/1/archive`, () =>
        HttpResponse.json(
          { detail: "Can't be archived: it still has active subcategories" },
          { status: 409 },
        ),
      ),
    )
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/categories')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Actions for Furniture' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))

    expect(await screen.findByText(/it still has active subcategories/)).toBeInTheDocument()
  })

  it('shows archived categories when asked, offering only Restore', async () => {
    const requests: (string | null)[] = []
    server.use(
      http.get(`${API}/categories`, ({ request }) => {
        const archived = new URL(request.url).searchParams.get('include_archived')
        requests.push(archived)
        return HttpResponse.json(
          archived === 'true' ? [...tree, cat(6, 'Old stuff', null, false)] : tree,
        )
      }),
    )
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/categories')
    const user = userEvent.setup()

    await screen.findByRole('list', { name: 'Categories' })
    await user.click(screen.getByLabelText('Show archived'))
    const row = (await screen.findByText('Old stuff')).closest('li')!
    expect(within(row).getByText('Archived')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Actions for Old stuff' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Restore',
    ])
    expect(requests).toContain('true')
  })
})

describe('categories on products', () => {
  const product = {
    id: 7,
    name: 'Desk chair',
    sku: 'CHAIR-1',
    sale_price: '50.00',
    cost_price: '30.00',
    category_id: 3,
    image_url: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    created_by: { id: 1, name: 'Admin' },
  }

  it('shows the category path of each product in the list', async () => {
    server.use(
      http.get(`${API}/categories`, () => HttpResponse.json(tree)),
      http.get(`${API}/products`, () => HttpResponse.json([product])),
    )
    signInAs(makeUser())
    renderApp('/products')

    const row = (await screen.findByRole('link', { name: 'Desk chair' })).closest('tr')!
    expect(await within(row).findByText('Furniture / Chairs / Office')).toBeInTheDocument()
  })

  it('picks a category by searching its path, and can clear it again', async () => {
    let body: unknown
    server.use(
      http.get(`${API}/categories`, () => HttpResponse.json(tree)),
      http.get(`${API}/products/7`, () => HttpResponse.json(product)),
      http.patch(`${API}/products/7`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...product, category_id: 4 })
      }),
    )
    signInAs(makeUser({ inventory_access: 'manager' }))
    renderApp('/products/7')
    const user = userEvent.setup()

    const picker = await screen.findByRole('combobox', { name: 'Category' })
    await waitFor(() => expect(picker).toHaveTextContent('Furniture / Chairs / Office'))
    await user.click(picker)
    await user.type(await screen.findByPlaceholderText('Search categories…'), 'tabl')
    await user.click(await screen.findByRole('option', { name: 'Furniture / Tables' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(body).toMatchObject({ category_id: 4 }))

    await user.click(await screen.findByRole('button', { name: 'Clear category' }))
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('No category')
  })
})
