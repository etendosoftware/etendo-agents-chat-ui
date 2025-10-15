import { describe, expect, it } from 'vitest'

import {
  broadcastConversationEvent,
  closeConversationStream,
  registerConversationStream,
} from '../lib/chatwootEvents'

describe('chatwootEvents', () => {
  const decoder = new TextDecoder()

  it('delivers broadcast payloads to connected clients', async () => {
    const stream = registerConversationStream('conv-1')
    const reader = stream.getReader()

    const connectedFrame = await reader.read()
    expect(connectedFrame.done).toBe(false)
    expect(decoder.decode(connectedFrame.value)).toContain('event: connected')

    const listeners = broadcastConversationEvent('conv-1', 'chatwoot_message', { text: 'hello' })
    expect(listeners).toBe(1)

    const messageFrame = await reader.read()
    expect(decoder.decode(messageFrame.value)).toContain('event: chatwoot_message')
    expect(decoder.decode(messageFrame.value)).toContain('"text":"hello"')

    closeConversationStream('conv-1')

    const closedFrame = await reader.read()
    expect(decoder.decode(closedFrame.value)).toContain('event: closed')

    const finalFrame = await reader.read()
    expect(finalFrame.done).toBe(true)
  })
})
