import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN

export async function GET(request: NextRequest) {
  try {
    if (!CHATWOOT_BASE_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_API_TOKEN) {
      return NextResponse.json(
        {
          error: "Faltan credenciales de Chatwoot",
        },
        { status: 500 },
      )
    }

    const conversationId = request.nextUrl.searchParams.get("conversationId")

    if (!conversationId) {
      return NextResponse.json(
        {
          error: "conversationId es requerido",
        },
        { status: 400 },
      )
    }

    const chatwootBase = CHATWOOT_BASE_URL.replace(/\/$/, "")
    const messagesUrl = `${chatwootBase}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`

    const response = await fetch(messagesUrl, {
      headers: {
        "Content-Type": "application/json",
        "api_access_token": CHATWOOT_API_TOKEN,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[chatwoot] Error al obtener mensajes:", errorText)
      return NextResponse.json(
        {
          error: `Error de Chatwoot: ${response.status} ${response.statusText}`,
          details: errorText,
        },
        { status: response.status },
      )
    }

    const data = await response.json().catch(() => null)

    let messages: unknown[] = []

    if (Array.isArray(data?.messages)) {
      messages = data.messages
    } else if (Array.isArray(data?.payload?.messages)) {
      messages = data.payload.messages
    } else if (Array.isArray(data?.payload)) {
      messages = data.payload
    } else if (Array.isArray(data?.data)) {
      messages = data.data
    }

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("[chatwoot] Error interno al obtener mensajes:", error)
    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 },
    )
  }
}
