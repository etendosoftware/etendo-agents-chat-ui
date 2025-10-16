const encoder = new TextEncoder()

type SSEClient = {
  controller: ReadableStreamDefaultController<Uint8Array>
  keepAlive: NodeJS.Timeout
}

const conversationClients = new Map<string, Set<SSEClient>>()

function formatEvent(event: string, data: unknown) {
  const payload = JSON.stringify(data ?? {})
  return encoder.encode(`event: ${event}\ndata: ${payload}\n\n`)
}

function removeClient(conversationId: string, client: SSEClient) {
  const clients = conversationClients.get(conversationId)
  if (!clients) {
    return
  }

  clients.delete(client)

  if (clients.size === 0) {
    conversationClients.delete(conversationId)
  }
}

export function registerConversationStream(conversationId: string) {
  let currentClient: SSEClient | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(formatEvent("ping", { ts: Date.now() }))
        } catch (error) {
          console.error("[chatwoot] SSE ping error", error)
        }
      }, 25000)

      currentClient = { controller, keepAlive }
      const clients = conversationClients.get(conversationId) ?? new Set<SSEClient>()
      clients.add(currentClient)
      conversationClients.set(conversationId, clients)

      controller.enqueue(
        formatEvent("connected", {
          conversationId,
          clients: clients.size,
        }),
      )
    },
    cancel() {
      if (!currentClient) {
        return
      }

      clearInterval(currentClient.keepAlive)
      removeClient(conversationId, currentClient)
      currentClient = null
    },
  })

  return stream
}

export function broadcastConversationEvent(
  conversationId: string,
  event: string,
  payload: unknown,
) {
  const clients = conversationClients.get(conversationId)
  if (!clients || clients.size === 0) {
    return 0
  }

  const frame = formatEvent(event, payload)
  const staleClients: SSEClient[] = []

  clients.forEach((client) => {
    try {
      client.controller.enqueue(frame)
    } catch (error) {
      console.error("[chatwoot] SSE broadcast error", error)
      staleClients.push(client)
    }
  })

  if (staleClients.length > 0) {
    staleClients.forEach((client) => {
      clearInterval(client.keepAlive)
      removeClient(conversationId, client)
    })
  }

  return clients.size
}

export function closeConversationStream(conversationId: string) {
  const clients = conversationClients.get(conversationId)
  if (!clients) {
    return
  }

  clients.forEach((client) => {
    try {
      client.controller.enqueue(formatEvent("closed", { conversationId }))
      client.controller.close()
    } catch (error) {
      console.error("[chatwoot] SSE close error", error)
    } finally {
      clearInterval(client.keepAlive)
    }
  })

  conversationClients.delete(conversationId)
}
