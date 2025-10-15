import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { upsertChatwootConversation } from "@/lib/actions/chatwoot-conversations"

const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN

const inboxIdCache = new Map<string, number>()
const conversationCache = new Map<string, string>()

function appendAttachments(target: FormData, files: File[]) {
  files.forEach((file, index) => {
    const name = file?.name && file.name.trim() ? file.name : `attachment-${index + 1}`
    target.append("attachments[]", file, name)
  })
}

async function resolveChatwootInboxId(inboxIdentifier: string) {
  if (!CHATWOOT_BASE_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_TOKEN) {
    return null
  }

  if (inboxIdCache.has(inboxIdentifier)) {
    return inboxIdCache.get(inboxIdentifier) ?? null
  }

  const inboxUrl = `${CHATWOOT_BASE_URL.replace(/\/$/, "")}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`
  const response = await fetch(inboxUrl, {
    headers: {
      "Content-Type": "application/json",
      "api_access_token": CHATWOOT_API_TOKEN,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[chatwoot] No se pudo obtener la lista de inboxes:", errorText)
    return null
  }

  const data = await response.json().catch(() => null)

  let inboxes: any[] | null = null
  if (Array.isArray(data)) {
    inboxes = data
  } else if (Array.isArray(data?.payload)) {
    inboxes = data.payload
  } else if (Array.isArray(data?.data)) {
    inboxes = data.data
  }

  if (!inboxes) {
    console.error('[chatwoot] No se pudo parsear la lista de inboxes')
    return null
  }

  const inbox = inboxes.find(
    (item: any) => (item?.inbox_identifier ?? item?.identifier) === inboxIdentifier,
  )

  if (!inbox) {
    console.error(
      `[chatwoot] Inbox con identifier ${inboxIdentifier} no encontrado en la cuenta ${CHATWOOT_ACCOUNT_ID}`,
    )
    console.error('[chatwoot] Identifiers disponibles:', inboxes.map((i: any) => i?.inbox_identifier ?? i?.identifier))
    return null
  }

  const inboxNumericId = inbox.id ?? inbox.inbox_id
  inboxIdCache.set(inboxIdentifier, inboxNumericId)
  return inboxNumericId as number
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const message = formData.get("message") as string
    const agentId = formData.get("agentId") as string
    const sessionId = formData.get("sessionId") as string
    const userEmail = formData.get("userEmail") as string
    const videoAnalysis = formData.get("videoAnalysis") as string
    const rawConversationId = formData.get("conversationId")
    const conversationId = typeof rawConversationId === "string" ? rawConversationId.trim() || null : null
    const displayName = formData.get("userName") as string | null

    if (!agentId) {
      return NextResponse.json({ error: "El agente es requerido" }, { status: 400 })
    }

    const supabase = createClient()
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("webhookurl, path, chatwoot_inbox_identifier, requires_email")
      .eq("id", agentId)
      .maybeSingle()

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 })
    }

    const isChatwootAgent = Boolean(agent.chatwoot_inbox_identifier)

    if (isChatwootAgent) {
      if (!CHATWOOT_BASE_URL) {
        return NextResponse.json({ error: "CHATWOOT_BASE_URL no está configurado" }, { status: 500 })
      }

      const normalizedEmail = userEmail?.trim() ?? ""
      const normalizedSessionId = sessionId?.trim() ?? ""

      const uniqueSourceId = normalizedEmail || normalizedSessionId || `random::${randomUUID()}`

      if (!uniqueSourceId) {
        return NextResponse.json({ error: "No hay identificador para la conversación" }, { status: 400 })
      }

      const chatwootBase = CHATWOOT_BASE_URL.replace(/\/$/, "")
      const inboxIdentifier = agent.chatwoot_inbox_identifier!
      const contactUrl = `${chatwootBase}/public/api/v1/inboxes/${inboxIdentifier}/contacts`
      const messageUrl = `${chatwootBase}/public/api/v1/inboxes/${inboxIdentifier}/messages`
      const contactPayload = {
        source_id: uniqueSourceId,
        name: (displayName && displayName.trim()) || normalizedEmail || normalizedSessionId || uniqueSourceId,
        email: normalizedEmail || undefined,
        identifier: normalizedEmail || undefined,
        custom_attributes: {
          agentId,
          sessionId,
          conversationId: conversationId || undefined,
        },
      }

      const contactResponse = await fetch(contactUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(contactPayload),
      })

      if (!contactResponse.ok) {
        const errorText = await contactResponse.text()
        console.error("[chatwoot] Error al crear/actualizar contacto:", errorText)
        return NextResponse.json(
          {
            error: `Error de Chatwoot: ${contactResponse.status} ${contactResponse.statusText}`,
            details: errorText,
          },
          { status: contactResponse.status },
        )
      }

      const contactData = await contactResponse.json().catch(() => null)

      let chatwootConversationId: string | null = null
      const cacheKey = `${inboxIdentifier}:${uniqueSourceId}`
      let chatwootForwarded = false
      const fileAttachments: File[] = []
      let audioAttachment: File | null = null

      for (const [key, value] of formData.entries()) {
        if (!(value instanceof File)) {
          continue
        }

        if (key === "audio") {
          audioAttachment = value
          continue
        }

        if (key.startsWith("file_")) {
          fileAttachments.push(value)
        }
      }

      const chatwootAttachments = [...fileAttachments]
      if (audioAttachment) {
        chatwootAttachments.push(audioAttachment)
      }

      if (conversationId) {
        chatwootConversationId = conversationId
        const success = await forwardMessageToConversation({
          conversationId,
          message,
          chatwootBase,
          attachments: chatwootAttachments,
        })

        if (!success) {
          return NextResponse.json(
            {
              error: "No se pudo enviar el mensaje a la conversación existente en Chatwoot.",
              details: "La conversación podría estar cerrada o el ID podría ser inválido.",
            },
            { status: 500 },
          )
        }

        chatwootForwarded = true
        conversationCache.set(cacheKey, conversationId)
      } else {
        const cachedConversation = conversationCache.get(cacheKey)
        if (cachedConversation) {
          chatwootForwarded = await forwardMessageToConversation({
            conversationId: cachedConversation,
            message,
            chatwootBase,
            attachments: chatwootAttachments,
          })
          if (chatwootForwarded) {
            chatwootConversationId = cachedConversation
            conversationCache.set(cacheKey, cachedConversation)
          }
        }

        if (!chatwootForwarded) {
          const hasBinaryAttachments = chatwootAttachments.length > 0
          let messageResponse: Response

          if (hasBinaryAttachments) {
            const multipartBody = new FormData()
            multipartBody.append("source_id", uniqueSourceId)
            multipartBody.append("message_type", "incoming")
            multipartBody.append("inbox_identifier", inboxIdentifier)
            if (message) {
              multipartBody.append("content", message)
            }
            appendAttachments(multipartBody, chatwootAttachments)

            messageResponse = await fetch(messageUrl, {
              method: "POST",
              body: multipartBody,
            })
          } else {
            const chatwootMessagePayload = {
              source_id: uniqueSourceId,
              content: message,
              content_type: "text",
              message_type: "incoming",
              inbox_identifier: inboxIdentifier,
            }

            messageResponse = await fetch(messageUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(chatwootMessagePayload),
            })
          }

          if (messageResponse.ok) {
            const chatwootData = await messageResponse.json().catch(() => null)
            const conversationFromPublic = chatwootData?.conversation_id ?? chatwootData?.id
            if (conversationFromPublic) {
              conversationCache.set(cacheKey, `${conversationFromPublic}`)
              chatwootConversationId = `${conversationFromPublic}`
            }
            chatwootForwarded = true
          } else if (messageResponse.status === 404 || messageResponse.status === 422) {
            console.warn("[chatwoot] No conversation found, intentando crear una nueva conversación con API privada")

            if (!CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_TOKEN) {
              return NextResponse.json(
                {
                  error: "El mensaje no pudo enviarse a Chatwoot porque no se encontró una conversación activa y no hay credenciales API configuradas.",
                  details: "Define CHATWOOT_ACCOUNT_ID y CHATWOOT_API_TOKEN para crear la conversación automáticamente.",
                },
                { status: 500 },
              )
            }

            const resolvedInboxId = await resolveChatwootInboxId(inboxIdentifier)
            if (!resolvedInboxId) {
              return NextResponse.json(
                {
                  error: "No fue posible obtener el inbox numérico en Chatwoot",
                  details: "Verifica que el identificador coincida con el inbox de tipo API y que las credenciales sean correctas.",
                },
                { status: 500 },
              )
            }

            if (!contactData?.id) {
              return NextResponse.json(
                {
                  error: "No se pudo obtener el ID del contacto para crear la conversación",
                },
                { status: 500 },
              )
            }

            const privateConversationUrl = `${chatwootBase}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`
            const privateConversationPayload = {
              source_id: uniqueSourceId,
              inbox_id: resolvedInboxId,
              contact_id: contactData.id,
              status: "open",
              additional_attributes: {
                agentId,
                sessionId,
                conversationHint: conversationId || undefined,
              },
            }

            const privateConversationResponse = await fetch(privateConversationUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "api_access_token": CHATWOOT_API_TOKEN,
              },
              body: JSON.stringify(privateConversationPayload),
            })

            if (!privateConversationResponse.ok) {
              const privateConversationError = await privateConversationResponse.text()
              console.error("[chatwoot] Error al crear conversación (API privada):", privateConversationError)
              return NextResponse.json(
                {
                  error: `Error de Chatwoot: ${privateConversationResponse.status} ${privateConversationResponse.statusText}`,
                  details: privateConversationError,
                },
                { status: privateConversationResponse.status },
              )
            }

            const privateConversationData = await privateConversationResponse.json().catch(() => null)
            const newConversationId = privateConversationData?.id

            if (!newConversationId) {
              return NextResponse.json(
                {
                  error: "No se pudo determinar el ID de conversación creado en Chatwoot",
                },
                { status: 500 },
              )
            }

           conversationCache.set(cacheKey, `${newConversationId}`)
           const success = await forwardMessageToConversation({
              conversationId: `${newConversationId}`,
              message,
              chatwootBase,
              attachments: chatwootAttachments,
            })

            if (success) {
              chatwootForwarded = true
              chatwootConversationId = `${newConversationId}`
            }
          } else {
            const errorText = await messageResponse.text()
            console.error("[chatwoot] Error al registrar mensaje:", errorText)
            return NextResponse.json(
              {
                error: `Error de Chatwoot: ${messageResponse.status} ${messageResponse.statusText}`,
                details: errorText,
              },
              { status: messageResponse.status },
            )
          }
        }
      }

      if (!chatwootForwarded) {
        return NextResponse.json(
          {
            error: "No se pudo registrar el mensaje en Chatwoot",
          },
          { status: 500 },
        )
      }

      const conversationForResponse = chatwootConversationId ?? conversationId ?? null
      const ackPayload = {
        forwarded: true,
        conversationId: conversationForResponse,
      }

      if (userEmail && conversationForResponse) {
        try {
          await upsertChatwootConversation({
            email: normalizedEmail || userEmail,
            agentId,
            chatwootConversationId: conversationForResponse,
            sessionId: sessionId || null,
          })
        } catch (error) {
          console.error("[chatwoot] Error guardando conversación", error)
        }
      }

      const jsonResponse = NextResponse.json(ackPayload, { status: 200 })
      jsonResponse.headers.set("x-agent-integration", "chatwoot")
      if (conversationForResponse) {
        jsonResponse.headers.set("x-chatwoot-conversation", conversationForResponse)
      }

      return jsonResponse
    }

    const webhookUrlFromBody = formData.get("webhookUrl") as string | null

    const webhookUrl = (agent.webhookurl ?? webhookUrlFromBody ?? "").trim()

    if (!webhookUrl) {
      return NextResponse.json({ error: "URL del webhook es requerida" }, { status: 400 })
    }

    const n8nFormData = new FormData()
    n8nFormData.append("message", message)
    n8nFormData.append("agentId", agentId)
    n8nFormData.append("sessionId", sessionId)
    n8nFormData.append("userEmail", userEmail || "")
    if (conversationId) {
      n8nFormData.append("conversationId", conversationId)
    }

    if (videoAnalysis === "true") {
      n8nFormData.append("videoAnalysis", "true")
    }

    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file_") && value instanceof File) {
        n8nFormData.append(key, value)
      }
      if (key === "audio" && value instanceof File) {
        n8nFormData.append("audio", value)
      }
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      body: n8nFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] API Proxy - Error de n8n:", errorText)
      return NextResponse.json(
        {
          error: `Error del webhook: ${response.status} ${response.statusText}`,
          details: errorText,
        },
        { status: response.status },
      )
    }

    if (response.body) {
      const headers = new Headers(response.headers)
      headers.set("x-agent-integration", "n8n")

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    return NextResponse.json({ output: "No stream available from webhook." }, { status: 500 })
  } catch (error) {
    console.error("[v0] API Proxy - Error:", error)
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    )
  }
}

