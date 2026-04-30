import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/mongodb', () => ({ connectToDatabase: connectMock }))

describe('chatwoot message store', () => {
  let fakeCollection: {
    findOneAndUpdate: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fakeCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      findOne: vi.fn().mockResolvedValue(null),
    }
    const fakeDb = { collection: vi.fn().mockReturnValue(fakeCollection) }
    connectMock.mockResolvedValue({ db: fakeDb })
  })

  // ─── saveChatwootWebhookEvent ──────────────────────────────────────────────

  describe('saveChatwootWebhookEvent', () => {
    it('saves outgoing non-private message to MongoDB by chatwootConversationId', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'message_created',
        id: 1,
        content: 'Hello from bot',
        message_type: 'outgoing',
        private: false,
        created_at: 1700000000,
        conversation: { id: 123 },
        sender: { name: 'Bot' },
        attachments: [],
      })

      expect(fakeCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { chatwootConversationId: '123' },
        expect.objectContaining({
          $push: expect.objectContaining({
            chatwootMessages: expect.objectContaining({
              id: '1',
              content: 'Hello from bot',
              messageType: 'outgoing',
            }),
          }),
        }),
        expect.any(Object),
      )
    })

    it('saves outgoing message when message_type is numeric 1 (Chatwoot bot response)', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'message_created',
        id: 5,
        content: 'Bot response',
        message_type: 1,
        private: false,
        created_at: 1700000000,
        conversation: { id: 123 },
        sender: { name: 'Bot' },
        attachments: [],
      })

      expect(fakeCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { chatwootConversationId: '123' },
        expect.objectContaining({
          $push: expect.objectContaining({
            chatwootMessages: expect.objectContaining({ id: '5', content: 'Bot response' }),
          }),
        }),
        expect.any(Object),
      )
    })

    it('ignores incoming messages with numeric type 0', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'message_created',
        id: 6,
        content: 'User message',
        message_type: 0,
        private: false,
        created_at: 1700000000,
        conversation: { id: 123 },
      })

      expect(fakeCollection.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('ignores private messages', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'message_created',
        id: 2,
        content: 'Private note',
        message_type: 'outgoing',
        private: true,
        created_at: 1700000000,
        conversation: { id: 123 },
      })

      expect(fakeCollection.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('ignores incoming messages from users', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'message_created',
        id: 3,
        content: 'User message',
        message_type: 'incoming',
        private: false,
        created_at: 1700000000,
        conversation: { id: 123 },
      })

      expect(fakeCollection.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('ignores activity messages', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'message_created',
        id: 4,
        content: 'Conversation was created',
        message_type: 'activity',
        private: false,
        created_at: 1700000000,
        conversation: { id: 123 },
      })

      expect(fakeCollection.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('saves label state from conversation_updated event', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'conversation_updated',
        id: 123,
        labels: ['humano', 'vip'],
      })

      expect(fakeCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { chatwootConversationId: '123' },
        expect.objectContaining({
          $set: expect.objectContaining({
            chatwootLabels: ['humano', 'vip'],
          }),
        }),
        expect.any(Object),
      )
    })

    it('saves empty labels array when conversation_updated has no labels', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({
        event: 'conversation_updated',
        id: 456,
      })

      expect(fakeCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { chatwootConversationId: '456' },
        expect.objectContaining({
          $set: expect.objectContaining({
            chatwootLabels: [],
          }),
        }),
        expect.any(Object),
      )
    })

    it('does nothing and does not connect to MongoDB for unrecognized events', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent({ event: 'unknown_event_xyz' })

      expect(connectMock).not.toHaveBeenCalled()
      expect(fakeCollection.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('does nothing when payload is not an object', async () => {
      const { saveChatwootWebhookEvent } = await import('../lib/chatwoot/message-store')

      await saveChatwootWebhookEvent(null)
      await saveChatwootWebhookEvent(undefined)
      await saveChatwootWebhookEvent('string')

      expect(connectMock).not.toHaveBeenCalled()
    })
  })

  // ─── getChatwootPendingMessages ────────────────────────────────────────────

  describe('getChatwootPendingMessages', () => {
    it('returns messages stored in the conversation', async () => {
      const storedMessages = [
        { id: '1', content: 'First', messageType: 'outgoing', createdAt: new Date(), sender: null, attachments: [] },
        { id: '2', content: 'Second', messageType: 'outgoing', createdAt: new Date(), sender: null, attachments: [] },
      ]
      fakeCollection.findOne.mockResolvedValue({ chatwootMessages: storedMessages })

      const { getChatwootPendingMessages } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootPendingMessages('123')

      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('First')
      expect(result[1].content).toBe('Second')
    })

    it('returns empty array when no conversation is found', async () => {
      fakeCollection.findOne.mockResolvedValue(null)

      const { getChatwootPendingMessages } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootPendingMessages('999')

      expect(result).toEqual([])
    })

    it('returns empty array when conversation has no chatwootMessages field', async () => {
      fakeCollection.findOne.mockResolvedValue({ _id: 'doc', chatwootMessages: undefined })

      const { getChatwootPendingMessages } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootPendingMessages('123')

      expect(result).toEqual([])
    })

    it('queries by chatwootConversationId with projection', async () => {
      fakeCollection.findOne.mockResolvedValue({ chatwootMessages: [] })

      const { getChatwootPendingMessages } = await import('../lib/chatwoot/message-store')
      await getChatwootPendingMessages('abc-123')

      expect(fakeCollection.findOne).toHaveBeenCalledWith(
        { chatwootConversationId: 'abc-123' },
        expect.objectContaining({ projection: expect.any(Object) }),
      )
    })
  })

  // ─── getChatwootLabelState ─────────────────────────────────────────────────

  describe('getChatwootLabelState', () => {
    it('returns labels and hasHuman=true when humano label is present', async () => {
      fakeCollection.findOne.mockResolvedValue({ chatwootLabels: ['humano', 'vip'] })

      const { getChatwootLabelState } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootLabelState('123')

      expect(result).not.toBeNull()
      expect(result!.labels).toEqual(['humano', 'vip'])
      expect(result!.hasHuman).toBe(true)
    })

    it('returns hasHuman=false when humano label is absent', async () => {
      fakeCollection.findOne.mockResolvedValue({ chatwootLabels: ['vip', 'premium'] })

      const { getChatwootLabelState } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootLabelState('123')

      expect(result!.hasHuman).toBe(false)
    })

    it('returns hasHuman=false and empty labels when chatwootLabels field is missing', async () => {
      fakeCollection.findOne.mockResolvedValue({ _id: 'doc' })

      const { getChatwootLabelState } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootLabelState('123')

      expect(result!.labels).toEqual([])
      expect(result!.hasHuman).toBe(false)
    })

    it('returns null when no conversation is found', async () => {
      fakeCollection.findOne.mockResolvedValue(null)

      const { getChatwootLabelState } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootLabelState('999')

      expect(result).toBeNull()
    })

    it('compares humano label case-insensitively', async () => {
      fakeCollection.findOne.mockResolvedValue({ chatwootLabels: ['HUMANO'] })

      const { getChatwootLabelState } = await import('../lib/chatwoot/message-store')
      const result = await getChatwootLabelState('123')

      expect(result!.hasHuman).toBe(true)
    })
  })
})
