import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

const CHATWOOT_WEBHOOK_TOKEN = process.env.CHATWOOT_WEBHOOK_TOKEN

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function timingSafeEqual(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

function computeSignature(payload: string) {
  if (!CHATWOOT_WEBHOOK_TOKEN) {
    return null
  }

  return crypto
    .createHmac("sha256", CHATWOOT_WEBHOOK_TOKEN)
    .update(payload)
    .digest("hex")
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-chatwoot-signature") ?? ""

    if (CHATWOOT_WEBHOOK_TOKEN) {
      if (!signature) {
        console.warn("[chatwoot] Webhook sin firma")
        return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
      }

      const digest = computeSignature(rawBody)
      if (!digest || !timingSafeEqual(digest, signature)) {
        return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
      }
    }

    if (!rawBody) {
      return NextResponse.json({ ok: true })
    }

    const payload = JSON.parse(rawBody)
    console.info("[chatwoot] Webhook recibido", payload?.event ?? payload?.event_name ?? payload?.type)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[chatwoot] Error procesando webhook", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
