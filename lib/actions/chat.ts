
'use server';

import { connectToDatabase } from '../mongodb';
import { ObjectId } from 'mongodb';
import { escapeRegExp } from '@/lib/utils/escape-regexp';
import { MONGODB_COLLECTION, DEFAULT_CHAT_TITLE } from '@/lib/constants';

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

export async function getConversationMetadata(
  conversationId: string,
  userEmail: string,
): Promise<{ sessionId: string | null; chatwootConversationId: string | null }> {
  try {
    const { db } = await connectToDatabase();
    const trimmedEmail = userEmail?.trim() ?? '';

    if (!ObjectId.isValid(conversationId)) {
      console.warn(`Invalid ObjectId: ${conversationId}`);
      return { sessionId: null, chatwootConversationId: null };
    }

    const conversation = await db
      .collection(MONGODB_COLLECTION)
      .findOne(
        {
          _id: new ObjectId(conversationId),
          ...(trimmedEmail
            ? {
                email: {
                  $regex: `^${escapeRegExp(trimmedEmail)}$`,
                  $options: 'i',
                },
              }
            : {}),
        },
        {
          projection: {
            sessionId: 1,
            chatwootConversationId: 1,
          },
        },
      );

    if (!conversation) {
      console.warn(`Conversation with ID ${conversationId} not found for user ${userEmail}`);
      return { sessionId: null, chatwootConversationId: null };
    }

    return {
      sessionId: conversation.sessionId || null,
      chatwootConversationId: conversation.chatwootConversationId ?? null,
    };
  } catch (error) {
    console.error(`Failed to fetch metadata for conversation ${conversationId}:`, error);
    return { sessionId: null, chatwootConversationId: null };
  }
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

    const trimmedEmail = userEmail?.trim() ?? '';

    const query: any = {
      agentId: agentId,
    };

    if (trimmedEmail) {
      query.email = {
        $regex: `^${escapeRegExp(trimmedEmail)}$`,
        $options: 'i',
      };
    }

    if (searchTerm) {
      query.conversationTitle = { $regex: escapeRegExp(searchTerm), $options: 'i' };
    }

    const conversations = await db
      .collection(MONGODB_COLLECTION)
      .find(query, {
        projection: {
          _id: 1,
          sessionId: 1,
          email: 1,
          conversationTitle: 1,
          createdAt: 1,
          updatedAt: 1,
          agentId: 1,
          messages: { $slice: 3 },
        },
      })
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
                      : DEFAULT_CHAT_TITLE);

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
): Promise<{ messages: Message[]; sessionId: string | null; chatwootConversationId: string | null }> {
  try {
    const { db } = await connectToDatabase();
    const trimmedEmail = userEmail?.trim() ?? '';

    if (!ObjectId.isValid(conversationId)) {
      console.warn(`Invalid ObjectId: ${conversationId}`);
      return { messages: [], sessionId: null, chatwootConversationId: null };
    }

    const conversation = await db
      .collection(MONGODB_COLLECTION)
      .findOne(
        {
          _id: new ObjectId(conversationId),
          ...(trimmedEmail
            ? {
                email: {
                  $regex: `^${escapeRegExp(trimmedEmail)}$`,
                  $options: 'i',
                },
              }
            : {}),
        },
        {
          projection: { messages: 1, sessionId: 1, chatwootConversationId: 1 },
        },
      );

    if (!conversation) {
      console.warn(`Conversation with ID ${conversationId} not found for user ${userEmail}`);
      return { messages: [], sessionId: null, chatwootConversationId: null };
    }

    return {
      messages: conversation.messages || [],
      sessionId: conversation.sessionId || null, // CORRECTED: Use sessionId
      chatwootConversationId: conversation.chatwootConversationId ?? null,
    };
  } catch (error) {
    console.error(`Failed to fetch messages for conversation ${conversationId}:`, error);
    return { messages: [], sessionId: null, chatwootConversationId: null };
  }
}
