import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OrderSteps } from './OrderSteps'

const steps = ['draft', 'confirmed', 'received']

describe('OrderSteps', () => {
  it('marks the current step', () => {
    render(<OrderSteps steps={steps} state="confirmed" />)

    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('confirmed')
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('shows a cancelled order with no current step', () => {
    render(<OrderSteps steps={steps} state="cancelled" />)

    const progress = screen.getByRole('list', { name: 'Order progress' })
    expect(within(progress).queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
    expect(within(progress).getByText('Cancelled')).toBeInTheDocument()
  })
})
