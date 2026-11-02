import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProgressTrack } from './ProgressTrack'

const steps = ['draft', 'confirmed', 'received']

describe('ProgressTrack', () => {
  it('marks the current step', () => {
    render(<ProgressTrack steps={steps} state="confirmed" />)

    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('confirmed')
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('shows a cancelled order with no current step', () => {
    render(<ProgressTrack steps={steps} state="cancelled" />)

    const progress = screen.getByRole('list', { name: 'Progress' })
    expect(within(progress).queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })
})
