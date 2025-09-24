'use server'

import { createClient } from "@/lib/supabase/server"

interface FeedbackData {
  messageId: string | null
  conversationId: string
  agentId: string
  rating: "good" | "bad"
  feedbackText?: string
}

export async function submitFeedback(data: FeedbackData) {
  const supabase = createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { error: "User not authenticated" }
  }

  const { messageId, conversationId, agentId, rating, feedbackText } = data

  const { error } = await supabase.from("feedback").insert([
    {
      message_id: messageId,
      conversation_id: conversationId,
      agent_id: agentId,
      rating: rating,
      feedback_text: feedbackText,
      user_id: userData.user.id,
    },
  ])

  if (error) {
    console.error("Error inserting feedback:", error)
    return { error: "Failed to submit feedback" }
  }

  return { success: true }
}
