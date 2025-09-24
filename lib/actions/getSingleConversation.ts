'use server';

import { createClient } from '@/lib/supabase/server';
import { connectToDatabase } from '../mongodb';
import { ObjectId } from 'mongodb';
import { Conversation } from './chat';

export async function getSingleConversation(conversationId: string): Promise<Conversation | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const { db } = await connectToDatabase();
    const conversation = await db.collection('conversations').findOne({
      _id: new ObjectId(conversationId),
      email: user.email,
    });

    if (!conversation) {
      return null;
    }

    // Manually convert the document to the Conversation type
    const firstHumanMessage = conversation.messages?.find((msg: any) => msg.type === 'human');
    const title = conversation.conversationTitle || 
                  (firstHumanMessage?.data?.content
                    ? firstHumanMessage.data.content.substring(0, 50) + (firstHumanMessage.data.content.length > 50 ? '...' : '')
                    : 'New Chat');

    return {
      _id: conversation._id.toHexString(),
      sessionId: conversation.sessionId,
      email: conversation.email,
      conversationTitle: title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

  } catch (error) {
    console.error('Failed to fetch single conversation:', error);
    return null;
  }
}
