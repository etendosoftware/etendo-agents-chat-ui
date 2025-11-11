import { NextRequest } from "next/server"
import { registerConversationStream } from "@/lib/chatwootEvents"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId")

  if (!conversationId) {
    return new Response("conversationId es requerido", { status: 400 })
  }

  const stream = registerConversationStream(conversationId)

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
