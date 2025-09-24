import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const webhookUrl = formData.get("webhookUrl") as string
    const message = formData.get("message") as string
    const agentId = formData.get("agentId") as string
    const sessionId = formData.get("sessionId") as string
    const userEmail = formData.get("userEmail") as string
    const videoAnalysis = formData.get("videoAnalysis") as string
    
    if (!webhookUrl) {
      return NextResponse.json({ error: "URL del webhook es requerida" }, { status: 400 })
    }

    const n8nFormData = new FormData()
    n8nFormData.append("message", message)
    n8nFormData.append("agentId", agentId)
    n8nFormData.append("sessionId", sessionId)
    n8nFormData.append("userEmail", userEmail || "")
    
    // Añadir el flag de videoAnalysis si está presente
    if (videoAnalysis === "true") {
      n8nFormData.append("videoAnalysis", "true")
    }

    const entries = Array.from(formData.entries())
    for (const [key, value] of entries) {
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
      // Return a new response that streams the body from the n8n webhook
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else {
      // Fallback for non-streaming responses or errors
      return NextResponse.json({ output: "No stream available from webhook." }, { status: 500 });
    }
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