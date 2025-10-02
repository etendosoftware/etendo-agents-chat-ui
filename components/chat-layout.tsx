
'use client'

import { useEffect } from 'react';
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { SidebarConversations } from '@/components/conversation-history-content';
import ChatInterface, { Agent } from '@/components/chat-interface';
import { User } from '@supabase/supabase-js';
import { Conversation } from '@/lib/actions/chat';
import { GlobalHeader } from './global-header';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

interface ChatLayoutProps {
  agent: Agent;
  user: User | null;
  conversationId?: string;
  initialMessages: any[];
  initialSessionId: string | null;
  initialConversations: Conversation[];
  agentPath: string;
  userRole: string | null;
}

export default function ChatLayout({ 
  agent, 
  user, 
  conversationId, 
  initialMessages, 
  initialSessionId, 
  initialConversations, 
  agentPath, 
  userRole 
}: ChatLayoutProps) {
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
            conversationId={conversationId}
            initialMessages={initialMessages}
            initialSessionId={initialSessionId}
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
              />
            </Sidebar>
          </div>
          {/* Main Content */}
          <SidebarInset>
            <ChatInterface
              agent={agent}
              user={user}
              conversationId={conversationId}
              initialMessages={initialMessages}
              initialSessionId={initialSessionId}
            />
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}
