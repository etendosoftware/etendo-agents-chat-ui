import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getConversationHistory, getMessagesForConversation } from '@/lib/actions/chat';
import { canUserAccessAgent } from '@/lib/agents/access';
import ChatLayout from '@/components/chat-layout';
import { Agent } from '@/components/chat-interface';
import { randomUUID } from 'crypto';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { defaultLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { locale: string; agentPath: string } }): Promise<Metadata> {
    const t = await getTranslations('chat');
    try {
        const supabaseClient = createClient();
        const { data: agent } = await supabaseClient
            .from('agents')
            .select('id, name, description, path')
            .eq('path', `/${params.agentPath}`)
            .maybeSingle();

        if (!agent) {
            return {
                title: t('metadata.title'),
                description: t('metadata.description'),
            };
        }

        const { data: translation } = await supabaseClient
            .from('agent_translations')
            .select('name, description')
            .eq('agent_id', agent.id)
            .eq('locale', params.locale)
            .maybeSingle();

        const localizedName = translation?.name ?? agent.name;
        const localizedDescription = translation?.description ?? agent.description ?? t('metadata.agentDescription');

        return {
            title: t('metadata.agentTitle', { agentName: localizedName }),
            description: localizedDescription,
            openGraph: {
                title: t('metadata.agentTitle', { agentName: localizedName }),
                description: localizedDescription,
                url: `/${params.locale}/chat/${params.agentPath}`,
            },
        };
    } catch (error) {
        console.error(t('metadata.failed'), error);
        return {
            title: t('metadata.title'),
            description: t('metadata.description'),
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

export default async function ChatPage({ params }: { params: { locale: string; agentPath: string; conversationId?: string[] } }) {
    const t = await getTranslations('chat');
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
        return <div className="p-4">{t('errors.agentNotFound')}</div>;
    }

    const userRole = user ? await getUserRole(supabaseClient, user.id) : null;

    const isAuthenticated = Boolean(user);
    if (!canUserAccessAgent({ accessLevel: agent.access_level, userRole, isAuthenticated })) {
        if (!isAuthenticated) {
            redirect(`/${params.locale}/auth/login`);
        }
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <h1 className="text-2xl font-bold mb-4">{t('errors.accessDenied.title')}</h1>
                <p>{t('errors.accessDenied.message')}</p>
            </div>
        );
    }
    const { data: translation } = await supabaseClient
        .from('agent_translations')
        .select('name, description')
        .eq('agent_id', agent.id)
        .eq('locale', params.locale)
        .maybeSingle();

    const { data: localePrompts } = await supabaseClient
        .from('agent_prompts')
        .select('id, locale, content, sort_order')
        .eq('agent_id', agent.id)
        .eq('locale', params.locale)
        .order('sort_order', { ascending: true });

    let prompts = localePrompts ?? [];

    if ((!prompts || prompts.length === 0) && params.locale !== defaultLocale) {
        const { data: fallbackPrompts } = await supabaseClient
            .from('agent_prompts')
            .select('id, locale, content, sort_order')
            .eq('agent_id', agent.id)
            .eq('locale', defaultLocale)
            .order('sort_order', { ascending: true });

        prompts = fallbackPrompts ?? [];
    }

    const localizedAgent: Agent = {
        ...agent,
        name: translation?.name ?? agent.name,
        description: translation?.description ?? agent.description,
    };

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
            agent={localizedAgent}
            user={user}
            conversationId={conversationId}
            initialMessages={transformedMessages}
            initialSessionId={sessionId}
            initialConversations={initialConversations}
            agentPath={params.agentPath}
            userRole={userRole}
            initialPrompts={prompts.map((prompt, index) => ({
                id: prompt.id ?? `prompt-${index}`,
                content: prompt.content,
            }))}
        />
    );
}
