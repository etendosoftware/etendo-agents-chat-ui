import { cookies } from 'next/headers';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getConversationHistory, getMessagesForConversation } from '@/lib/actions/chat';
import ChatLayout from '@/components/chat-layout';
import { Agent } from '@/components/chat-interface';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

async function getUserRole(supabaseClient: any, userId: string) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        return null;
    }
    return profile.role as 'admin' | 'partner';
}

export default async function ChatPage({ params }: { params: { agentPath: string, conversationId?: string[] } }) {
    const supabaseClient = createClient();
    let conversationId = params.conversationId?.[0];

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!conversationId && !user) {
        conversationId = randomUUID();
    }

    const { data: agent, error: agentError } = await supabaseClient
        .from('agents')
        .select('*')
        .eq('path', `/${params.agentPath}`)
        .single();

    if (agentError || !agent) {
        return <div className="p-4">Agent not found </div>;
    }

    const userRole = user ? await getUserRole(supabaseClient, user.id) : null;

    const hasAccess = () => {
        if (agent.access_level === 'public') {
            return !user;
        }
        if (agent.access_level === 'non_client') {
            return !!user && (userRole === 'non_client' || userRole === 'admin');
        }
        if (agent.access_level === 'partner') {
            return userRole === 'partner' || userRole === 'admin';
        }
        if (agent.access_level === 'admin') {
            return userRole === 'admin';
        }
        return false;
    };

    if (!hasAccess()) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
                <p>You do not have permission to access this agent.</p>
            </div>
        );
    }
    const initialConversations = user ? await getConversationHistory(user.email!, agent.id, { limit: 10 }) : [];

    let initialMessages: any[] = [];
    let sessionId: string | null = null;

    if (conversationId && user) {
        const conversationData = await getMessagesForConversation(conversationId, user.email!);
        initialMessages = conversationData.messages;
        sessionId = conversationData.sessionId;
    }

    const transformedMessages = initialMessages.map((message, index) => ({
      id: `${conversationId}-${index}`,
      content: message.data.content,
      sender: message.type === 'human' ? "user" as const : "agent" as const,
      timestamp: new Date(),
      agentId: agent.id,
      conversationId: conversationId,
    }));


    return (
        <ChatLayout
            agent={agent as Agent}
            user={user}
            conversationId={conversationId}
            initialMessages={transformedMessages}
            initialSessionId={sessionId}
            initialConversations={initialConversations}
            agentPath={params.agentPath}
            userRole={userRole}
        />
    );
}
