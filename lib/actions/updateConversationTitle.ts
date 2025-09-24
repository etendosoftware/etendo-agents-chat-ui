'use server'

import { connectToDatabase } from '../mongodb';
import { createClient } from '@/lib/supabase/server';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

export async function updateConversationTitle(
    conversationId: string, 
    newTitle: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }

  if (!conversationId || !newTitle || newTitle.trim() === '') {
    return { success: false, error: 'Conversation ID and a non-empty title are required' };
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db.collection('conversations').updateOne(
      {
        _id: new ObjectId(conversationId),
        email: user.email, // Security check
      },
      {
        $set: {
          conversationTitle: newTitle.trim(),
          updatedAt: new Date(), // Also update the updatedAt timestamp
        },
      }
    );

    if (result.matchedCount === 0) {
      return { success: false, error: 'Conversation not found or user does not have permission' };
    }

    revalidatePath('/chat', 'layout');

    return { success: true };
  } catch (error) {
    console.error('Failed to update conversation title:', error);
    return { success: false, error: 'Database error' };
  }
}