async function forwardMessageToConversation({
  conversationId,
  message,
  chatwootBase,
  attachments,
}: {
  conversationId: string
  message: string
  chatwootBase: string
  attachments: File[]
}) {
  if (!CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_TOKEN) {
    return false
  }

  const privateMessageUrl = `${chatwootBase}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`
  const hasAttachments = attachments.length > 0

  let privateMessageResponse: Response

  if (hasAttachments) {
    const multipartBody = new FormData()
    if (message) {
      multipartBody.append("content", message)
    }
    multipartBody.append("message_type", "incoming")
    multipartBody.append("content_type", "text")
    appendAttachments(multipartBody, attachments)

    privateMessageResponse = await fetch(privateMessageUrl, {
      method: "POST",
      headers: {
        "api_access_token": CHATWOOT_API_TOKEN,
      },
      body: multipartBody,
    })
  } else {
    const privateMessagePayload = {
      content: message,
      message_type: "incoming",
      content_type: "text",
    }

    privateMessageResponse = await fetch(privateMessageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_access_token": CHATWOOT_API_TOKEN,
      },
      body: JSON.stringify(privateMessagePayload),
    })
  }

  if (!privateMessageResponse.ok) {
    const privateMessageError = await privateMessageResponse.text()
    console.error("[chatwoot] Error al crear mensaje (API privada):", privateMessageError)
    return false
  }

  await privateMessageResponse.json().catch(() => null)
  return true
}
