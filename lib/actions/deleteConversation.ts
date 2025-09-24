'use server'

import { connectToDatabase } from '../mongodb';
import { createClient } from '@/lib/supabase/server';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

export async function deleteConversation(conversationId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }

  if (!conversationId) {
    return { success: false, error: 'Conversation ID is required' };
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db.collection('conversations').deleteOne({
      _id: new ObjectId(conversationId),
      email: user.email, // Security check: only allow users to delete their own conversations
    });

    if (result.deletedCount === 0) {
      return { success: false, error: 'Conversation not found or user does not have permission' };
    }

    // Invalidate the cache for the chat layout to ensure the list is fresh on next navigation
    revalidatePath('/chat', 'layout');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    return { success: false, error: 'Database error' };
  }
}
