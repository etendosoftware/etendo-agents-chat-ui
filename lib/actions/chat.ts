
'use server';

import { connectToDatabase } from '../mongodb';
import { ObjectId } from 'mongodb';

export interface Conversation {
  _id: string;
  sessionId: string;
  email: string;
  conversationTitle: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  type: 'human' | 'ai'; // Adjust types as per your actual message structure
  data: {
    content: string;
    // Add other potential message properties if they exist
  };
  // Add other potential message properties if they exist
}

export async function getConversationHistory(
  userEmail: string,
  agentId: string,
  options: {
    searchTerm?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<Conversation[]> {
  try {
    const { searchTerm, page = 1, limit = 10 } = options;
    const { db } = await connectToDatabase();

    const query: any = {
      email: userEmail,
      agentId: agentId,
    };

    if (searchTerm) {
      query.conversationTitle = { $regex: searchTerm, $options: 'i' };
    }

    const conversations = await db
      .collection('conversations')
      .find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Manually convert each document to the Conversation type
    return conversations.map(doc => {
      const firstHumanMessage = doc.messages?.find((msg: any) => msg.type === 'human');
      const title = doc.conversationTitle || 
                    (firstHumanMessage?.data?.content
                      ? firstHumanMessage.data.content.substring(0, 50) + (firstHumanMessage.data.content.length > 50 ? '...' : '')
                      : 'New Chat');

      return {
        _id: doc._id.toHexString(),
        sessionId: doc.sessionId,
        email: doc.email,
        conversationTitle: title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

  } catch (error) {
    console.error('Failed to fetch conversation history:', error);
    return [];
  }
}

export async function getMessagesForConversation(
  conversationId: string,
  userEmail: string,
): Promise<{ messages: Message[]; sessionId: string | null }> {
  try {
    const { db } = await connectToDatabase();
    const conversation = await db
      .collection('conversations')
      .findOne({ _id: new ObjectId(conversationId), email: userEmail });

    if (!conversation) {
      console.warn(`Conversation with ID ${conversationId} not found for user ${userEmail}`);
      return { messages: [], sessionId: null };
    }

    return {
      messages: conversation.messages || [],
      sessionId: conversation.sessionId || null, // CORRECTED: Use sessionId
    };
  } catch (error) {
    console.error(`Failed to fetch messages for conversation ${conversationId}:`, error);
    return { messages: [], sessionId: null };
  }
}
