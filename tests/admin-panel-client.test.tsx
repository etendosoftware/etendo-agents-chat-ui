import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { AdminPanelClient } from '../app/[locale]/(authenticated)/admin/AdminPanelClient'
import { vi } from 'vitest'
import { renderWithIntl } from './utils/intl'
import { locales as supportedLocales, defaultLocale } from '../i18n/config'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(global as any).ResizeObserver = ResizeObserverMock

const insertSelectMock = vi.hoisted(() => vi.fn())
const updateSelectMock = vi.hoisted(() => vi.fn())
const deleteEqMock = vi.hoisted(() => vi.fn())
const upsertMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: [], error: null })))
const promptInsertMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: [], error: null })))
const promptDeleteMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: [], error: null })))

let lastInsertPayload: any = null
let lastUpdatePayload: any = null
let lastUpdateFilter: { field: string; value: string } | null = null
let lastTranslationsPayload: any[] | null = null
let lastPromptsPayload: any[] | null = null

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
    upsertMock.mockClear()
    promptInsertMock.mockClear()
    promptDeleteMock.mockClear()
    lastInsertPayload = null
    lastUpdatePayload = null
    lastUpdateFilter = null
    lastTranslationsPayload = null
    lastPromptsPayload = null

    fromMock.mockImplementation((table: string) => {
      if (table === 'agents') {
        return {
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
        }
      }

      if (table === 'agent_translations') {
        return {
          upsert: (payload: any[]) => {
            lastTranslationsPayload = payload
            return upsertMock()
          },
        }
      }

      if (table === 'agent_prompts') {
        return {
          insert: (payload: any[]) => {
            lastPromptsPayload = payload
            return promptInsertMock()
          },
          delete: () => ({
            eq: promptDeleteMock,
          }),
        }
      }

      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

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
    renderWithIntl(
      <AdminPanelClient
        initialAgents={[]}
        locales={supportedLocales}
        defaultLocale={defaultLocale}
        displayLocale={defaultLocale}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /new agent/i }))

    fireEvent.change(screen.getByLabelText(/Agent name \(EN\)/i), { target: { value: 'Demo Agent' } })
    fireEvent.change(screen.getByLabelText(/Description \(EN\)/i), { target: { value: 'Demos features' } })
    fireEvent.click(screen.getByRole('button', { name: /add prompt/i }))
    fireEvent.change(screen.getByLabelText(/Prompt 1 \(EN\)/i), { target: { value: 'Please describe your issue.' } })

    fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://example.com/hook' } })
    fireEvent.change(screen.getByLabelText('Agent Path'), { target: { value: '/demo' } })
    fireEvent.change(screen.getByLabelText('Icon (Emoji)'), { target: { value: '✨' } })
    fireEvent.change(screen.getByLabelText(/Chatwoot inbox identifier/i), { target: { value: 'inbox-api' } })
    fireEvent.click(screen.getByLabelText(/Require email before chatting/i))

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(insertSelectMock).toHaveBeenCalled())
    await waitFor(() => expect(upsertMock).toHaveBeenCalled())
    await waitFor(() => expect(promptInsertMock).toHaveBeenCalled())

    expect(lastInsertPayload).toMatchObject({
      name: 'Demo Agent',
      path: '/demo',
      access_level: 'public',
      chatwoot_inbox_identifier: 'inbox-api',
      requires_email: true,
    })

    expect(lastTranslationsPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agent_id: 'generated-id', locale: 'en', name: 'Demo Agent' }),
        expect.objectContaining({ agent_id: 'generated-id', locale: 'es' }),
      ]),
    )

    expect(lastPromptsPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agent_id: 'generated-id', locale: 'en', content: 'Please describe your issue.', sort_order: 0 }),
      ]),
    )

    expect(await screen.findByText('Demo Agent')).toBeInTheDocument()
  })

  it('updates chatwoot settings when editing an agent', async () => {
    const translations = Object.fromEntries(
      supportedLocales.map((locale) => [
        locale,
        {
          name: 'Existing Agent',
          description: 'Helps out',
        },
      ]),
    ) as any

    const prompts = Object.fromEntries(supportedLocales.map((locale) => [locale, []])) as any

    renderWithIntl(
      <AdminPanelClient
        initialAgents={[
          {
            id: 'agent-1',
            webhookurl: 'https://example.com/hook',
            path: '/existing',
            color: 'blue',
            icon: '🤖',
            access_level: 'public',
            requires_email: true,
            chatwoot_inbox_identifier: 'inbox-123',
            translations,
            prompts,
          },
        ]}
        locales={supportedLocales}
        defaultLocale={defaultLocale}
        displayLocale={defaultLocale}
      />,
    )

    const editButton = screen
      .getAllByRole('button')
      .find((button) => button.className.includes('text-gray-600')) as HTMLButtonElement

    fireEvent.click(editButton)

    const chatwootField = screen.getByLabelText(/Chatwoot inbox identifier/i)
    expect(chatwootField).toHaveValue('inbox-123')

    fireEvent.change(chatwootField, { target: { value: '' } })

    const emailSwitch = screen.getByLabelText(/Require email before chatting/i)
    fireEvent.click(emailSwitch)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(updateSelectMock).toHaveBeenCalled())

    expect(lastUpdatePayload).toMatchObject({
      chatwoot_inbox_identifier: null,
      requires_email: false,
    })

    expect(lastUpdateFilter).toEqual({ field: 'id', value: 'agent-1' })
  })
})
