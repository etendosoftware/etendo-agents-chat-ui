import { NextRequest, NextResponse } from "next/server"

const EMAIL_VALIDATOR_URL = "https://rapid-email-verifier.fly.dev/api/validate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null)
    const email = typeof payload?.email === "string" ? payload.email.trim() : ""

    if (!email) {
      return NextResponse.json(
        { error: "email es requerido" },
        { status: 400 },
      )
    }

    const url = `${EMAIL_VALIDATOR_URL}?email=${encodeURIComponent(email)}`
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.error("[email-validation] Error del proveedor:", response.status, errorText)
      return NextResponse.json(
        {
          error: "validation_failed",
          message: `Proveedor respondió ${response.status}`,
          details: errorText,
        },
        { status: 502 },
      )
    }

    const data = await response.json().catch(() => null)

    if (!data || typeof data !== "object") {
      return NextResponse.json(
        {
          error: "invalid_response",
          message: "Proveedor devolvió una respuesta inválida",
        },
        { status: 502 },
      )
    }

    return NextResponse.json({ status: data.status, provider: data })
  } catch (error) {
    console.error("[email-validation] Error interno", error)
    return NextResponse.json(
      {
        error: "internal_error",
        message: "No se pudo validar el email",
      },
      { status: 500 },
    )
  }
}
