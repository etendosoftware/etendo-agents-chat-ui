import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AdminPanelClient } from '../app/(authenticated)/admin/AdminPanelClient'
import { vi } from 'vitest'

const insertSelectMock = vi.hoisted(() => vi.fn())
const updateSelectMock = vi.hoisted(() => vi.fn())
const deleteEqMock = vi.hoisted(() => vi.fn())
let lastInsertPayload: any = null
let lastUpdatePayload: any = null
let lastUpdateFilter: { field: string; value: string } | null = null

const fromMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}))

describe('AdminPanelClient', () => {
  beforeEach(() => {
    insertSelectMock.mockReset()
    updateSelectMock.mockReset()
    deleteEqMock.mockReset()
    lastInsertPayload = null
    lastUpdatePayload = null
    lastUpdateFilter = null

    fromMock.mockImplementation(() => ({
      insert: (payload: any[]) => {
        lastInsertPayload = payload[0]
        return {
          select: insertSelectMock,
        }
      },
      update: (payload: any) => {
        lastUpdatePayload = payload
        return {
          eq: (field: string, value: string) => {
            lastUpdateFilter = { field, value }
            return {
              select: updateSelectMock,
            }
          },
        }
      },
      delete: () => ({
        eq: deleteEqMock,
      }),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }))

    insertSelectMock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: 'generated-id',
            ...lastInsertPayload,
          },
        ],
        error: null,
      }),
    )

    updateSelectMock.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: lastUpdateFilter?.value ?? 'agent-1',
            ...lastUpdatePayload,
          },
        ],
        error: null,
      }),
    )

    deleteEqMock.mockResolvedValue({ error: null })
  })

  it('creates a new agent via supabase insert', async () => {
    render(<AdminPanelClient initialAgents={[]} />)

    fireEvent.click(screen.getByRole('button', { name: /new agent/i }))

    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Demo Agent' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Demos features' } })
    fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://example.com/hook' } })
    fireEvent.change(screen.getByLabelText('Agent Path'), { target: { value: '/demo' } })
    fireEvent.change(screen.getByLabelText('Icon (Emoji)'), { target: { value: '✨' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(insertSelectMock).toHaveBeenCalled())

    expect(lastInsertPayload).toMatchObject({
      name: 'Demo Agent',
      path: '/demo',
      access_level: 'public',
    })

    expect(await screen.findByText('Demo Agent')).toBeInTheDocument()
  })
})
