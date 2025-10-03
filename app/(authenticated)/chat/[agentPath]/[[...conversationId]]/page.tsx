import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getConversationHistory, getMessagesForConversation } from '@/lib/actions/chat';
import { canUserAccessAgent } from '@/lib/agents/access';
import ChatLayout from '@/components/chat-layout';
import { Agent } from '@/components/chat-interface';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { agentPath: string } }): Promise<Metadata> {
    try {
        const supabaseClient = createClient();
        const { data: agent } = await supabaseClient
            .from('agents')
            .select('name, description, path')
            .eq('path', `/${params.agentPath}`)
            .maybeSingle();

        if (!agent) {
            return {
                title: 'Chat | Etendo Agents',
                description: 'Interact with Etendo AI agents.',
            };
        }

        return {
            title: `${agent.name} | Etendo Agents`,
            description: agent.description ?? 'Interact with an Etendo AI agent.',
            openGraph: {
                title: `${agent.name} | Etendo Agents`,
                description: agent.description ?? 'Interact with an Etendo AI agent.',
                url: `/chat/${params.agentPath}`,
            },
        };
    } catch (error) {
        console.error('Failed to generate metadata for agent:', error);
        return {
            title: 'Chat | Etendo Agents',
            description: 'Interact with Etendo AI agents.',
        };
    }
}

async function getUserRole(supabaseClient: any, userId: string) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        return null;
    }
    return profile.role as 'admin' | 'partner' | 'non_client';
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

    const isAuthenticated = Boolean(user);
    if (!canUserAccessAgent({ accessLevel: agent.access_level, userRole, isAuthenticated })) {
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
