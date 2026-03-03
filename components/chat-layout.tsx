
'use client'

import { useEffect } from 'react';
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { SidebarConversations } from '@/components/conversation-history-content';
import ChatInterface, { Agent, AgentPromptSuggestion } from '@/components/chat-interface';
import { User } from '@supabase/supabase-js';
import { Conversation } from '@/lib/actions/chat';
import { GlobalHeader } from './global-header';
import { useChatContext } from '@/lib/chat-context';
import type { FetchMessagesResult } from '@/lib/actions/fetchMessages';

interface ChatLayoutProps {
  agent: Agent;
  user: User | null;
  initialConversationId?: string;
  initialMessages: any[];
  initialSessionId: string | null;
  initialChatwootConversationId?: string | null;
  initialConversations?: Conversation[];
  agentPath: string;
  userRole: string | null;
  initialPrompts?: AgentPromptSuggestion[];
}

export default function ChatLayout({
  agent,
  user,
  initialConversationId,
  initialMessages,
  initialSessionId,
  initialChatwootConversationId,
  initialConversations,
  agentPath,
  userRole,
  initialPrompts = [],
}: ChatLayoutProps) {
  const { conversationId } = useChatContext();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.gtag) {
      return;
    }

    window.gtag('event', 'agent_view', {
      agent_id: agent.id,
      agent_path: agent.path,
      agent_access_level: agent.access_level,
      user_role: userRole ?? (user ? 'unknown' : 'guest'),
      has_conversation: Boolean(conversationId),
    });
  }, [agent.id, agent.path, agent.access_level, userRole, user?.id, conversationId]);

  // Build initialData for the messages query seed
  const initialMessageData: FetchMessagesResult | undefined =
    initialConversationId && initialMessages.length > 0
      ? {
          messages: initialMessages,
          sessionId: initialSessionId,
          chatwootConversationId: initialChatwootConversationId ?? null,
        }
      : undefined;

  const isUserLoggedIn = !!user;

  if (!isUserLoggedIn) {
    return (
      <div className="flex flex-col h-screen">
        <GlobalHeader
          user={user}
          userRole={userRole}
          agent={agent}
        />
        <main className="flex flex-1 overflow-hidden">
          <ChatInterface
            agent={agent}
            user={user}
            agentPath={agentPath}
            initialConversationId={initialConversationId}
            initialMessageData={initialMessageData}
            initialSessionId={initialSessionId}
            initialChatwootConversationId={initialChatwootConversationId}
            initialPrompts={initialPrompts}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <GlobalHeader
        user={user}
        userRole={userRole}
        initialConversations={initialConversations}
        agentPath={agentPath}
        activeConversationId={conversationId}
        agentId={agent.id}
        agent={agent}
      />
      <div className="flex flex-1 overflow-hidden">
        <SidebarProvider>
          {/* Desktop Sidebar - hidden on mobile */}
          <div className="hidden md:block">
            <Sidebar>
              <SidebarConversations
                initialConversations={initialConversations}
                agentPath={agentPath}
                activeConversationId={conversationId}
                agentId={agent.id}
                chatwootInboxIdentifier={agent.chatwoot_inbox_identifier}
              />
            </Sidebar>
          </div>
          {/* Main Content */}
          <SidebarInset>
            <ChatInterface
              agent={agent}
              user={user}
              agentPath={agentPath}
              initialConversationId={initialConversationId}
              initialMessageData={initialMessageData}
              initialSessionId={initialSessionId}
              initialChatwootConversationId={initialChatwootConversationId}
              initialPrompts={initialPrompts}
            />
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}
