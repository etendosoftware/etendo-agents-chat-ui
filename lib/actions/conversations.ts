'use server'

import { createClient } from '@/lib/supabase/server'
import { getConversationHistory as getHistory } from './chat'

// This server action is specifically designed to be called from client components
// to fetch paginated and searchable conversation data.
export async function fetchConversations(
  agentId: string, 
  options: { searchTerm?: string; page?: number; limit?: number; } = {}
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Return an empty array or an object indicating no more pages
    // depending on how the client will handle it.
    return [];
  }

  const conversations = await getHistory(user.email!, agentId, options);
  return conversations;
}
