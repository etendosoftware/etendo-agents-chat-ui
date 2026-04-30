import { NextRequest, NextResponse } from "next/server"
import { getChatwootPendingMessages, getChatwootLabelState } from "@/lib/chatwoot/message-store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId")
  if (!conversationId) {
    return new NextResponse("conversationId es requerido", { status: 400 })
  }

  try {
    const [messages, labelState] = await Promise.all([
      getChatwootPendingMessages(conversationId),
      getChatwootLabelState(conversationId),
    ])

    return NextResponse.json({ messages, labelState })
  } catch (error) {
    console.error("[chatwoot] Error en poll", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
