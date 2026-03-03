import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getConversationHistory, getConversationMetadata, getMessagesForConversation } from '@/lib/actions/chat';
import { fetchChatwootConversationMessages } from '@/lib/chatwoot/api';
import { canUserAccessAgent } from '@/lib/agents/access';
import ChatLayout from '@/components/chat-layout';
import { Agent } from '@/components/chat-interface';
import { ChatContextProvider } from '@/lib/chat-context';
import { randomUUID } from 'crypto';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { defaultLocale } from '@/i18n/config';
import type { Conversation } from '@/lib/actions/chat';

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
    const [translationResult, localePromptsResult, initialConversationsResult, conversationDataResult, fallbackPromptsResult] = await Promise.all([
        supabaseClient
            .from('agent_translations')
            .select('name, description')
            .eq('agent_id', agent.id)
            .eq('locale', params.locale)
            .maybeSingle(),
        supabaseClient
            .from('agent_prompts')
            .select('id, locale, content, sort_order')
            .eq('agent_id', agent.id)
            .eq('locale', params.locale)
            .order('sort_order', { ascending: true }),
        conversationId && user
            ? getConversationHistory(user.email!, agent.id, { limit: 10 })
            : Promise.resolve(undefined),
        conversationId && user
            ? (agent.chatwoot_inbox_identifier
                ? getConversationMetadata(conversationId, user.email!)
                : getMessagesForConversation(conversationId, user.email!))
            : Promise.resolve(null),
        params.locale !== defaultLocale
            ? supabaseClient
                .from('agent_prompts')
                .select('id, locale, content, sort_order')
                .eq('agent_id', agent.id)
                .eq('locale', defaultLocale)
                .order('sort_order', { ascending: true })
            : Promise.resolve(null),
    ]);

    const translation = translationResult.data;
    const localePrompts = localePromptsResult.data;

    let prompts = localePrompts ?? [];

    if ((!prompts || prompts.length === 0) && fallbackPromptsResult && 'data' in fallbackPromptsResult) {
        prompts = fallbackPromptsResult.data ?? [];
    }

    const localizedAgent: Agent = {
        ...agent,
        name: translation?.name ?? agent.name,
        description: translation?.description ?? agent.description,
    };

    const initialConversations: Conversation[] | undefined = initialConversationsResult;

    let initialMessages: any[] = [];
    let sessionId: string | null = null;
    let initialChatwootConversationId: string | null = null;

    if (conversationDataResult) {
        if (agent.chatwoot_inbox_identifier) {
            // conversationDataResult is metadata from getConversationMetadata
            const metadata = conversationDataResult as { sessionId: string | null; chatwootConversationId: string | null };
            sessionId = metadata.sessionId;
            initialChatwootConversationId = metadata.chatwootConversationId;
        } else {
            // conversationDataResult is messages from getMessagesForConversation
            const conversationData = conversationDataResult as { messages: any[]; sessionId: string | null; chatwootConversationId: string | null };
            initialMessages = conversationData.messages;
            sessionId = conversationData.sessionId;
            initialChatwootConversationId = conversationData.chatwootConversationId ?? null;
        }
    }

    let transformedMessages = initialMessages.map((message, index) => ({
        id: `${conversationId}-${index}`,
        content: message.data.content,
        sender: message.type === 'human' ? 'user' as const : 'agent' as const,
        timestamp: new Date(),
        agentId: agent.id,
        conversationId,
    }));

    if (agent.chatwoot_inbox_identifier && conversationId && user) {
        if (initialChatwootConversationId) {
            const chatwootConversationId = initialChatwootConversationId;
            const chatwootMessages = await fetchChatwootConversationMessages(chatwootConversationId);

            if (chatwootMessages.length > 0) {
                transformedMessages = chatwootMessages
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                    .map((message) => ({
                        id: `${chatwootConversationId}-${message.id}`,
                        content: message.content,
                        sender: message.sender,
                        timestamp: message.createdAt,
                        agentId: agent.id,
                        conversationId,
                        attachments:
                            message.attachments.length > 0
                                ? message.attachments.map((attachment) => ({
                                    name: attachment.name,
                                    type: attachment.type,
                                    url: attachment.url,
                                    size: attachment.size,
                                  }))
                                : undefined,
                        audioUrl: message.audioUrl ?? undefined,
                    }));
            }
        }

        if (transformedMessages.length === 0) {
            const fallbackData = await getMessagesForConversation(conversationId, user.email!);
            sessionId = sessionId ?? fallbackData.sessionId;
            initialChatwootConversationId = initialChatwootConversationId ?? fallbackData.chatwootConversationId;

            transformedMessages = fallbackData.messages.map((message, index) => ({
                id: `${conversationId}-${index}`,
                content: message.data.content,
                sender: message.type === 'human' ? 'user' as const : 'agent' as const,
                timestamp: new Date(),
                agentId: agent.id,
                conversationId,
            }));
        }
    }

    return (
        <ChatContextProvider initialConversationId={conversationId}>
            <ChatLayout
                agent={localizedAgent}
                user={user}
                initialConversationId={conversationId}
                initialMessages={transformedMessages}
                initialSessionId={sessionId}
                initialChatwootConversationId={agent.chatwoot_inbox_identifier ? (initialChatwootConversationId ?? null) : null}
                initialConversations={initialConversations}
                agentPath={params.agentPath}
                userRole={userRole}
                initialPrompts={prompts.map((prompt, index) => ({
                    id: prompt.id ?? `prompt-${index}`,
                    content: prompt.content,
                }))}
            />
        </ChatContextProvider>
    );
}
